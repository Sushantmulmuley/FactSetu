# FactSetu: Facts-Only Mutual Fund Assistant (HDFC Mutual Fund)

FactSetu ("setu" means bridge) is a small FAQ chatbot that answers **verified factual questions** about four HDFC Mutual Fund schemes: expense ratio, exit load, minimum SIP, ELSS lock-in, riskometer, benchmark, and how to download a capital-gains statement. It uses only official AMC, SEBI and AMFI pages. Every answer carries **one source link**, and the assistant never gives investment advice.

- **Product chosen (all milestones):** Groww. This milestone builds the facts-only assistant; it doesn't change Groww's UI.
- **AMC:** HDFC Mutual Fund
- **Schemes (4):** HDFC Large Cap Fund, HDFC Flexi Cap Fund, HDFC ELSS Tax Saver, HDFC Mid Cap Fund
- **Live demo:** https://sushantmulmuley.github.io/FactSetu/

## Disclaimer
> **Facts-only. No investment advice.**
> Every answer is a verified fact from an official AMC/SEBI/AMFI source, cited by link. The assistant never recommends, compares performance/returns, or tells you whether to buy, sell, or hold. This note is shown persistently in the app header and under the question box on every screen.

## What it does

| Question type | Behaviour |
|---|---|
| A fact about a scheme ("Expense ratio of HDFC Flexi Cap Fund?") | Three sentences: the value, a plain-language explanation of what the term means, and the exact document it came from (for example the scheme's Direct Plan page or its KIM). Then one source link and "Last updated from sources: <date>". Never more than 3 sentences. |
| A follow-up ("and exit load?") | Reuses the scheme from earlier in the session. |
| No scheme named ("exit load?") | Asks which scheme, with the four schemes as buttons. |
| Several facts at once ("expense ratio and exit load of Mid Cap") | Answers the facts that share one source (up to 3) and offers the rest as follow-up buttons, so each answer still has one citation. |
| Factual comparison ("compare expense ratio of Large Cap and Flexi Cap") | One short answer per scheme, each citing that scheme's own source page. No performance comparison. |
| Opinion or advice ("Should I buy…?", "Which is better?") | A polite refusal plus an educational link (AMFI Investor Corner). |
| Returns or performance ("What returns has it given?") | Doesn't compute or compare returns; links to HDFC MF's official monthly factsheet. |
| Personal data (PAN, Aadhaar, account numbers, OTP, email, phone) | Refuses, returns no fact even if one was also asked, and masks the value on screen (`A••••••••F`). Nothing is stored. |
| Anything else | Asks the user to rephrase instead of guessing. |

**UI:** a welcome line, 3 example questions, a "Key facts" table that fills in as you ask, scheme tabs, and a persistent **"Facts-only. No investment advice."** note on every screen. It works on desktop and phones.

## How it works

1. **Corpus (`data/schemes.json`):** each scheme's facts, each with a `value` and the official `source` URL it was taken from. The corpus was built by hand from the 22 pages in `sources.csv`.
2. **Retrieval (`app.js`):** the question is matched to an intent (expense ratio, exit load, and so on) and a scheme (by name or alias). Typos like "expence" or "flexy" are corrected first. The fact is then looked up, never generated, so a number can't be hallucinated.
3. **Answer or refuse first:** personal-data, advice and performance checks run before any fact lookup.
4. **Reply composition:** `composeReply()` builds every answer from the verified value, a one-sentence explanation of the term, and a sentence naming its source document, and enforces the 3-sentence limit.

There is no LLM call at runtime and no API key. It's a deterministic retrieval engine over a small, verified corpus. The same corpus can feed a real RAG pipeline later without re-collecting sources.

## Setup

Static HTML/CSS/JS with no build step. Serve the folder (opening `index.html` straight from disk blocks loading the JSON):

```
python3 -m http.server 8000
# open http://localhost:8000
```

Checks (Node, no dependencies):

```
node check_answers.js    # 31 checks: sample questions, refusals, ≤3 sentences, one accurate link per answer, PII masking
node make_sample_qa.js   # regenerates sample_qa.md from the live engine
```

## Known limits

- **Static corpus:** facts are as of the "Last updated from sources" date in each answer (1 October 2026). Expense ratios change often; answers carry a warning once the data is more than 30 days old. Refreshing means re-checking the sources and editing the JSON.
- **Scope:** one AMC and four schemes, by design. Other schemes get a "which scheme do you mean" prompt, never a made-up answer.
- **Keyword matching, not semantic:** unusual phrasing can fall through to "please rephrase". That's deliberate: asking again beats citing the wrong fact.
- **Explanations are general definitions:** the middle sentence explaining a term (for example what an expense ratio is) is standard investor-education wording, not quoted from the cited page. Every scheme-specific figure comes from its cited source.
- **English only.** Conversation memory lasts for the browser tab only.

## Deliverables in this repo

- `index.html`, `app.js`, `data/schemes.json`: the working prototype
- `sources.csv`: the 22 official source URLs (AMC scheme pages, KIM/SID, factsheet, SEBI riskometer circular and investor page, AMFI investor pages, HDFC statement guide)
- `sample_qa.md`: 10 sample queries with the assistant's answers and links, including advice, performance and PII refusals
- `README.md`: this file
- **Disclaimer snippet used in the UI:** "Facts-only. No investment advice."

## Skills demonstrated

- **W1, thinking like a model:** identify the exact fact asked, and decide answer vs. refuse before any lookup.
- **W2, LLMs and prompting:** consistent, concise wording (3 sentences or fewer), polite safe-refusals, and a fixed citation format.
- **W3, RAG:** small-corpus retrieval from 22 AMC/SEBI/AMFI pages, with one accurate citation per answer.
