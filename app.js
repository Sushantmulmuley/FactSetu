/* Facts-Only MF Assistant — retrieval + intent logic
   No LLM call at runtime: this is a small, auditable rule-based
   retriever over a fixed JSON corpus (schemes.json), so every
   answer is traceable to one official source URL. This satisfies
   the "small-corpus retrieval with accurate citations" requirement
   without risking hallucinated facts or figures.
*/

const EDU_LINK = "https://www.amfiindia.com/investor";
const FACTSHEET_LINK = "https://files.hdfcfund.com/s3fs-public/2026-07/HDFC%20MF%20Factsheet%20-%20June%202026.pdf";

let CORPUS = null;
let lastSchemeId = null; // session-only memory of the last scheme discussed
let fallbackStreak = 0;  // consecutive "couldn't understand" replies
let corpusFailed = false; // fetch fails when index.html is opened as a file:// URL

async function loadCorpus() {
  const res = await fetch("data/schemes.json?v=4", { cache: "no-cache" });
  CORPUS = await res.json();
}

// ---- Refusal detection: opinion / advice / comparison-of-returns questions ----
const ADVICE_PATTERNS = [
  /\bshould i\b/i,
  /\bwhich (is|fund is|one is) better\b/i,
  /\bbetter (fund|option|choice)\b/i,
  /\bbest fund\b/i,
  /\brecommend/i,
  /\bworth (buying|investing|it)\b/i,
  /\bbuy or sell\b/i,
  /\bsell\b.*\bnow\b/i,
  /\bguarantee/i,
  /\bsure shot\b/i,
  /\bgood (option|fund|choice|investment|pick)\b/i,
  /\bis (this|it) (a )?good\b/i,
  /\bshould (i|we) (go|opt|choose|pick|invest)/i,
  /\bwhich (one )?(should|to) (i|we) (pick|choose|go for|invest)/i,
  /\bis it (safe|risky) to invest\b/i,
  /\bwhat.?s? (better|best)\b/i,
];

// Returns / performance: never computed or compared here; the official factsheet has them.
const PERFORMANCE_PATTERNS = [
  /\breturns?\b/i,
  /\bperform(ance|ed|ing|s)?\b/i,
  /\boutperform/i,
  /\b(cagr|xirr)\b/i,
  /\bprofit\b/i,
  /\bwill (it|this fund) (grow|give)/i,
  /\bnav\b.*\b(grow|growth|history|trend)\b/i,
];

// PII patterns — never accept/store these; refuse and warn instead
const PII_PATTERNS = [
  /\b[A-Z]{5}[0-9]{4}[A-Z]\b/,      // PAN
  /\b\d{4}\s?\d{4}\s?\d{4}\b/,       // Aadhaar-like grouping
  /\b\d{6}\b.*\botp\b/i,
  /\botp\b/i,
  /\b(account no|acc no|a\/c no)\b/i,
  /\b\d{9,18}\b/,                   // long account-number-like digit runs
  /[\w.+-]+@[\w-]+\.[\w.-]+/,       // email
  /\b\d{10}\b/,                     // 10-digit phone
];

// ---- Intent keyword map ----
const INTENTS = [
  { key: "expense_ratio", patterns: [/expense ratio/i, /\bter\b/i, /total expense/i, /charges?\b/i, /fees?\b/i, /how much does it cost/i, /\bcost of (the |this )?fund\b/i] },
  { key: "exit_load", patterns: [/exit load/i, /redemption charge/i, /redeem.*charge/i, /charge.*(exit|redeem)/i, /withdraw(al|ing)?\b.*\b(charge|fee|penalty)/i, /(charge|fee|penalty).*withdraw/i, /early (exit|redemption|withdrawal)/i, /\bpenalty\b/i] },
  { key: "min_sip", patterns: [/min(imum)?\s*sip/i, /sip amount/i, /start.*sip.*with/i, /how much.*(start|invest).*sip/i, /minimum (investment|amount)/i, /smallest sip/i, /least (amount|sip)/i, /sip.*(starts?|begins?) (at|from)/i] },
  { key: "lockin", patterns: [/lock[\s-]?in/i, /lockin/i, /\blocked\b/i, /\block period\b/i, /how long .*\b(hold|stay|keep)\b/i] },
  { key: "riskometer", patterns: [/riskometer/i, /risk[\s-]?o[\s-]?meter/i, /risk level/i, /how risky/i, /risk (rating|category|grade|label)/i] },
  { key: "benchmark", patterns: [/benchmark/i, /compared? (to|against) which index/i, /tracks? which index/i, /which index/i, /index .*\b(track|follow)s?\b/i, /\b(track|follow)s? (an?|the) index/i] },
  { key: "kim", patterns: [/\bkim\b/i, /key information memorandum/i] },
  { key: "sid", patterns: [/\bsid\b/i, /scheme information document/i] },
];

