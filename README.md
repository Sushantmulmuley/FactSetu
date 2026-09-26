# Facts-Only MF Assistant — HDFC Mutual Fund

A small FAQ assistant that answers **verified factual questions** about four HDFC Mutual Fund schemes — expense ratio, exit load, minimum SIP, ELSS lock-in, riskometer, benchmark, and how to download a capital-gains statement — using only official AMC/SEBI/AMFI sources. Every answer carries one citation link. It refuses opinion/advice questions and never accepts or stores PII.

**Product chosen (Milestone brief):** Groww *(locked in for all milestones in this track — this milestone itself doesn't touch Groww's UI, it builds the underlying facts-only assistant.)*
**AMC scoped:** HDFC Mutual Fund
**Schemes scoped (4):**
- HDFC Large Cap Fund
- HDFC Flexi Cap Fund
- HDFC ELSS Tax Saver
- HDFC Mid Cap Fund

## Live demo
Open `index.html` in a browser (or the hosted link, if shared separately) — no build step, no server-side dependency, no API key required.

## Why no LLM API call at runtime
This environment had no LLM API key available. Rather than fake one, the assistant is built as a **small, deterministic retrieval engine**: user text is matched to an *intent* (expense ratio / exit load / min SIP / lock-in / riskometer / benchmark / statement download) and a *scheme* (by name or alias), then the matching fact is pulled from a fixed JSON corpus (`data/schemes.json`) that was hand-populated from the 22 official source pages in `sources.csv`. This is arguably a *stricter* implementation of "Facts-Only" than an LLM-generated answer would be: there is zero chance of a hallucinated number, because every value is looked up, never generated. It still demonstrates the three skills the milestone tests:
- **W1 (Thinking like a model):** the intent-detection layer decides *fact vs. refuse* before anything is answered.
- **W2 (Prompting/instruction style):** the refusal wording and citation format are the "prompt contract" — kept polite, concise, and consistent.
- **W3 (RAG, small corpus):** retrieval is over a scoped 22-URL corpus, and every answer is grounded to exactly one source URL — the same guarantee a real RAG pipeline is judged on.

If a hosted LLM key is later available, the same `data/schemes.json` corpus can be dropped straight into a real retrieval-augmented-generation call (embed the facts, retrieve top-k, generate with citation) without re-collecting sources.

## How it works
1. **Corpus (`data/schemes.json`):** one JSON object per scheme with fields for `expense_ratio`, `exit_load`, `min_sip`, `lockin`, `riskometer`, `benchmark`, `kim`/`sid` — each with a `value` and a `source` URL.
2. **Intent detection (`app.js`):** regex/keyword matching maps free-text questions to one of the fact fields, or to `statement_download` / `riskometer_meaning` for general (non-scheme) questions.
3. **Scheme detection:** matches the scheme name or a short alias list (e.g. "ELSS", "tax saver fund" → HDFC ELSS Tax Saver).
4. **Refusal logic:**
   - Opinion/advice patterns ("should I buy…", "which is better…", "will it grow…") → polite refusal + one educational link, never a fact.
   - PII patterns (PAN format, Aadhaar-like digit groups, OTP, email, phone, account numbers) → refusal to accept/store, no fact returned even if also asked.
5. **UI (`index.html`):** a welcome line, 3 clickable example questions, a persistent "Facts-only. No investment advice." badge, and a simple chat log with a "Source ↗" link under every factual answer.

## Setup steps
No installation needed for the UI itself — it's static HTML/CSS/JS with one `fetch()` of a local JSON file.
```
cd mf-assistant
python3 -m http.server 8000
# open http://localhost:8000/index.html
```
To re-run the automated end-to-end check (uses Playwright, included for local testing only — not required to use the app):
```
pip install playwright && playwright install chromium
python3 test_e2e.py
```

## Known limits
- **Static corpus, not live retrieval:** facts are current as of the "Last updated from sources" date shown in every answer (26 September 2026). Expense ratios in particular are revised periodically by AMCs — always cross-check the linked source for the latest figure.
- **4 schemes only, one AMC only:** by design, per the milestone's scoping requirement. Asking about a non-HDFC scheme or a 5th HDFC scheme returns a "which scheme do you mean" prompt, not a fabricated answer.
- **Intent matching is keyword/regex-based, not semantic:** unusual phrasing of a fact question may fall through to the generic "could you rephrase" response rather than being answered. This is a deliberate fail-safe (better to ask again than to guess and cite the wrong fact) but means recall on oddly-worded questions is lower than an LLM-based classifier would give.
- **No live network calls from the browser:** the app only reads its own local `data/schemes.json` — it does not scrape hdfcfund.com/SEBI/AMFI live, so it cannot self-refresh; refreshing requires manually re-checking sources and editing the JSON.
- **English only**, single-turn Q&A (no conversation memory across turns).

## Deliverables in this repo
- `index.html`, `app.js`, `data/schemes.json` — the working prototype
- `sources.csv` — the 22 official source URLs used (AMC scheme pages, KIM/SID, factsheet, SEBI riskometer circular + investor page, AMFI investor pages, HDFC statement-download guide, HDFC ELSS educational page)
- `sample_qa.md` — 10 sample queries with answers/links, including 2 advice refusals and 1 PII refusal
- This README — setup, scope, and known limits
- Disclaimer snippet used in the UI: **"Facts-only. No investment advice."** (shown as a persistent badge under the header on every screen)

## Skills demonstrated
- **W1:** intent/scheme detection before generation — decide *answer* vs. *refuse* first.
- **W2:** concise (≤3-sentence) answers, consistent citation wording ("Last updated from sources: …"), polite safe-refusals for both advice and PII.
- **W3:** small-corpus retrieval (22 URLs → structured facts) with an accurate 1:1 citation per answer.
