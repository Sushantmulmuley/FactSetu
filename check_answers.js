// Runs the answer engine against sample_qa.md and the newer matching rules.
// Usage: node check_answers.js   (exits 1 on any failure)
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({ window: { addEventListener() {} }, console, URL });
vm.runInContext(fs.readFileSync(__dirname + "/app.js", "utf8"), ctx);
vm.runInContext(`CORPUS = ${fs.readFileSync(__dirname + "/data/schemes.json", "utf8")}`, ctx);
const ask = (q) => vm.runInContext(`answer(${JSON.stringify(q)})`, ctx);
const reset = () => vm.runInContext("lastSchemeId = null; fallbackStreak = 0;", ctx);

let failed = 0;
const corpusSchemes = Object.fromEntries(JSON.parse(fs.readFileSync(__dirname + "/data/schemes.json", "utf8")).schemes.map((s) => [s.id, s]));
function expect(q, check, label) {
  const r = ask(q);
  const ok = check(r);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label || q}${ok ? "" : "\n     got: " + JSON.stringify(r).slice(0, 200)}`);
}
const fact = (intent, scheme) => (r) => r.kind === "fact" && r.intent === intent && (!scheme || r.schemeId === scheme);

// sample_qa.md
reset(); expect("Expense ratio of HDFC Flexi Cap Fund?", fact("expense_ratio", "flexi_cap"));
reset(); expect("What is the lock-in for HDFC ELSS Tax Saver?", fact("lockin", "elss_tax_saver"));
reset(); expect("Minimum SIP for HDFC Mid Cap Fund?", fact("min_sip", "mid_cap"));
reset(); expect("Exit load of HDFC Large Cap Fund?", fact("exit_load", "large_cap"));
reset(); expect("Riskometer of HDFC ELSS Tax Saver?", fact("riskometer", "elss_tax_saver"));
reset(); expect("Benchmark of HDFC Mid Cap Fund?", fact("benchmark", "mid_cap"));
reset(); expect("How do I download my capital gains statement?", (r) => r.kind === "fact" && /statement/i.test(r.head));
reset(); expect("Should I buy HDFC Flexi Cap Fund now?", (r) => r.kind === "refuse");
reset(); expect("Which is better, Large Cap or Mid Cap?", (r) => r.kind === "refuse");
reset(); expect("My PAN is ABCDE1234F, what is the expense ratio of Large Cap fund?", (r) => r.kind === "blocked");
reset(); ask("Expense ratio of HDFC Flexi Cap Fund?"); expect("and exit load?", fact("exit_load", "flexi_cap"), "follow-up: and exit load?");
reset(); expect("Is this an good option", (r) => r.kind === "refuse");
reset(); expect("Compare expense ratio of HDFC Large Cap and Flexi Cap", (r) => r.split && r.split.length === 2 && r.split.every((p) => p.link === corpusSchemes[p.schemeId].facts.expense_ratio.source),
  "comparison: one answer per scheme, each citing that scheme's own page");

// 1. typos
reset(); expect("expence ratio of flexy cap", fact("expense_ratio", "flexi_cap"));
reset(); expect("benchmrk of hdfc mid cap", fact("benchmark", "mid_cap"));
reset(); expect("riskomter for large cap", fact("riskometer", "large_cap"));
// 2. clarifying choices
reset(); expect("exit load?", (r) => r.choices && r.choices.length === 4, "exit load? with no scheme offers 4 choices");
reset(); expect("compare large cap and mid cap", (r) => r.choices && r.choices.length === 6, "compare without a fact offers 6 choices");
// 3. multi-fact
reset(); expect("Expense ratio and exit load of Mid Cap", (r) => r.items && r.items.map((i) => i.intent).join() === "expense_ratio,exit_load");
reset(); expect("exit load charges of large cap", fact("exit_load", "large_cap"), "exit load 'charges' is not also expense ratio");
// 4. phrasings
reset(); expect("what's the fee for flexi cap", fact("expense_ratio", "flexi_cap"));
reset(); expect("how long is ELSS locked", fact("lockin", "elss_tax_saver"));
reset(); expect("which index does mid cap track", fact("benchmark", "mid_cap"));
reset(); expect("penalty for early withdrawal from large cap", fact("exit_load", "large_cap"));
// Milestone rules, across every fact of every scheme plus the special cases
const sentences = (r) => vm.runInContext(`composeReply(${JSON.stringify(r)}).reduce((n, p) => n + splitSentences(p.segs.map((x) => x.t).join("")).length, 0)`, ctx);
const corpus = JSON.parse(fs.readFileSync(__dirname + "/data/schemes.json", "utf8"));
const probes = [];
for (const s of corpus.schemes) for (const k of ["expense_ratio", "exit_load", "min_sip", "lockin", "riskometer", "benchmark"]) probes.push(`${k.replace("_", " ")} of ${s.name}`);
probes.push("what is hdfc mid cap fund", "How do I download my capital gains statement?", "What does the riskometer mean?", "Compare exit load of HDFC Large Cap and Mid Cap",
  "Expense ratio, exit load and minimum SIP of Flexi Cap", "Should I buy HDFC Mid Cap?", "what is the weather", "exit load?", "My PAN is ABCDE1234F");
let worst = 0;
for (const q of probes) {
  reset();
  const r = ask(q);
  for (const part of r.split || [r]) {
    worst = Math.max(worst, sentences(part));
    if (part.kind === "fact" && !part.link) { failed++; console.log(`FAIL fact without exactly one link: ${q}`); }
  }
}
if (worst > 3) failed++;
console.log(`${worst > 3 ? "FAIL" : "ok  "} every reply is 3 sentences or fewer (longest: ${worst}, over ${probes.length} questions)`);
reset(); expect("lock-in and expense ratio of mid cap", (r) => r.items.length === 1 && r.more.join() === "lockin", "facts from two different sources: one cited, the other offered as a follow-up");
reset(); expect("What returns has HDFC Flexi Cap given?", (r) => r.kind === "refuse" && /Factsheet/.test(r.link), "returns question -> official factsheet link");
reset(); expect("Will this fund outperform the market?", (r) => r.kind === "refuse" && /Factsheet/.test(r.link), "performance question -> official factsheet link");
reset(); expect("Should I buy HDFC Mid Cap?", (r) => r.kind === "refuse" && r.link === "https://www.amfiindia.com/investor", "advice refusal -> AMFI educational link");
reset(); expect("My PAN is ABCDE1234F, expense ratio of Large Cap?", (r) => r.kind === "blocked" && !r.value, "PII question returns no fact");

reset(); expect("what is hdfc mid cap fund", (r) => r.overview && r.items.length === 3 && r.items.every((i) => i.link === r.link), "scheme with no fact -> overview from one source page");
reset(); ask("tell me about HDFC ELSS Tax Saver"); expect("and exit load?", fact("exit_load", "elss_tax_saver"), "overview sets the scheme for follow-ups");

// 5. masking
const m = vm.runInContext(`maskPII("PAN ABCDE1234F, call 9876543210, mail a.b@x.com")`, ctx);
const leaked = /ABCDE1234F|9876543210|a\.b@x\.com/.test(m);
if (leaked) failed++;
console.log(`${leaked ? "FAIL" : "ok  "} masking -> ${m}`);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