const INTENT_LABELS = {
  expense_ratio: "Expense ratio",
  exit_load: "Exit load",
  min_sip: "Minimum SIP",
  lockin: "Lock-in",
  riskometer: "Riskometer",
  benchmark: "Benchmark",
  kim: "KIM",
  sid: "SID",
};

// Words the matcher knows. A near-miss ("expence", "flexy", "benchmrk") is
// corrected to the closest of these before matching; anything else is left alone.
const VOCAB = [
  "expense", "ratio", "charges", "exit", "load", "redemption", "withdrawal", "penalty",
  "minimum", "lockin", "locked", "riskometer", "benchmark", "index", "statement", "capital",
  "gains", "download", "compare", "versus", "difference", "flexi", "large", "saver", "saving", "hdfc", "fund", "funds", "scheme",
];

// Optimal-string-alignment distance: edits, with a swap of neighbours counting as one.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

function correctTypos(q) {
  return q.replace(/[a-z]{5,}/gi, (w) => {
    const lw = w.toLowerCase();
    if (VOCAB.includes(lw)) return w;
    const max = lw.length >= 8 ? 2 : 1;
    let best = null, bestD = max + 1;
    for (const v of VOCAB) {
      if (Math.abs(v.length - lw.length) > max) continue;
      const dist = editDistance(lw, v);
      if (dist < bestD) { best = v; bestD = dist; }
    }
    return best || w;
  });
}

// Every scheme fact asked for, in table order. "Charges"/"fees" only count as
// expense ratio when the question isn't already about the exit load.
function detectIntents(q) {
  const hits = INTENTS.filter((it) => it.key !== "kim" && it.key !== "sid" && it.patterns.some((p) => p.test(q))).map((it) => it.key);
  if (hits.includes("exit_load") && hits.includes("expense_ratio") && !/expense ratio|\bter\b|total expense/i.test(q)) {
    hits.splice(hits.indexOf("expense_ratio"), 1);
  }
  return hits;
}

