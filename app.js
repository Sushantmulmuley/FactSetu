/* Facts-Only MF Assistant — retrieval + intent logic
   No LLM call at runtime: this is a small, auditable rule-based
   retriever over a fixed JSON corpus (schemes.json), so every
   answer is traceable to one official source URL. This satisfies
   the "small-corpus retrieval with accurate citations" requirement
   without risking hallucinated facts or figures.
*/

const EDU_LINK = "https://www.hdfcfund.com/learners-corner/beginner/what-are-elss-mutual-funds";

let CORPUS = null;
let lastSchemeId = null; // session-only memory of the last scheme discussed
let fallbackStreak = 0;  // consecutive "couldn't understand" replies
let corpusFailed = false; // fetch fails when index.html is opened as a file:// URL

async function loadCorpus() {
  const res = await fetch("data/schemes.json?v=3", { cache: "no-cache" });
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
  /\bhow much (return|profit)\b/i,
  /\bwill (it|this fund) (grow|perform|give)/i,
  /\bcompare (returns|performance)\b/i,
  /\boutperform/i,
  /\bguarantee/i,
  /\bsure shot\b/i,
  /\bgood (option|fund|choice|investment|pick)\b/i,
  /\bis (this|it) (a )?good\b/i,
  /\bshould (i|we) (go|opt|choose|pick|invest)/i,
  /\bwhich (one )?(should|to) (i|we) (pick|choose|go for|invest)/i,
  /\bis it (safe|risky) to invest\b/i,
  /\bwhat.?s? (better|best)\b/i,
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
    const rows = schemesMentioned
      .map((s) => {
        const f = s.facts[intent];
        return f ? `${s.name}: ${f.value}` : `${s.name}: not available`;
      })
      .join("\n");
    const firstLink = schemesMentioned.find((s) => s.facts[intent])?.facts[intent]?.source || null;
    fallbackStreak = 0;
    lastSchemeId = schemesMentioned[schemesMentioned.length - 1].id;
    return {
      text: `${INTENT_LABELS[intent]} —\n${rows}\nLast updated from sources: ${formatDate()}.`,
      link: firstLink,
      kind: "fact",
      head: `${INTENT_LABELS[intent]} compared`,
      rows: schemesMentioned.map((s) => ({ name: s.name, value: s.facts[intent] ? s.facts[intent].value : "not available" })),
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
    const items = intents
      .filter((k) => scheme.facts[k])
      .map((k) => ({ intent: k, head: INTENT_LABELS[k], value: scheme.facts[k].value, link: scheme.facts[k].source }));
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
  expense_ratio: "The expense ratio of {s} is {v}{n}.",
  exit_load: "For {s}, the exit load is {v}.",
  min_sip: "You can start an SIP in {s} with {v}.",
  lockin: "On lock-in for {s}: {v}",
  riskometer: "{s} is rated {v} on the SEBI riskometer.",
  benchmark: "{s} is benchmarked against {v}{n}.",
};
// Plain-language explanation of each term, shown after the verified value.
// General definitions only: every scheme-specific figure still comes from the corpus.
const EXPLAIN = {
  expense_ratio: "The expense ratio is the yearly fee a fund charges to manage your money, shown as a percentage of what you have invested. It's taken out of the fund's assets, so it's already reflected in the NAV rather than billed to you separately. Direct plans usually cost less than regular plans because they don't include a distributor's commission.",
  exit_load: "An exit load is a fee charged when you redeem or switch out of a fund before a set period. It's worked out on the amount you take out, and for an SIP each instalment counts from its own allotment date.",
  min_sip: "This is the smallest amount you can put in each SIP instalment. You can invest more than the minimum if you want to, and you choose the amount and date when you register the SIP.",
  lockin: "A lock-in is a period during which you can't redeem or switch your units. ELSS funds carry a statutory 3-year lock-in linked to the Section 80C deduction, and with an SIP each instalment is locked for 3 years from its own date. Other equity funds usually have no lock-in, though an exit load can still apply.",
  riskometer: "The riskometer is SEBI's six-level risk scale: Low, Low to Moderate, Moderate, Moderately High, High and Very High. Every mutual fund has to show it on its documents so you can see how risky the scheme is to your principal, and it's reviewed as the portfolio changes.",
  benchmark: "A benchmark is the market index a fund's performance is measured against. It tells you which part of the market the fund is compared with; it doesn't mean the fund copies that index.",
};

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
function sentence(tpl, scheme, value) {
  const [fig, note] = splitFigure(value);
  const p = el("p", "reply-text");
  tpl.split(/(\{s\}|\{v\}|\{n\})/).forEach((part) => {
    if (part === "{s}") p.append(scheme);
    else if (part === "{v}") p.append(el("strong", null, fig));
    else if (part === "{n}") { if (note) p.append(` (${note})`); }
    else p.append(part);
  });
  return p;
}

// Up to three follow-up questions that stay inside what the desk can answer.
function suggestions(res) {
  const out = [];
  const schemes = CORPUS ? CORPUS.schemes : [];
  const current = res.schemeId ? schemes.find((s) => s.id === res.schemeId)
    : lastSchemeId ? schemes.find((s) => s.id === lastSchemeId) : null;
  if (res.kind === "fact" && res.intent && current) {
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

function sourceLine(link, label, asOf) {
  const fn = el("div", "footnote");
  const a = el("a", "source-link", sourceDomain(link));
  a.href = link;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.insertAdjacentHTML("beforeend", LINK_ICON);
  a.setAttribute("aria-label", `${sourceDomain(link)} (official source, opens in a new tab)`);
  if (label) fn.append(el("span", "mk", label), "Source: ", a, el("span", null, `· last updated from sources ${asOf}`));
  else fn.append(el("span", null, "Read instead:"), a);
  return fn;
}

// Plain-text version of a reply for the clipboard: the sentences, then each source.
function copyText(msg, links) {
  const clone = msg.cloneNode(true);
  clone.querySelectorAll("sup, .footnote, .actions").forEach((n) => n.remove());
  const words = [...clone.querySelectorAll(".reply-text, .compare tr")]
    .map((n) => n.innerText.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [...new Set(words)].join("\n") + "\n" + links.map((l) => `Source: ${l}`).join("\n");
}

function copyButton(msg, links, asOf) {
  const row = el("div", "actions");
  const b = el("button", "copy-btn", "Copy answer");
  b.type = "button";
  b.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyText(msg, links) + `\nLast updated from sources: ${asOf}`);
      b.textContent = "Copied";
    } catch (e) {
      b.textContent = "Couldn't copy. Select the text instead.";
    }
    setTimeout(() => (b.textContent = "Copy answer"), 2000);
  });
  row.append(b);
  return row;
}

