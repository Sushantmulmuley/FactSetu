# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Primary: a retail mutual-fund investor (beginner to intermediate) who wants one verified fact about an HDFC scheme — expense ratio, exit load, minimum SIP, ELSS lock-in, riskometer, benchmark — or how to download a capital-gains statement, without wading through KIM/SID PDFs.

Secondary: the milestone reviewer, who needs to see the facts-only contract working — cited answers, advice refusals, PII refusals — at a glance.

## Product Purpose
FactSetu is a facts-only financial-information chatbot for four HDFC Mutual Fund schemes (Large Cap, Flexi Cap, ELSS Tax Saver, Mid Cap). It answers only verified factual questions, cites exactly one official source for each answer, and declines anything that is opinion or advice. Success means the investor gets the right number and the source link in a single turn, and never mistakes the tool for an advisor.

## Positioning
Every value is looked up, never generated. The assistant is a deterministic retrieval engine over a hand-verified corpus (`data/schemes.json`) built from 22 official AMC/SEBI/AMFI URLs (`sources.csv`), so hallucinated numbers are impossible and every answer links to one exact source.

## Operating Context
- Free-text questions, plus seven one-click quick questions (one per fact type, and the statement download).
- Scheme tabs (overview plus the four schemes) set which scheme the session is focused on. The quick questions then point at that scheme.
- Session-only scheme memory: a follow-up like "and exit load?" reuses the last scheme discussed.
- Factual side-by-side comparisons ("compare expense ratio of X and Y") are allowed; performance or "which is better" comparisons are refused.
- Answers read like a chatbot reply, short but not one-liners: one sentence with the verified value, then a two-to-three-sentence plain-language explanation of the term. The explanation is a general definition; every scheme-specific figure comes from the corpus. Each answer ends with its source link and "last updated from sources <date>".
- Hosted as a static page on GitHub Pages: https://sushantmulmuley.github.io/verifiedfund/

## Capabilities and Constraints
- Scope: one AMC (HDFC) and four schemes, by design. A scheme outside that scope gets a "which scheme do you mean" prompt, never a fabricated answer.
- Intent matching is keyword/regex-based. When unsure, the assistant asks the user to rephrase rather than guess.
- Refuses investment advice (buy/sell/better/will it grow) with a polite reply and one educational link.
- Refuses PII (PAN, Aadhaar, OTP, email, phone, account numbers), never stores it, and returns no fact even if a fact was also asked for.
- Static corpus: no live retrieval and no LLM call at runtime. Refreshing means re-checking sources and editing the JSON.
- English only.
- Stack: static HTML/CSS/JS (`index.html`, `app.js`), with no build step and no server.
- Open: the product's future beyond this milestone (more schemes, an LLM/RAG backend, live refresh) is undecided.

## Brand Commitments
- Name: FactSetu ("setu" is Hindi/Sanskrit for bridge: a bridge from the question to the official source). Renamed from VerifiedFund on 2026-09-30; the GitHub Pages URL still uses the old repo name. Trademark, domain and app-store availability not yet checked. It has its own identity, and the earlier Groww-imitating look has been replaced. Groww is context only (the product track this milestone belongs to).
- Disclaimer "Facts-only. No investment advice." must stay visible on every screen.
- Voice: polite, concise, consistent. Refusals explain what the assistant can't do and point somewhere useful.

## Evidence on Hand
- `data/schemes.json`: the fact corpus, with a value and source URL for each field.
- `sources.csv`: 22 official source URLs.
- `sample_qa.md`: 13 sample exchanges, including advice, PII, multi-turn, and comparison cases.
- No testimonials, usage metrics, or endorsements exist. Do not invent them, and do not imply that HDFC, SEBI, AMFI, or Groww endorses the product.

## Product Principles
1. The source is the product: no answer ships without its one citation and its as-of date.
2. Refusing is a feature. Declining advice or PII should feel deliberate and helpful, never like an error.
3. Asking again beats guessing. When unsure, ask the user to clarify instead of risking a wrong citation.
4. One question, one fact, one turn.
5. Never look like an advisor: nothing in the product should suggest performance, ranking, or recommendation.