// Normalizes text for matching so "flexicap"/"flexi-cap"/"flexi cap" all hit.
function normalize(s) {
  return s.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

function detectSchemes(q) {
  const lower = normalize(q);
  const found = [];
  for (const s of CORPUS.schemes) {
    const names = [s.name.toLowerCase(), ...s.aliases].map(normalize);
    if (names.some((n) => lower.includes(n))) found.push(s);
  }
  return found;
}

function detectIntent(q) {
  for (const intent of INTENTS) {
    if (intent.patterns.some((p) => p.test(q))) return intent.key;
  }
  if (/statement|capital gain|download.*(statement|report)|tax document/i.test(q)) return "statement_download";
  if (/what (is|does) (the )?riskometer (mean|show)/i.test(q)) return "riskometer_meaning";
  return null;
}

// Value-shaped personal data, masked before a question is shown or kept.
const MASK_PATTERNS = [
  /\b[A-Z]{5}[0-9]{4}[A-Z]\b/gi,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
  /\b\d{6,18}\b/g,
];

function maskPII(text) {
  return MASK_PATTERNS.reduce(
    (t, p) => t.replace(p, (m) => m[0] + m.slice(1, -1).replace(/[^\s@.]/g, "•") + m[m.length - 1]),
    text
  );
}

function containsPII(q) {
  return PII_PATTERNS.some((p) => p.test(q));
}

function isAdviceQuestion(q) {
  return ADVICE_PATTERNS.some((p) => p.test(q));
}

function isCompareRequest(q) {
  return /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b/i.test(q);
}

function formatDate() {
  return CORPUS.last_updated_from_sources;
}

const FALLBACK_VARIANTS = [
  (topics) => `I can only answer fixed factual questions — ${topics} — for one of the 4 HDFC schemes. Try a quick question, or ask e.g. "Expense ratio of HDFC Large Cap Fund?"`,
  (topics) => `That's outside what I can look up — I'm scoped to ${topics}. Tap a quick question, or name a scheme and one of those terms.`,
  (topics) => `I don't have a fact-lookup for that. I can tell you the ${topics} for any of the 4 HDFC schemes — which one would help?`,
];

function fallbackReply() {
  const topics = "expense ratio, exit load, minimum SIP, ELSS lock-in, riskometer, benchmark, or statement downloads";
  const variant = FALLBACK_VARIANTS[Math.min(fallbackStreak, FALLBACK_VARIANTS.length - 1)];
  fallbackStreak++;
  return { text: variant(topics), link: null, kind: "fallback" };
}

function answer(query) {
  const q = query.trim();
  if (!q) {
    return { text: "Ask a factual question about one of the 4 HDFC schemes — e.g. expense ratio, exit load, minimum SIP, ELSS lock-in, riskometer, benchmark, or how to download a statement.", link: null, kind: "fallback" };
  }

  if (containsPII(q)) {
    return {
      text: "I can't accept or store PAN, Aadhaar, account numbers, OTPs, emails, or phone numbers. Please re-ask your question without that information.",
      link: null,
      kind: "blocked",
    };
  }

  if (isAdviceQuestion(q)) {
    fallbackStreak = 0;
    return {
      text: `That's an opinion / investment-advice question, and this assistant only answers verified facts — it can't tell you whether to buy, sell, or which fund is "better". For how to think about choosing a fund, see this educational page.`,
      link: EDU_LINK,
      kind: "refuse",
    };
  }

  const fixed = correctTypos(q);
  const intents = detectIntents(fixed);
  if (PERFORMANCE_PATTERNS.some((p) => p.test(q))) {
    fallbackStreak = 0;
    return {
      text: "I don't calculate or compare returns or performance, because those aren't facts I can verify from a fixed source. HDFC Mutual Fund's official monthly factsheet lists each scheme's performance figures.",
      link: FACTSHEET_LINK,
      kind: "refuse",
      label: "Not answered: performance",
      linkLabel: "Official factsheet",
    };
  }

  const intent = intents[0] || detectIntent(fixed);
  const schemesMentioned = detectSchemes(fixed);

  if (intent === "statement_download") {
    fallbackStreak = 0;
    const g = CORPUS.general.statement_download;
    return { text: `${g.value} Last updated from sources: ${formatDate()}.`, link: g.source, kind: "fact", head: "Capital-gains statement", body: g.value, asOf: formatDate() };
  }
  if (intent === "riskometer_meaning" && schemesMentioned.length === 0) {
    fallbackStreak = 0;
    const g = CORPUS.general.riskometer_meaning;
    return { text: `${g.value} Last updated from sources: ${formatDate()}.`, link: g.source, kind: "fact", head: "What the riskometer means", body: g.value, asOf: formatDate() };
  }

  // Factual side-by-side comparison of ONE fact across TWO+ named schemes
  // (still facts, never returns/performance — those stay refused above).
  if (isCompareRequest(q) && schemesMentioned.length >= 2) {
    if (!intent) {
      fallbackStreak = 0;
      const names = schemesMentioned.map((s) => s.name).join(" and ");
      return {
        text: `Happy to compare facts side by side. Which one: expense ratio, exit load, minimum SIP, lock-in, riskometer, or benchmark?`,
        link: null,
        kind: "fallback",
        choices: ["expense_ratio", "exit_load", "min_sip", "lockin", "riskometer", "benchmark"].map((k) => ({
          label: INTENT_LABELS[k],
          q: `Compare ${INTENT_LABELS[k].toLowerCase()} of ${names}`,
        })),
      };
    }
    // One accurate citation per answer: each scheme's value comes back as its own answer.
    const parts = schemesMentioned.filter((s) => s.facts[intent]).map((s) => factResult(s, intent));
    fallbackStreak = 0;
    lastSchemeId = schemesMentioned[schemesMentioned.length - 1].id;
    return {
      text: parts.map((r) => r.text).join("\n"),
      kind: "fact",
      split: parts,
    };
  }

  // A scheme named with no specific fact ("what is HDFC Mid Cap Fund?"): a short overview
  // from facts that share the scheme's one source page.
  if (!intent && schemesMentioned.length === 1) {
    const scheme = schemesMentioned[0];
    const keys = ["benchmark", "riskometer", "min_sip"].filter((k) => scheme.facts[k]);
    const link = scheme.facts[keys[0]].source;
    const items = keys
      .filter((k) => scheme.facts[k].source === link)
      .map((k) => ({ intent: k, head: INTENT_LABELS[k], value: scheme.facts[k].value, link }));
    fallbackStreak = 0;
    lastSchemeId = scheme.id;
    return {
      text: items.map((it) => `${it.head} of ${scheme.name}: ${it.value}.`).join(" ") + ` Last updated from sources: ${formatDate()}.`,
      link,
      kind: "fact",
      head: "Overview",
      overview: true,
      schemeId: scheme.id,
      scheme: scheme.name,
      items,
      asOf: formatDate(),
    };
  }

  if (!intent) {
    return fallbackReply();
  }

  // Use the scheme named in this message, or fall back to the last one
  // discussed in this session so short follow-ups ("and exit load?") work.
  let scheme = schemesMentioned[0] || null;
  if (!scheme && lastSchemeId) {
    scheme = CORPUS.schemes.find((s) => s.id === lastSchemeId) || null;
  }

  if (!scheme) {
    const asked = (intents.length ? intents : [intent]).map((k) => INTENT_LABELS[k]);
    const phrase = asked.length > 1 ? `${asked.slice(0, -1).join(", ")} and ${asked[asked.length - 1].toLowerCase()}` : asked[0];
    return {
      text: `Which scheme do you mean? Pick one below, or name it in your question.`,
      link: null,
      kind: "fallback",
      choices: CORPUS.schemes.map((s) => ({ label: s.name, q: `${phrase} of ${s.name}?` })),
    };
  }

  // Several facts about one scheme in one question: answer each, each with its own source.
  if (intents.length > 1) {
    // One citation per answer: keep the facts that share the first fact's source (max 3);
    // the rest are offered as follow-up questions.
    const avail = intents.filter((k) => scheme.facts[k]);
    const firstSource = scheme.facts[avail[0]].source;
    const items = avail
      .filter((k) => scheme.facts[k].source === firstSource)
      .slice(0, 3)
      .map((k) => ({ intent: k, head: INTENT_LABELS[k], value: scheme.facts[k].value, link: firstSource }));
    const more = avail.filter((k) => !items.some((it) => it.intent === k));
    fallbackStreak = 0;
    lastSchemeId = scheme.id;
    return {
      text: items.map((it) => `${it.head} of ${scheme.name}: ${it.value}.`).join(" ") + ` Last updated from sources: ${formatDate()}.`,
      link: items[0].link,
      kind: "fact",
      head: "Key facts",
      schemeId: scheme.id,
      scheme: scheme.name,
      items,
      more,
      asOf: formatDate(),
    };
  }

  const fact = scheme.facts[intent];
  if (!fact) {
    return {
      text: `I don't have a verified answer for that on ${scheme.name} in my current source set. Please check the scheme's official KIM/SID instead.`,
      link: null,
      kind: "fallback",
    };
  }

  fallbackStreak = 0;
  lastSchemeId = scheme.id;
  return factResult(scheme, intent);
}

function factResult(scheme, intent) {
  const fact = scheme.facts[intent];
  return {
    text: `${INTENT_LABELS[intent]} of ${scheme.name}: ${fact.value}. Last updated from sources: ${formatDate()}.`,
    link: fact.source,
    kind: "fact",
    head: INTENT_LABELS[intent],
    intent,
    schemeId: scheme.id,
    scheme: scheme.name,
    value: fact.value,
    asOf: formatDate(),
  };
}

// ---- UI wiring ----
function sourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "source";
  }
}

