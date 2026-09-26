/* Facts-Only MF Assistant — retrieval + intent logic
   No LLM call at runtime: this is a small, auditable rule-based
   retriever over a fixed JSON corpus (schemes.json), so every
   answer is traceable to one official source URL. This satisfies
   the "small-corpus retrieval with accurate citations" requirement
   without risking hallucinated facts or figures.
*/

const EDU_LINK = "https://www.hdfcfund.com/learners-corner/beginner/what-are-elss-mutual-funds";
const DISCLAIMER = "Facts-only. No investment advice.";

let CORPUS = null;

async function loadCorpus() {
  const res = await fetch("data/schemes.json");
  CORPUS = await res.json();
}

// ---- Refusal detection: opinion / advice / comparison-of-returns questions ----
const ADVICE_PATTERNS = [
  /\bshould i\b/i,
  /\bwhich (is|fund is|one is) better\b/i,
  /\bbetter (fund|option|choice)\b/i,
  /\bbest fund\b/i,
  /\brecommend/i,
  /\bworth (buying|investing)\b/i,
  /\bbuy or sell\b/i,
  /\bsell\b.*\bnow\b/i,
  /\bhow much (return|profit)\b/i,
  /\bwill (it|this fund) (grow|perform|give)/i,
  /\bcompare (returns|performance)\b/i,
  /\boutperform/i,
  /\bguarantee/i,
  /\bsure shot\b/i,
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
  { key: "expense_ratio", patterns: [/expense ratio/i, /\bter\b/i, /total expense/i, /charges?\b/i, /fees?\b/i] },
  { key: "exit_load", patterns: [/exit load/i, /redemption charge/i, /redeem.*charge/i] },
  { key: "min_sip", patterns: [/min(imum)?\s*sip/i, /sip amount/i, /start.*sip.*with/i] },
  { key: "lockin", patterns: [/lock[\s-]?in/i, /lockin/i] },
  { key: "riskometer", patterns: [/riskometer/i, /risk[\s-]?o[\s-]?meter/i, /risk level/i, /how risky/i] },
  { key: "benchmark", patterns: [/benchmark/i, /compared? (to|against) which index/i] },
  { key: "kim", patterns: [/\bkim\b/i, /key information memorandum/i] },
  { key: "sid", patterns: [/\bsid\b/i, /scheme information document/i] },
];

function detectScheme(q) {
  const lower = q.toLowerCase();
  for (const s of CORPUS.schemes) {
    if (lower.includes(s.name.toLowerCase())) return s;
    for (const a of s.aliases) {
      if (lower.includes(a)) return s;
    }
  }
  return null;
}

function detectIntent(q) {
  for (const intent of INTENTS) {
    if (intent.patterns.some((p) => p.test(q))) return intent.key;
  }
  if (/statement|capital gain|download.*(statement|report)|tax document/i.test(q)) return "statement_download";
  if (/what (is|does) (the )?riskometer (mean|show)/i.test(q)) return "riskometer_meaning";
  return null;
}

function containsPII(q) {
  return PII_PATTERNS.some((p) => p.test(q));
}

function isAdviceQuestion(q) {
  return ADVICE_PATTERNS.some((p) => p.test(q));
}

function formatDate() {
  return CORPUS.last_updated_from_sources;
}

function answer(query) {
  const q = query.trim();
  if (!q) {
    return { text: "Ask a factual question about one of the 4 HDFC schemes — e.g. expense ratio, exit load, minimum SIP, ELSS lock-in, riskometer, benchmark, or how to download a statement.", link: null };
  }

  if (containsPII(q)) {
    return {
      text: "I can't accept or store PAN, Aadhaar, account numbers, OTPs, emails, or phone numbers. Please re-ask your question without that information.",
      link: null,
    };
  }

  if (isAdviceQuestion(q)) {
    return {
      text: `That's an opinion / investment-advice question, and this assistant only answers verified facts — it can't tell you whether to buy, sell, or which fund is "better". For how to think about choosing a fund, see this educational page.`,
      link: EDU_LINK,
    };
  }

  const intent = detectIntent(q);
  const scheme = detectScheme(q);

  if (intent === "statement_download") {
    const g = CORPUS.general.statement_download;
    return { text: `${g.value} Last updated from sources: ${formatDate()}.`, link: g.source };
  }
  if (intent === "riskometer_meaning" && !scheme) {
    const g = CORPUS.general.riskometer_meaning;
    return { text: `${g.value} Last updated from sources: ${formatDate()}.`, link: g.source };
  }

  if (!intent) {
    return {
      text: "I can only answer specific factual questions (expense ratio, exit load, minimum SIP, ELSS lock-in, riskometer, benchmark, or statement downloads) for HDFC Large Cap, Flexi Cap, ELSS Tax Saver, or Mid Cap Fund. Could you rephrase using one of those terms and a scheme name?",
      link: null,
    };
  }

  if (!scheme) {
    return {
      text: `Which scheme do you mean? I cover HDFC Large Cap Fund, HDFC Flexi Cap Fund, HDFC ELSS Tax Saver, and HDFC Mid Cap Fund — please mention one by name.`,
      link: null,
    };
  }

  const fact = scheme.facts[intent];
  if (!fact) {
    return {
      text: `I don't have a verified answer for that on ${scheme.name} in my current source set. Please check the scheme's official KIM/SID instead.`,
      link: null,
    };
  }

  const labels = {
    expense_ratio: "Expense ratio",
    exit_load: "Exit load",
    min_sip: "Minimum SIP",
    lockin: "Lock-in",
    riskometer: "Riskometer",
    benchmark: "Benchmark",
    kim: "KIM",
    sid: "SID",
  };

  return {
    text: `${labels[intent]} of ${scheme.name}: ${fact.value}. Last updated from sources: ${formatDate()}.`,
    link: fact.source,
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

const BOT_AVATAR_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M4 16L9 11L13 15L20 7" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7H20V12" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function renderMessage(role, text, link) {
  const wrap = document.createElement("div");
  wrap.className = "msg " + role;

  if (role === "bot") {
    const av = document.createElement("div");
    av.className = "msg-avatar";
    av.innerHTML = BOT_AVATAR_SVG;
    wrap.appendChild(av);
  }

  const col = document.createElement("div");
  col.className = "msg-col";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  col.appendChild(bubble);

  if (link) {
    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "source-link";
    a.innerHTML = `${sourceDomain(link)}<span class="dot"></span>`;
    col.appendChild(a);
  }

  wrap.appendChild(col);
  document.getElementById("chat").appendChild(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
}

function clearEmptyHint() {
  const hint = document.querySelector(".empty-hint");
  if (hint) hint.remove();
}

function handleSend(text) {
  clearEmptyHint();
  renderMessage("user", text, null);
  if (!CORPUS) {
    setTimeout(() => renderMessage("bot", "Still loading fund data — please try again in a second.", null), 200);
    return;
  }
  const res = answer(text);
  setTimeout(() => renderMessage("bot", res.text, res.link), 200);
}

// Wire up UI interaction immediately — never let a slow/failed corpus
// fetch block button clicks or form submission from working.
window.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("query");
  const form = document.getElementById("askForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    if (!v.trim()) return;
    handleSend(v);
    input.value = "";
  });
  document.querySelectorAll(".topic-row, .topic-tile, .example-chip").forEach((tile) => {
    tile.addEventListener("click", () => {
      handleSend(tile.dataset.q || tile.textContent);
    });
  });
  loadCorpus().catch((err) => {
    console.error("Failed to load schemes.json", err);
  });
});
