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
  { key: "expense_ratio", patterns: [/expense ratio/i, /\bter\b/i, /total expense/i, /charges?\b/i, /fees?\b/i, /how much does it cost/i] },
  { key: "exit_load", patterns: [/exit load/i, /redemption charge/i, /redeem.*charge/i, /charge.*(exit|redeem)/i] },
  { key: "min_sip", patterns: [/min(imum)?\s*sip/i, /sip amount/i, /start.*sip.*with/i, /how much.*(start|invest).*sip/i, /minimum (investment|amount)/i] },
  { key: "lockin", patterns: [/lock[\s-]?in/i, /lockin/i] },
  { key: "riskometer", patterns: [/riskometer/i, /risk[\s-]?o[\s-]?meter/i, /risk level/i, /how risky/i] },
  { key: "benchmark", patterns: [/benchmark/i, /compared? (to|against) which index/i, /tracks? which index/i] },
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
  (topics) => `I can only answer fixed factual questions — ${topics} — for one of the 4 HDFC schemes. Try one of the quick questions on the left, or ask e.g. "Expense ratio of HDFC Large Cap Fund?"`,
  (topics) => `That's outside what I can look up — I'm scoped to ${topics}. Tap a quick question on the left, or name a scheme and one of those terms.`,
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

  const intent = detectIntent(q);
  const schemesMentioned = detectSchemes(q);

  if (intent === "statement_download") {
    fallbackStreak = 0;
    const g = CORPUS.general.statement_download;
    return { text: `${g.value} Last updated from sources: ${formatDate()}.`, link: g.source, kind: "fact" };
  }
  if (intent === "riskometer_meaning" && schemesMentioned.length === 0) {
    fallbackStreak = 0;
    const g = CORPUS.general.riskometer_meaning;
    return { text: `${g.value} Last updated from sources: ${formatDate()}.`, link: g.source, kind: "fact" };
  }

  // Factual side-by-side comparison of ONE fact across TWO+ named schemes
  // (still facts, never returns/performance — those stay refused above).
  if (isCompareRequest(q) && schemesMentioned.length >= 2) {
    if (!intent) {
      fallbackStreak = 0;
      return {
        text: `Happy to compare facts side by side — which one: expense ratio, exit load, minimum SIP, lock-in, riskometer, or benchmark?`,
        link: null,
        kind: "fallback",
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
    return {
      text: `Which scheme do you mean? I cover HDFC Large Cap Fund, HDFC Flexi Cap Fund, HDFC ELSS Tax Saver, and HDFC Mid Cap Fund — please mention one by name.`,
      link: null,
      kind: "fallback",
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

function renderMessage(role, text, link, kind) {
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
  bubble.className = "bubble" + (kind ? ` bubble--${kind}` : "");
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
  return wrap;
}

function showTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg bot typing-msg";
  const av = document.createElement("div");
  av.className = "msg-avatar";
  av.innerHTML = BOT_AVATAR_SVG;
  wrap.appendChild(av);
  const bubble = document.createElement("div");
  bubble.className = "bubble typing-bubble";
  bubble.innerHTML = `<span class="dotflash"></span><span class="dotflash"></span><span class="dotflash"></span>`;
  wrap.appendChild(bubble);
  document.getElementById("chat").appendChild(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "end" });
  return wrap;
}

function clearEmptyHint() {
  const hint = document.querySelector(".empty-hint");
  if (hint) hint.remove();
}

function handleSend(text) {
  clearEmptyHint();
  renderMessage("user", text, null, null);
  const typingEl = showTyping();
  const delay = 350 + Math.random() * 250;
  setTimeout(() => {
    typingEl.remove();
    if (!CORPUS) {
      renderMessage("bot", "Still loading fund data — please try again in a second.", null, "fallback");
      return;
    }
    const res = answer(text);
    renderMessage("bot", res.text, res.link, res.kind);
  }, delay);
}

function resetChat() {
  lastSchemeId = null;
  fallbackStreak = 0;
  const chat = document.getElementById("chat");
  chat.innerHTML = `<div class="empty-hint">
    <svg viewBox="0 0 24 24" fill="none" style="margin:0 auto;display:block;"><path d="M4 16L9 11L13 15L20 7" stroke="#5C6470" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7H20V12" stroke="#5C6470" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    Pick a quick question on the left, or type your own below.
  </div>`;
}

function setActiveScheme(schemeId, navEl) {
  document.querySelectorAll(".navlinks span").forEach((el) => el.classList.remove("active"));
  if (navEl) navEl.classList.add("active");
  lastSchemeId = schemeId; // null = overview / no scheme lock

  if (!CORPUS) return;
  const scheme = schemeId ? CORPUS.schemes.find((s) => s.id === schemeId) : null;
  const name = scheme ? scheme.name : null;

  // Re-point the quick-question tiles at the focused scheme so the left
  // rail stays coherent with whichever tab is active, instead of always
  // asking about four different hardcoded funds.
  document.querySelectorAll(".topic-row[data-template]").forEach((row) => {
    const template = row.dataset.template;
    row.dataset.q = name ? template.replace("{scheme}", name) : template.replace("{scheme}", row.dataset.default);
  });
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
  document.querySelectorAll(".navlinks span[data-scheme-id], .navlinks span[data-scheme-id='']").forEach((el) => {
    el.addEventListener("click", () => {
      setActiveScheme(el.dataset.schemeId || null, el);
    });
  });
  const resetBtn = document.getElementById("resetChat");
  if (resetBtn) resetBtn.addEventListener("click", resetChat);

  loadCorpus()
    .then(() => setActiveScheme(null, document.querySelector(".navlinks span.active")))
    .catch((err) => console.error("Failed to load schemes.json", err));
});