// Answer kind -> label shown on each answer.
const KIND_LABELS = {
  fact: "Verified fact",
  refuse: "Not answered: advice",
  blocked: "Blocked: personal data",
  fallback: "Couldn’t match a fact",
};
const KIND_ICONS = {
  fact: `<path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`,
  refuse: `<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 9l6-6" stroke="currentColor" stroke-width="1.5"/>`,
  blocked: `<rect x="2.5" y="5.5" width="7" height="5" stroke="currentColor" stroke-width="1.5"/><path d="M4 5.5V4a2 2 0 014 0v1.5" stroke="currentColor" stroke-width="1.5"/>`,
  fallback: `<path d="M4.3 4.3a1.8 1.8 0 113 1.4c-.8.5-1.3.9-1.3 1.8M6 9.5v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
};
const LINK_ICON = `<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4.5 2.5H2.5v7h7v-2M7 2.5h2.5V5M9.5 2.5L5.5 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let entryCount = 0;
const known = {}; // "schemeId|intent" -> { value, n } for the key-facts table

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function mark(n) {
  const s = el("sup", null, String(n));
  s.setAttribute("aria-label", `source ${n}`);
  return s;
}

// Splits "1.03% (Direct Plan, Total Expense Ratio)" into a figure and its note.
function splitFigure(value) {
  const m = value.match(/^([^(]+?)\s*(\(.+\))$/);
  return m ? [m[1], m[2].slice(1, -1)] : [value, ""];
}

// How each fact is phrased in the reply. {s} = scheme, {v} = value (bold), {n} = value note.
const PHRASES = {
  expense_ratio: "Sure — the expense ratio of {s} is {v}{n}.",
  exit_load: "For {s}, the exit load is {v}.",
  min_sip: "You can start an SIP in {s} with as little as {v}.",
  lockin: "Here's the lock-in position for {s}: {v}",
  riskometer: "{s} is rated {v} on the SEBI riskometer.",
  benchmark: "{s} is benchmarked against {v}{n}.",
};

// One plain-language sentence on what the term means, shown between the answer and its source.
// General investor-education wording; every scheme-specific figure still comes from the cited page.
const EXPLAIN = {
  expense_ratio: "The expense ratio is the yearly fee the fund charges to manage your money, shown as a percentage of your investment, and it's already reflected in the NAV rather than billed to you separately.",
  exit_load: "An exit load is a fee charged on the amount you redeem or switch out before a set period, and for an SIP each instalment's period counts from its own allotment date.",
  min_sip: "That's the smallest amount you can put into each SIP instalment, and you're free to invest more than the minimum and pick the amount and date when you register.",
  lockin: "A lock-in is a period during which you can't redeem or switch your units; ELSS funds carry a statutory 3-year lock-in for each instalment, while other equity funds usually have none.",
  riskometer: "The riskometer is SEBI's six-level scale, from Low to Very High, that every mutual fund must display so you can see how much risk the scheme carries to your principal.",
  benchmark: "A benchmark is the market index a fund is measured against, so it tells you which part of the market the scheme is compared with, not that the fund copies that index.",
};
// Names the document a figure was taken from, so the second sentence is backed by the same one link.
function describeSource(url, scheme) {
  if (/\/direct$/.test(url)) return `the ${scheme} Direct Plan page on hdfcfund.com`;
  if (/\/regular$/.test(url)) return `the ${scheme} Regular Plan page on hdfcfund.com`;
  if (/\/KIM\//.test(url)) return `the ${scheme} Key Information Memorandum (KIM)`;
  if (/\/SID\//.test(url)) return `the ${scheme} Scheme Information Document (SID)`;
  return sourceDomain(url);
}

// ---- Reply composition (no DOM: shared by the page, check_answers.js and sample_qa.md) ----
const MAX_SENTENCES = 3; // milestone rule: answers stay at 3 sentences or fewer

function splitSentences(text) {
  return String(text).split(/(?<=[.!?])\s+(?=[A-Z(])/).filter(Boolean);
}

// One sentence as segments; bold marks the verified value.
function phraseSegments(tpl, scheme, value) {
  const [fig, note] = splitFigure(value);
  const segs = [];
  tpl.split(/(\{s\}|\{v\}|\{n\})/).forEach((part) => {
    if (part === "{s}") segs.push({ t: scheme });
    else if (part === "{v}") segs.push({ t: fig.replace(/\.\s+([A-Z])/g, (_, c) => "; " + c.toLowerCase()).replace(/\.$/, ""), b: true });
    else if (part === "{n}") { if (note) segs.push({ t: ` (${note})` }); }
    else if (part) segs.push({ t: part });
  });
  if (!/[.!?)]\s*$/.test(segs.map((x) => x.t).join(""))) segs.push({ t: "." });
  return segs;
}

// Paragraphs of a reply: [{ segs: [{t, b?}], explain?: true }]. Never more than MAX_SENTENCES.
function composeReply(res) {
  const paras = [];
  let used = 0;
  const add = (segs, explain) => {
    const n = splitSentences(segs.map((x) => x.t).join("")).length;
    if (used + n > MAX_SENTENCES) return false;
    paras.push({ segs, explain });
    used += n;
    return true;
  };
  const addText = (text, explain) => {
    const room = splitSentences(text).slice(0, MAX_SENTENCES - used).join(" ");
    if (room) add([{ t: room }], explain);
  };
  const fromSource = () => addText(`${res.items ? "These come" : "This comes"} straight from ${describeSource(res.link, res.scheme)}.`, true);
  if (res.overview) {
    const v = Object.fromEntries(res.items.map((it) => [it.intent, splitFigure(it.value)[0]]));
    const segs = [{ t: `${res.scheme} is one of the four HDFC schemes I cover.` }];
    add(segs);
    const parts = [];
    if (v.benchmark) parts.push([{ t: "it's benchmarked against " }, { t: v.benchmark, b: true }]);
    if (v.riskometer) parts.push([{ t: "rated " }, { t: v.riskometer, b: true }, { t: " on the SEBI riskometer" }]);
    if (v.min_sip) parts.push([{ t: "you can start an SIP with " }, { t: v.min_sip, b: true }]);
    const s2 = [{ t: "In short, " }];
    parts.forEach((p, i) => {
      if (i) s2.push({ t: i === parts.length - 1 ? ", and " : ", " });
      s2.push(...p);
    });
    s2.push({ t: "." });
    add(s2);
    addText(`These come straight from ${describeSource(res.link, res.scheme)}.`, true);
  } else if (res.items) {
    res.items.forEach((it) => add(phraseSegments(PHRASES[it.intent] || "{s}: {v}{n}.", res.scheme, it.value)));
    fromSource();
  } else if (res.value) {
    add(phraseSegments(PHRASES[res.intent] || "{s}: {v}{n}.", res.scheme, res.value));
    if (EXPLAIN[res.intent]) addText(EXPLAIN[res.intent], true);
    fromSource();
  } else {
    addText(res.body || res.text);
  }
  return paras;
}

// Plain text of a whole answer, in the milestone's citation format.
function replyPlainText(res) {
  if (res.split) return res.split.map(replyPlainText).join("\n\n");
  const lines = composeReply(res).map((p) => p.segs.map((x) => (x.b ? `**${x.t}**` : x.t)).join(""));
  if (res.link) lines.push(`${res.kind === "fact" ? "Source" : res.linkLabel || "Educational link"}: ${res.link}`);
  if (res.kind === "fact") lines.push(`Last updated from sources: ${res.asOf}`);
  return lines.join("\n");
}

const ASK = {
  expense_ratio: ["Expense ratio", "Expense ratio of {s}?"],
  exit_load: ["Exit load", "Exit load of {s}?"],
  min_sip: ["Minimum SIP", "Minimum SIP for {s}?"],
  lockin: ["Lock-in", "What is the lock-in for {s}?"],
  riskometer: ["Riskometer", "Riskometer of {s}?"],
  benchmark: ["Benchmark", "Benchmark of {s}?"],
};
const BOT_MARK = `<svg viewBox="8 9 32 31" fill="none" aria-hidden="true"><path d="M13 10H35a4 4 0 0 1 4 4V29a4 4 0 0 1-4 4H21L14 39V33H13a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z" fill="#fff"/><path d="M15.5 27A8.5 8.5 0 0 1 32.5 27" stroke="#0E1211" stroke-width="3.5" stroke-linecap="round"/><circle cx="32.5" cy="27" r="3.2" fill="#0A9E7B"/></svg>`;

// Builds a sentence element, with the value set in bold.
function paraEl(p) {
  const el_ = el("p", "reply-text" + (p.explain ? " explain" : ""));
  p.segs.forEach((x) => el_.append(x.b ? el("strong", null, x.t) : x.t));
  return el_;
}

// Up to three follow-up questions that stay inside what the desk can answer.
function suggestions(res) {
  const out = [];
  const schemes = CORPUS ? CORPUS.schemes : [];
  const current = res.schemeId ? schemes.find((s) => s.id === res.schemeId)
    : lastSchemeId ? schemes.find((s) => s.id === lastSchemeId) : null;
  if (res.more && res.more.length && current) {
    // Facts from a different source than this answer's single citation.
    res.more.slice(0, 3).forEach((k) => out.push([ASK[k][0], ASK[k][1].replace("{s}", current.name)]));
  } else if (res.kind === "fact" && res.intent && current) {
    const other = schemes.find((s) => s.id !== current.id);
    Object.keys(ASK)
      .filter((k) => k !== res.intent && !known[`${current.id}|${k}`])
      .slice(0, 2)
      .forEach((k) => out.push([ASK[k][0], ASK[k][1].replace("{s}", current.name)]));
    if (other && ASK[res.intent]) {
      const label = ASK[res.intent][0];
      out.push([`Compare with ${other.name.replace(/^HDFC /, "")}`, `Compare ${label.toLowerCase()} of ${current.name} and ${other.name}`]);
    }
  } else if (res.kind !== "fact") {
    const s = current ? current.name : "HDFC Flexi Cap Fund";
    out.push([`Expense ratio of ${s.replace(/^HDFC /, "")}`, `Expense ratio of ${s}?`]);
    out.push(["ELSS lock-in", "What is the lock-in for HDFC ELSS Tax Saver?"]);
    out.push(["Capital-gains statement", "How do I download my capital gains statement?"]);
  }
  return out;
}

// "26 September 2026" -> true when that date is more than 30 days ago.
function isStale(asOf) {
  const [d, mon, y] = String(asOf).split(" ");
  const t = Date.parse(`${mon} ${d}, ${y}`);
  return Number.isFinite(t) && Date.now() - t > 30 * 864e5;
}

function sourceLine(link, label, asOf, readLabel) {
  const fn = el("div", "footnote");
  const a = el("a", "source-link", sourceDomain(link));
  a.href = link;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.insertAdjacentHTML("beforeend", LINK_ICON);
  a.setAttribute("aria-label", `${sourceDomain(link)} (official source, opens in a new tab)`);
  if (label) fn.append(el("span", "mk", label), "Source: ", a, el("span", null, `· Last updated from sources: ${asOf}`));
  else fn.append(el("span", null, `${readLabel || "Read instead"}:`), a);
  return fn;
}

function copyButton(res) {
  const row = el("div", "actions");
  const b = el("button", "copy-btn", "Copy answer");
  b.type = "button";
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(replyPlainText(res).replace(/\*\*/g, ""));
      b.textContent = "Copied";
    } catch (e) {
      b.textContent = "Couldn't copy. Select the text instead.";
    }
    setTimeout(() => (b.textContent = "Copy answer"), 2000);
  });
  row.append(b);
  return row;
}

function renderAnswer(body, res, n, replay, noChips) {
  if (res.split) {
    // A comparison arrives as one short answer per scheme, each with its own source.
    res.split.forEach((part, i) => renderAnswer(body, part, `${n}${"abcd"[i]}`, replay, i < res.split.length - 1));
    return;
  }
  const kind = res.kind || "fallback";
  const cited = kind === "fact" && res.link;
  const reply = el("div", `reply reply--${kind}`);

  const who = el("div", "who");
  const av = el("span", "avatar");
  av.innerHTML = BOT_MARK;
  const k = el("span", `kind kind--${kind}`);
  k.innerHTML = `<svg viewBox="0 0 12 12" fill="none" aria-hidden="true">${KIND_ICONS[kind]}</svg>`;
  k.append(res.label || KIND_LABELS[kind]);
  who.append(av, el("b", null, "FactSetu"), k);
  reply.append(who);

  const msg = el("div", "msg");
  const facts = []; // [intent, value, footnote label] landing in the key-facts table
  const sources = []; // [link, footnote label]

  const paras = composeReply(res).map(paraEl);
  if (res.overview) {
    paras.forEach((p) => msg.append(p));
    res.items.forEach((it) => facts.push([it.intent, it.value, String(n)]));
  } else if (res.items) {
    const list = el("div", "fact-list");
    paras.slice(0, res.items.length).forEach((p) => list.append(p));
    msg.append(list);
    paras.slice(res.items.length).forEach((p) => msg.append(p));
    res.items.forEach((it) => facts.push([it.intent, it.value, String(n)]));
  } else {
    paras.forEach((p) => msg.append(p));
    if (res.value && res.intent && res.schemeId) facts.push([res.intent, res.value, String(n)]);
  }
  if (cited) paras[res.overview ? 1 : res.items ? res.items.length - 1 : 0].append(mark(n));
  if (res.link) sources.push([res.link, cited ? String(n) : null]);

  sources.forEach(([link, label]) => msg.append(sourceLine(link, label, res.asOf, res.linkLabel)));
  if (cited && isStale(res.asOf)) {
    msg.append(el("p", "stale", `These figures were last checked on ${res.asOf}, more than a month ago. They may have changed, so confirm them on the source.`));
  }
  if (cited) msg.append(copyButton(res));
  reply.append(msg);

  // Verified single-scheme facts also land in the key-facts table.
  if (kind === "fact" && res.schemeId && facts.length) {
    facts.forEach(([intent, value, label]) => (known[`${res.schemeId}|${intent}`] = { value, n: label }));
    const fresh = facts[facts.length - 1][0];
    if (activeTab().dataset.schemeId !== res.schemeId) {
      setActiveScheme(res.schemeId, document.querySelector(`.tab[data-scheme-id="${res.schemeId}"]`), fresh);
    } else {
      paintTable(fresh);
    }
  }

  const next = res.choices
    ? res.choices.map((c) => [c.label, c.q])
    : suggestions(res.items ? { ...res, intent: res.items[res.items.length - 1].intent } : res);
  if (next.length && !noChips) {
    const chips = el("div", "chips");
    chips.append(el("span", "chips-label", res.choices ? "Choose one" : "You could also ask"));
    next.forEach(([label, q]) => {
      const b = el("button", "chip", label);
      b.type = "button";
      b.addEventListener("click", () => handleSend(q));
      chips.append(b);
    });
    reply.append(chips);
  }

  body.appendChild(reply);
  if (!replay) reply.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function emptyLog() {
  const chat = document.getElementById("chat");
  chat.innerHTML = `<div class="empty-hint">
    <h3>Welcome to FactSetu</h3>
    <p>Ask a factual question about HDFC Large Cap, Flexi Cap, ELSS Tax Saver or Mid Cap Fund. Every answer cites one official AMC, SEBI or AMFI source. Facts-only. No investment advice.</p>
    <div class="try">
      <button type="button" data-q="Expense ratio of HDFC Flexi Cap Fund?">Expense ratio of HDFC Flexi Cap Fund?</button>
      <button type="button" data-q="What is the lock-in for HDFC ELSS Tax Saver?">ELSS lock-in?</button>
      <button type="button" data-q="How do I download my capital gains statement?">How to download capital-gains statement?</button>
    </div>
  </div>`;
  chat.querySelectorAll(".try button").forEach((b) => b.addEventListener("click", () => handleSend(b.dataset.q)));
}

// ---- Session memory: survives a reload of this tab, never leaves the browser ----
const SESSION_KEY = "factsetu-session";
let log = []; // [{ q, res }] — q is already masked

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ log, lastSchemeId, fallbackStreak }));
  } catch (e) { /* storage blocked: the conversation just won't survive a reload */ }
}

