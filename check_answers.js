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
reset(); expect("Compare expense ratio of HDFC Large Cap and Flexi Cap", (r) => r.kind === "fact" && r.rows && r.rows.length === 2);

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
// 5. masking
const m = vm.runInContext(`maskPII("PAN ABCDE1234F, call 9876543210, mail a.b@x.com")`, ctx);
const leaked = /ABCDE1234F|9876543210|a\.b@x\.com/.test(m);
if (leaked) failed++;
console.log(`${leaked ? "FAIL" : "ok  "} masking -> ${m}`);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
