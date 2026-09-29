---
name: VerifiedFund
description: Facts-only mutual fund assistant — dark professional tool, one mint signal for verified answers.
colors:
  mint: "#00D09C"
  mint-dim: "#00B589"
  mint-glow: "rgba(0,208,156,0.14)"
  on-mint: "#04211A"
  signal-red: "#FF5B5B"
  refusal-amber: "#F4924A"
  fallback-indigo: "#6E85FF"
  night: "#0A0D11"
  panel: "#12161B"
  panel-raised: "#171C22"
  line: "#242A31"
  line-soft: "#1C2128"
  ink: "#EDEFF2"
  muted: "#8B94A1"
  faint: "#5C6470"
  tile-mint-bg: "#0F2A22"
  tile-indigo-bg: "#151E33"
  tile-amber-bg: "#2E2012"
  tile-violet-bg: "#231A33"
  tile-violet: "#B58CFF"
  tile-rose-bg: "#2E141C"
  tile-rose: "#FF7590"
  tile-cyan-bg: "#0F262C"
  tile-cyan: "#39C2E0"
typography:
  headline:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    lineHeight: 1.3
  title:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1.6
    fontFeature: "tnum"
  body-small:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "10.5px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.on-mint}"
    rounded: "{rounded.md}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.mint-dim}"
  button-ghost-dashed:
    backgroundColor: "transparent"
    textColor: "{colors.faint}"
    rounded: "{rounded.md}"
    padding: "10px"
  input-query:
    backgroundColor: "{colors.night}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "13px 16px"
  bubble-user:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.on-mint}"
    rounded: "{rounded.xl}"
    padding: "11px 15px"
  bubble-bot:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "11px 15px"
  chip-source:
    backgroundColor: "{colors.mint-glow}"
    textColor: "{colors.mint}"
    rounded: "{rounded.pill}"
    padding: "5px 12px 5px 6px"
  chip-source-hover:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.on-mint}"
  card-rail:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

<!-- SNAPSHOT: records the incumbent (Groww-derived) look as of 2026-09-29. PRODUCT.md commits VerifiedFund to its own identity; a redesign should treat this file as evidence and anti-reference, then replace it. -->

# Design System: VerifiedFund

## Overview

**Creative North Star: "The Professional Tool"**

VerifiedFund currently looks like a dark, dense fintech workspace: a sticky top bar, a left rail listing the scoped schemes and quick questions, and a single chat panel where answers arrive as tagged bubbles. It reads as a trading-app utility. It is quiet, near-black, and compact, and one mint color marks everything that is verified, actionable, or yours.

The tone is friendly fintech in its components (pill chips, tinted icon tiles, soft 8–14px corners, a gradient logo mark) set inside a professional, low-noise shell. Color carries meaning. Each answer kind has its own tag color: fact (mint), refusal (amber), blocked PII (red), fallback (indigo). The source link is the most accented element under every fact.

This file is a **pre-redesign snapshot**. The mint `#00D09C`, the navbar pattern, and the gradient logo come from Groww. VerifiedFund's own identity has not been designed yet. Future work should keep the semantic structure (answer-kind tags, a prominent citation chip, a persistent disclaimer) and treat the Groww-derived surface as a reference to move away from.

**Key Characteristics:**
- Near-black tonal layering (night → panel → panel-raised), with no shadows.
- A single mint accent for primary action, the user's own messages, verified states, and citations.
- Semantic tag colors for each answer kind.
- Compact type (10.5–16px) set in one family, Plus Jakarta Sans.
- Soft, friendly geometry: pills, tinted 28px icon tiles, 14px bubbles with one tucked corner.

## Colors

A dark cool-slate neutral ramp with one saturated mint signal and three semantic side-colors.

### Primary
- **Verified Mint** (`mint`): the primary button, user bubbles, the "Verified sources only" pill, fact tags, source chips, focus rings, and the input caret. It is the color of "this is confirmed" and "this is you."
- **Pressed Mint** (`mint-dim`): hover state for the primary button.
- **Mint Haze** (`mint-glow`): the translucent fill behind pills, source chips, and the input focus halo.
- **Deep Forest Ink** (`on-mint`): text and icons placed on mint.

### Secondary
- **Refusal Amber** (`refusal-amber`): the tag on advice-refusal answers. It signals a deliberate decline, not an error.
- **Signal Red** (`signal-red`): the tag on PII-blocked answers.
- **Fallback Indigo** (`fallback-indigo`): the tag on "could you rephrase" replies and loading notices.

### Tertiary
- **Icon-tile pairs** (`tile-*-bg` with a matching foreground): six dark-tinted squares (mint, indigo, amber, violet, rose, cyan) that sit behind the quick-question icons. They are decoration only and carry no meaning.

### Neutral
- **Night** (`night`): the page background, top bar, and input field well.
- **Panel** (`panel`): rail cards and the chat panel.
- **Panel Raised** (`panel-raised`): bot bubbles and row hover.
- **Line** (`line`): card and bubble borders, and scrollbar thumbs.
- **Line Soft** (`line-soft`): internal dividers such as header and form separators.
- **Ink** (`ink`): primary text.
- **Muted** (`muted`): secondary copy and inactive nav links.
- **Faint** (`faint`): placeholders, section labels, footnotes, and the empty-state hint.