function restoreSession() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch (e) { return; }
  if (!saved || !saved.log || !saved.log.length) return;
  document.querySelector(".empty-hint")?.remove();
  saved.log.forEach(({ q, res }) => renderAnswer(newEntry(q), res, ++entryCount, true));
  log = saved.log;
  fallbackStreak = saved.fallbackStreak || 0;
  const tab = document.querySelector(`.tab[data-scheme-id="${saved.lastSchemeId || ""}"]`);
  setActiveScheme(saved.lastSchemeId || null, tab);
  document.getElementById("chat").lastElementChild?.scrollIntoView({ block: "end" });
}

function newEntry(shownText) {
  const entry = el("article", "entry");
  entry.id = `entry-${entryCount + 1}`;
  const body = el("div", "entry-body");
  entry.append(body);
  body.append(el("p", "me", shownText));
  document.getElementById("chat").appendChild(entry);
  return body;
}

function handleSend(text) {
  document.querySelector(".empty-hint")?.remove();
  const shown = maskPII(text);
  const body = newEntry(shown);
  const n = ++entryCount;
  const wait = el("div", "retrieving");
  wait.append(el("i"), "Checking the official sources");
  body.append(wait);
  body.parentElement.scrollIntoView({ behavior: "smooth", block: "nearest" });

  setTimeout(() => {
    wait.remove();
    if (!CORPUS) {
      const msg = corpusFailed
        ? "Fund data couldn't load. If you opened index.html straight from a folder, serve it instead: run python3 -m http.server in the project folder, then open http://localhost:8000."
        : "Still loading fund data. Please try again in a second.";
      renderAnswer(body, { text: msg, kind: "fallback" }, n);
      return;
    }
    const res = answer(text);
    renderAnswer(body, res, n);
    log.push({ q: shown, res });
    saveSession();
  }, 300 + Math.random() * 200);
}

