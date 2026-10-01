// Regenerates sample_qa.md from the real answer engine, so the file always matches the app.
// Usage: node make_sample_qa.js
const fs = require("fs");
const vm = require("vm");

const ctx = vm.createContext({ window: { addEventListener() {} }, console, URL });
vm.runInContext(fs.readFileSync(__dirname + "/app.js", "utf8"), ctx);
vm.runInContext(`CORPUS = ${fs.readFileSync(__dirname + "/data/schemes.json", "utf8")}`, ctx);

// [question, note, start a fresh session?]
const QUESTIONS = [
  ["Expense ratio of HDFC Flexi Cap Fund?", "", true],
  ["What is the lock-in for HDFC ELSS Tax Saver?", "", true],
  ["Minimum SIP for HDFC Mid Cap Fund?", "", true],
  ["and riskometer?", "follow-up: reuses the scheme from the previous question", false],
  ["Exit load of HDFC Large Cap Fund?", "", true],
  ["How do I download my capital gains statement?", "", true],
  ["Compare expense ratio of HDFC Large Cap and Flexi Cap", "factual comparison: one answer per scheme, each with its own source", true],
  ["Should I buy HDFC Flexi Cap Fund now?", "refusal: opinion / advice", true],
  ["What returns has HDFC Mid Cap Fund given?", "refusal: performance, links to the official factsheet", true],
  ["My PAN is ABCDE1234F, what is the expense ratio of Large Cap fund?", "refusal: personal data, no fact returned", true],
];

let out = "# Sample Q&A — FactSetu (HDFC Mutual Fund)\n\n";
out += "Generated from the live answer engine with `node make_sample_qa.js`. Each answer is 3 sentences or fewer and carries one link.\n";
QUESTIONS.forEach(([q, note, fresh], i) => {
  if (fresh) vm.runInContext("lastSchemeId = null; fallbackStreak = 0;", ctx);
  const res = vm.runInContext(`answer(${JSON.stringify(q)})`, ctx);
  const text = vm.runInContext(`replyPlainText(${JSON.stringify(res)})`, ctx);
  out += `\n## ${i + 1}. ${q}${note ? `\n*${note}*` : ""}\n\n${text.split("\n").join("  \n")}\n`;
});
fs.writeFileSync(__dirname + "/sample_qa.md", out);
console.log(out);