### Named Rules
**The Mint Means Verified Rule.** Mint only marks confirmed facts, the user's own voice, and the primary action. It never appears as decoration.

**The Tag Color Is the Answer Kind Rule.** Fact, refusal, blocked, and fallback each own one color. Don't reuse those colors for anything else.

## Typography

**Body Font:** Plus Jakarta Sans (with -apple-system, Segoe UI, Roboto fallback)

**Character:** A single geometric-humanist sans used at heavy weights (600–800) and small sizes. Friendly but dense. Numbers use tabular figures so values such as 0.77% and 1.03% line up.

### Hierarchy
- **Headline** (800, 16px): the chat panel title.
- **Title** (800, 14–15px, −0.01em): the brand wordmark and rail card headings.
- **Body** (500, 13.5px, 1.6, tabular numerals): chat bubbles and the input.
- **Body Small** (600, 12–12.5px, 1.5): rail rows, scheme list, panel subhead, empty hint.
- **Label** (800, 10–11.5px, 0.05–0.06em, uppercase): answer-kind tags, rail section labels, the source chip, and the footnote.

### Named Rules
**The Heavy-Small Rule.** Hierarchy comes from weight (500 → 800), not size. The whole scale stays between 10px and 16px.

## Layout

Centered 1040px container with 26px/28px padding and a two-column grid: a 260px sticky left rail (top offset 80px) and a fluid chat panel with a minimum height of 640px. The top bar is 60px, sticky, and full-bleed. Spacing is tight, with 14–20px gaps between blocks and 16–22px internal padding.

At 860px and below, the grid collapses to one column. The rail becomes a horizontally wrapping row of cards, each at least 220px wide, placed above the chat.

## Elevation & Depth

Flat. There are no drop shadows anywhere. Depth comes from three steps of tonal layering (night → panel → panel-raised) plus 1px cool-slate borders. The only glow is the 3px mint-haze ring on the focused input.

### Named Rules
**The Tone-Not-Shadow Rule.** To lift a surface, step it one tone lighter and give it a 1px `line` border. Never add a box-shadow.

## Shapes

Soft and friendly. Cards use 12–14px corners, buttons and inputs 10px, and rows and icon tiles 8–9px. Pills (999px) are reserved for status and citation chips. Chat bubbles use 14px corners, with the corner nearest the speaker tucked to 4px: bottom-right for the user, bottom-left for the bot. Small 5–6px mint dots serve as bullets and status marks.

## Components

### Buttons
- **Shape:** gently rounded (10px), 44px tall.
- **Primary (Ask):** mint fill, deep forest text, weight 800 at 13px, with a trailing send icon. On hover it darkens to pressed mint over 0.12s.
- **Reset (ghost-dashed):** full-width, transparent, 1px dashed `line` border, faint text. On hover the text turns ink and the border turns muted.

### Chips
- **Verified pill (top bar):** mint haze fill, 28%-mint border, mint text at weight 700 and 11.5px, with a leading dot.
- **Source chip:** mint haze fill with mint text showing the source domain and a dot. On hover it inverts to solid mint with deep forest text. It appears under every factual answer.

### Cards / Containers
- **Corner Style:** 12px for rail cards, 14px for the chat panel.
- **Background:** panel.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px `line`.
- **Internal Padding:** 16px for rail cards; 18–22px for the panel header, chat body, and form.

### Inputs / Fields
- **Style:** night well, 1px `line` border, 10px corners, 13px/16px padding, mint caret.
- **Focus:** the border turns mint and a 3px mint-haze ring appears.

### Navigation
- **Top bar:** the gradient logo tile and "Facts Assistant" wordmark, then scheme tabs (13.5px, weight 600, muted). The active tab turns ink and gets a 2px mint underline. Hover turns the text ink.
- **Quick-question rows (rail):** a 28px tinted icon tile plus a 12.5px label. Hover raises the row to panel-raised. Rows are keyboard-activated with Enter or Space.

### Answer Bubble (signature)
Bot answers sit left, with a 26px gradient avatar and a panel-raised bubble. Each one opens with an uppercase answer-kind tag (dot + label, colored per the Tag Color rule), then the answer text, then a source chip when the answer is a fact. User bubbles are solid mint and sit right. Messages enter with a 6px rise and fade (0.28s, expo-out). A three-dot typing indicator plays for 350–600ms before each reply.

## Do's and Don'ts

### Do:
- **Do** attach the source chip to every factual answer. It is the most accented element in the answer.
- **Do** mark every bot answer with its answer-kind tag in the matching semantic color.
- **Do** create depth with tone steps and 1px borders instead of shadows.
- **Do** use tabular numerals anywhere figures appear.
- **Do** keep "Facts-only. No investment advice." visible on every screen.

### Don't:
- **Don't** use mint for decoration. It means verified, you, or act.
- **Don't** add box-shadows. The system is flat.
- **Don't** carry the Groww-derived pieces (the `#00D09C` mint, the Groww-style navbar, the mint-to-blue gradient logo) into a VerifiedFund redesign. They are recorded here as incumbent evidence, not as identity.