function activeTab() {
  return document.querySelector(".tab[aria-pressed='true']");
}

function paintTable(freshIntent) {
  const scheme = lastSchemeId && CORPUS ? CORPUS.schemes.find((s) => s.id === lastSchemeId) : null;
  document.querySelectorAll(".topic-row[data-template]").forEach((row) => {
    const tpl = row.dataset.template;
    row.dataset.q = tpl.replace("{scheme}", scheme ? scheme.name : row.dataset.default);
    if (!tpl.includes("{scheme}")) return;
    const v = row.querySelector(".v");
    const hit = scheme && known[`${scheme.id}|${row.dataset.intent}`];
    v.className = hit ? "v" : "v empty";
    v.textContent = hit ? splitFigure(hit.value)[0] : "Ask";
    if (hit) {
      const s = mark(hit.n);
      v.append(s);
      if (row.dataset.intent === freshIntent) {
        v.classList.add("fresh");
      }
    }
  });
  document.getElementById("kfScheme").innerHTML = scheme
    ? `<b>${scheme.name}</b>`
    : "Pick a scheme tab to fill this table.";
}

function setActiveScheme(schemeId, tabEl, freshIntent) {
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-pressed", String(t === tabEl)));
  lastSchemeId = schemeId; // null = overview / no scheme lock
  paintTable(freshIntent);
}