function renderAnswer(body, res, n, replay) {
  const kind = res.kind || "fallback";
  const cited = kind === "fact" && res.link;
  const reply = el("div", `reply reply--${kind}`);

  const who = el("div", "who");
  const av = el("span", "avatar");
  av.innerHTML = BOT_MARK;
  const k = el("span", `kind kind--${kind}`);
  k.innerHTML = `<svg viewBox="0 0 12 12" fill="none" aria-hidden="true">${KIND_ICONS[kind]}</svg>`;
  k.append(KIND_LABELS[kind]);
  who.append(av, el("b", null, "FactSetu"), k);
  reply.append(who);

  const msg = el("div", "msg");
  const facts = []; // [intent, value, footnote label] landing in the key-facts table
  const sources = []; // [link, footnote label]

  if (res.items) {
    msg.append(el("p", "reply-text", `Here ${res.items.length === 2 ? "are both" : "are all " + res.items.length} for ${res.scheme}, each from its own source:`));
    const list = el("div", "fact-list");
    res.items.forEach((it, i) => {
      const label = `${n}${"abcdef"[i]}`;
      const p = sentence(PHRASES[it.intent] || "{s}: {v}{n}.", res.scheme, it.value);
      p.append(mark(label));
      list.append(p);
      facts.push([it.intent, it.value, label]);
      sources.push([it.link, label]);
    });
    msg.append(list);
  } else if (res.value) {
    const lead = sentence(PHRASES[res.intent] || "{s}: {v}{n}.", res.scheme, res.value);
    if (cited) lead.append(mark(n));
    msg.append(lead);
    if (EXPLAIN[res.intent]) msg.append(el("p", "reply-text explain", EXPLAIN[res.intent]));
    if (res.intent && res.schemeId) facts.push([res.intent, res.value, String(n)]);
    if (res.link) sources.push([res.link, cited ? String(n) : null]);
  } else if (res.rows) {
    msg.append(el("p", "reply-text", `Here is the ${res.head.replace(/ compared$/, "").toLowerCase()} for each scheme, side by side. This compares documented charges and terms only, not performance.`));
    const t = el("table", "compare");
    res.rows.forEach((r) => {
      const tr = el("tr");
      const [fig, note] = splitFigure(r.value);
      const td = el("td", null, fig);
      if (note) td.append(el("small", null, note));
      tr.append(el("th", null, r.name), td);
      t.append(tr);
    });
    msg.append(t);
    const intent = Object.keys(INTENT_LABELS).find((k) => `${INTENT_LABELS[k]} compared` === res.head);
    if (EXPLAIN[intent]) msg.append(el("p", "reply-text explain", EXPLAIN[intent]));
    if (res.link) sources.push([res.link, String(n)]);
  } else {
    const p = el("p", "reply-text", res.body || res.text);
    if (cited) p.append(mark(n));
    msg.append(p);
    if (res.link) sources.push([res.link, cited ? String(n) : null]);
  }

  sources.forEach(([link, label]) => msg.append(sourceLine(link, label, res.asOf)));
  if (cited && isStale(res.asOf)) {
    msg.append(el("p", "stale", `These figures were last checked on ${res.asOf}, more than a month ago. They may have changed, so confirm them on the source.`));
  }
  if (cited) msg.append(copyButton(msg, sources.map(([l]) => l), res.asOf));
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
  if (next.length) {
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
    <h3>Ask for one fact. Get its source.</h3>
    <p>Answers come from the schemes' own documents (factsheets, KIM and SID) and SEBI and AMFI pages. Each answer names its source and date. Nothing here is advice.</p>
    <div class="try">
      <button type="button" data-q="Expense ratio of HDFC Flexi Cap Fund?">Expense ratio of HDFC Flexi Cap Fund</button>
      <button type="button" data-q="Expense ratio and exit load of HDFC Mid Cap Fund">Expense ratio and exit load of Mid Cap</button>
      <button type="button" data-q="Compare expense ratio of HDFC Large Cap and Flexi Cap">Compare two expense ratios</button>
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