function resetChat() {
  fallbackStreak = 0;
  entryCount = 0;
  log = [];
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* nothing stored */ }
  for (const k in known) delete known[k];
  emptyLog();
  setActiveScheme(null, document.querySelector(".tab[data-scheme-id='']"));
}

// Wire up UI interaction immediately — never let a slow/failed corpus
// fetch block button clicks or form submission from working.
window.addEventListener("DOMContentLoaded", () => {
  emptyLog();
  const input = document.getElementById("query");
  document.getElementById("askForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    if (!v.trim()) return;
    handleSend(v);
    input.value = "";
    recall = -1;
  });

  // "/" jumps to the question box; ↑/↓ in it step through questions already asked.
  let recall = -1;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    input.focus();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const asked = log.map((x) => x.q);
    if (!asked.length || (input.value && asked[recall] !== input.value)) return;
    e.preventDefault();
    if (e.key === "ArrowUp") recall = recall < 0 ? asked.length - 1 : Math.max(0, recall - 1);
    else recall = recall < 0 || recall >= asked.length - 1 ? -1 : recall + 1;
    input.value = recall < 0 ? "" : asked[recall];
  });

  document.querySelectorAll(".topic-row").forEach((row) => {
    const activate = () => handleSend(row.dataset.q);
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activate();
      }
    });
  });
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => setActiveScheme(t.dataset.schemeId || null, t));
  });
  document.getElementById("resetChat").addEventListener("click", resetChat);
  paintTable();

  loadCorpus()
    .then(() => {
      paintTable();
      restoreSession();
      document.getElementById("asof").innerHTML =
        `Four HDFC Mutual Fund schemes · <strong>sources checked ${CORPUS.last_updated_from_sources}</strong>`;
      document.getElementById("kfAsof").textContent = `As of ${CORPUS.last_updated_from_sources}`;
    })
    .catch((err) => {
      corpusFailed = true;
      document.getElementById("kfAsof").textContent = "Fund data didn't load.";
      console.error("Failed to load schemes.json", err);
    });
});
