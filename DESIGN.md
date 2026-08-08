---
name: NBA Front Office Simulator
description: The paperwork of a real front office, rendered at professional-instrument quality, broken deliberately for the moments that matter.
colors:
  ground: "#0B0F14"
  field: "#121820"
  raised: "#1A222C"
  hairline: "#2E3A47"
  rule: "#5A6B7D"
  rule-strong: "#748799"
  ink: "#F2F5F7"
  ink-muted: "#93A1B0"
  signal-red: "#FF4D4D"
  positive: "#3DD68C"
  caution: "#FFB020"
  negative: "#FF6B6B"
  team-accent: "#F5B112"
typography:
  display:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 4.5rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(1.5rem, 3vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.09em"
  numeric:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  numeric-display:
    fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', monospace"
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
rounded:
  none: "0px"
  sm: "2px"
  full: "9999px"
spacing:
  hair: "0.25rem"
  tight: "0.5rem"
  snug: "0.75rem"
  base: "1rem"
  wide: "1.5rem"
  field: "2rem"
  section: "3.5rem"
components:
  button-primary:
    backgroundColor: "{colors.team-accent}"
    textColor: "{colors.ground}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1.25rem"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1.25rem"
    typography: "{typography.label}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.signal-red}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1.25rem"
    typography: "{typography.label}"
  field-block:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
    typography: "{typography.numeric}"
  status-badge:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.none}"
    padding: "0.125rem 0.5rem"
    typography: "{typography.label}"
---

# Design System: NBA Front Office Simulator

> **This document replaces the previous visual world** (near-black ground,
> orange accent, uniform card grid). That system is recorded in git history and
> is an anti-reference, not authority. Three decisions survived it on merit and
> are carried forward deliberately: the no-shadow doctrine, monospace for
> comparable figures, and a commitment to real information density.

## Overview

**Creative North Star: "The Wire"**

Basketball's front office runs on paper, and that paper has a specific look:
transaction wires, cap sheets, medical reports, scouting packets, tampering
memos, collective bargaining documents. Ruled, monospaced, stamped, filed. Not
nostalgic — current. This is what the job actually looks like, and rendering it
at professional-instrument quality is what makes a screen full of salary
figures read as *authority* rather than as a spreadsheet.

The world's governing idea is that **the document language is a floor, not a
ceiling.** Roughly eighty percent of routes are documentary: ruled fields,
tabular figures, tracked labels, no ornament. That baseline exists so the
remaining twenty percent can break it. Draft night is a broadcast. A blockbuster
trade splits the screen between two franchises. Being fired drains the color out
of the interface entirely. A break only lands if there is a frame to break, and
the paperwork is that frame.

The second governing idea is that **the franchise colors the interface.** Thirty
real team palettes are already seeded in `prisma/data/teams.ts` and were
previously spent on a four-pixel border stripe. Here, the user's team accent is
the interface's accent for the entire save, so running Memphis does not look
like running New York. This is the single largest perceptual difference from the
previous world, and it is free — the data already exists.

**Key Characteristics:**

- Documentary baseline; Broadcast and Record registers reserved for real moments
- Team identity as environment, not decoration — one accent per save
- Ruled fields and weighted rules, never floating cards
- Flat by law: no shadows anywhere, depth from tone and rule weight
- Monospace for every comparable figure; prose never
- Density is the point; the previous system's failure was undifferentiated
  density, not density itself
- Square by default (0-2px); roundness is reserved and rare

## Colors

A four-step neutral ramp from document ground to ink, three rule weights doing
the structural work shadows do elsewhere, one per-save team accent, and a fixed
semantic set that never varies by team.

### Primary

- **Team Accent** (per save, resolved from real team data): the franchise's own
  color, used for the dashboard header field, the primary action, active
  navigation, and figures that represent the user's own position. Because it
  changes per save, no layout may depend on a specific hue. The frontmatter
  value (`#F5B112`, Memphis gold) is a representative default for tooling only.

### Secondary

- **Signal Red** (`#FF4D4D`): the league office. Reserved exclusively for
  authority-level alerts — apron violations, blocked trades, firing notices, a
  season-ending consequence. Never used for ordinary errors, and never as a
  team accent even for red-identity franchises. Its rarity is its meaning.

### Tertiary

The semantic set, fixed across every save so state never depends on which team
you run.

- **Positive** (`#3DD68C`): surplus, cap room, gains, favorable outcomes.
- **Caution** (`#FFB020`): approaching a threshold, provisional, unresolved.
- **Negative** (`#FF6B6B`): validation failures, over-limit states, losses,
  injuries. Distinct from Signal Red: negative is *your* problem, signal red is
  *the league's* ruling.

### Neutral

- **Ground** (`#0B0F14`): the page. A blue-black with a faint warm cast — a
  document under desk light, not a void. Painted once on `body`.
- **Field** (`#121820`): the working surface a document sits on. The default
  container fill.
- **Raised** (`#1A222C`): inputs, table headers, inset blocks — anything nested
  inside a field.
- **Hairline** (`#2E3A47`): decorative separation only, where no meaning is
  carried. Deliberately below the non-text contrast threshold and therefore
  never permitted as a sole structural or focus signal.
- **Rule** (`#5A6B7D`): the default structural rule (3.26:1 on field). Column
  separators, field edges, table rules.
- **Rule Strong** (`#748799`): section boundaries and the focus ring (4.81:1 on
  field).
- **Ink** (`#F2F5F7`): primary text and figures (16.29:1 on field).
- **Ink Muted** (`#93A1B0`): labels, annotation, secondary text (6.77:1 on
  field).

### Named Rules

**The League Office Rule.** Signal red belongs to the league, not to you. It
appears only when an authority outside the user rules on something: a trade
blocked by the apron, a Stepien violation, a firing. If the user caused it and
can fix it, that is negative, not signal red.

**The One Franchise Rule.** Exactly one team accent is live per save — the
user's. Opposing team colors appear only where two franchises are structurally
equal in the frame (a trade outcome, a playoff series). A league-wide table does
not paint thirty accents; it uses ink.

**The Weighted Rule Rule.** Structure is carried by three rule weights, not by
one hairline repeated. Hairline separates things that are merely adjacent; rule
separates things that are different; rule-strong separates things that are
unrelated. Any rule that carries meaning must clear 3.0:1 — hairline never
qualifies.

### Team accent intake

Team primaries were measured against the ground: **16 of 30 fail 3.0:1**, and
for Minnesota and Dallas both primary and secondary fail. The accent is
therefore resolved by a documented cascade, never taken raw. Every candidate
must clear **two** bars — legible against the ground, *and* chromatic enough to
read as a franchise colour:

1. Use `primaryColor` if it clears 4.5:1 and carries real chroma (OKLCH C ≥ 0.04).
2. Otherwise `secondaryColor` under the same two conditions.
3. Otherwise lighten whichever brand colour has chroma, in OKLCH, preserving hue
   until it clears 4.5:1.
4. Otherwise — a genuinely monochrome franchise — use the muted slate `#748799`.

**Why the chroma bar exists.** Contrast alone is not sufficient, and shipping
without this was a real defect. Brooklyn's colours are `#000000` and `#FFFFFF`:
black fails contrast, white passes at 19:1, and the franchise header rendered
as a blinding white slab while every other team got a real colour. San Antonio
(silver) and Milwaukee (cream) had the same failure mode. A near-neutral is
legible and still not an identity.

All thirty teams resolve at 4.5:1 or better: 13 fall to secondary, 15 are
lightened, and 2 (Brooklyn, San Antonio) take the monochrome slate, where the
logo and wordmark carry identity instead. The results are recognizable rather
than arbitrary — the Lakers land on gold, the Celtics on gold, the Grizzlies on
gold.

## Typography

**Display / Body:** Archivo (with Helvetica Neue, Arial)
**Numeric:** JetBrains Mono (with ui-monospace, SF Mono)

**Character:** Archivo is a grotesque with real structural presence — tight
apertures, a slightly condensed frame, and enough weight at display sizes to
carry a broadcast headline without shouting. It reads as institutional signage
and document typography rather than as product-UI default. JetBrains Mono is
chosen over a document-classic mono because its figures are unambiguous at 12px
in a dense table, which is where most of this product's numbers live.

The previous world used Geist Sans and Geist Mono — the framework default, and
the typographic equivalent of an unmodified starter template.

### Hierarchy

- **Display** (700, `clamp(2.75rem, 6vw, 4.5rem)`, 0.95): Broadcast surfaces
  only — a prospect's name on the clock, a trade headline, the end of a tenure.
  Never appears on a documentary surface.
- **Headline** (600, `clamp(1.5rem, 3vw, 2rem)`): Surface titles and the
  dashboard's franchise record.
- **Title** (600, 15px): Field headings, row emphasis, button text.
- **Body** (400, 15px, 1.55): Reading text and dispatches. Capped near 70ch.
- **Label** (600, 11px, 0.09em, uppercase): The organizing device of the entire
  system. Every field, column, and status carries one.
- **Numeric** (mono, 15px, tabular): Every comparable figure.
- **Numeric Display** (mono 500, `clamp(2rem, 4vw, 3rem)`): The one or two
  figures a surface exists to communicate — cap space on the dashboard, the
  final margin on a result.

### Named Rules

**The Tracked Label Rule.** Groups are introduced by an 11px uppercase label at
0.09em tracking in ink-muted, never by a heading size step. This is inherited
from the previous system, where the pattern appeared 71 times and was the one
convention worth keeping wholesale.

**The Mono-For-Money Rule.** Any figure a user compares across rows — salary,
cap space, rating, record, age, minutes — is set in JetBrains Mono with
`tabular-nums`. Prose is never mono. This survived from the previous world and
is now enforced by the `StatCell` primitive rather than by discipline.

**The Display-Is-Earned Rule.** Display type is a Broadcast privilege. If a
documentary surface wants to feel important, it uses numeric-display on one
figure, not display type on a heading.

## Layout

**The archetype system.** The previous world's central failure was that all 25
routes shared one skeleton (`mx-auto max-w-4xl px-6 py-16`, a title, a
paragraph, a card grid). Layout is now owned by five archetypes, and an
archetype's rules are binding:

- **Desk** — orient and decide. Asymmetric: a wide reading column with a narrow
  persistent figure rail. One focus, supporting material below. Container
  1200px. *(dashboard, `/leagues`)*
- **Workbench** — build something and see consequences live. Two panels plus a
  verdict region that never scrolls out of view. Container 1400px. *(trade
  builder, rotation, contract offer, draft board)*
- **Broadcast** — a moment happens to you. Full-bleed, centered, staged, no
  container max. The only archetype with a real motion budget and the only one
  permitted display type. *(draft night, lottery, trade outcome, playoff series,
  career end, championship)*
- **Ledger** — scan and compare a real dataset. Ruled columns edge to edge,
  filters as first-class header controls, density maximized. Container 1400px.
  *(standings, leaders, finances, free agency, transactions, roster)*
- **Record** — read what already happened. Single narrow column, editorial,
  past tense, no controls. Container 720px. *(history, career, narratives,
  player profile)*

**Spacing.** A 4px base scale concentrated in seven steps. Field interiors use
`field` (2rem); sections separate by `section` (3.5rem). Vertical rhythm is
asymmetric by design: more space above a heading than below it, so a label binds
to the content it introduces.

**Responsive.** Container padding reduces at small widths (the previous system
held `px-6 py-16` at every viewport). Ledger tables scroll horizontally inside
their own container and never force the page to scroll sideways. Broadcast
surfaces reflow to portrait staging rather than shrinking their display type
below legibility.

## Elevation & Depth

**There are no shadows in this system, and this is doctrine rather than
omission.** The previous world held a zero-shadow rule across its entire
codebase without a single exception; it was its most disciplined decision and it
is carried forward unchanged.

Depth is expressed two ways. **Tonal layering** in three steps: ground for the
page, field for a document on it, raised for something nested inside a document.
There is no fourth step, and a nested element never returns to ground.
**Weighted rules** carry structure, per The Weighted Rule Rule.

The only atmospheric effect permitted is a translucent, backdrop-blurred header
over content. No glows, no gradients on interactive surfaces, no glass.

### Named Rules

**The Flat Law.** Nothing floats. If an element must separate from its
background it takes a tonal step and a rule, never a shadow. A `box-shadow`
anywhere in this codebase is a defect.

## Shapes

Square is the default. The document world has cut edges, not rounded ones, and
this is the sharpest visual break from the previous system's 8px/12px
vocabulary.

- **0px** — fields, tables, rows, panels, and every large container.
- **2px** — buttons, inputs, badges: just enough to read as a control rather
  than a printed block.
- **Full round** — reserved exclusively for genuinely circular objects: player
  avatars, status dots, progress tracks.

There is no intermediate radius. A 6px or 12px corner anywhere is a drift back
toward the previous world.

Borders are 1px by default. Emphasis comes from rule *value*, not width, with
one exception: a Broadcast surface may use a heavy team-color field as a
structural element, which is a field rather than a border.

## Components

### Buttons

- **Shape:** 2px radius, square-shouldered
- **Primary:** team accent fill with ground-colored text, label typography
  (11px, tracked, uppercase). One per surface.
- **Secondary:** transparent with a `rule` border and ink text.
- **Danger:** transparent with signal-red text and border. Used only for
  league-office-severity actions.
- **Focus:** a 2px `rule-strong` outline at 2px offset. Mandatory on every
  variant — the previous system had zero `focus-visible` declarations
  product-wide.

### Field Block

The replacement for the card. A field is a region of `field` fill with a `rule`
top edge and an 11px tracked label sitting on that edge. No border on all four
sides, no radius, no shadow — a field reads as a section of a document rather
than as a floating object.

### Status Badge

Text-only: a tracked 11px uppercase label in the semantic color, with no fill
and no pill. The previous system had four separate badge-class maps introducing
`sky` and `purple` as category colors; those are gone. Status is semantic or it
is ink.

### Data Table

- Header row in `raised` with tracked labels and sort affordances.
- Body rows separated by `hairline`; column groups separated by `rule`.
- All figures mono and `tabular-nums`.
- Row hover raises fill one step; no border change.
- Filters live in a header bar as first-class controls, never below the table.

### Inputs

`raised` fill, `rule` border, 2px radius, mono for numeric entry. Focus swaps
the border to `rule-strong` **and** adds the focus ring — the previous system
relied on a border change alone at 1.30:1, which was invisible and failed the
non-text threshold.

### Navigation

A filing system rather than a flat row. Sections group into drawers (Team,
League, Business); the current phase's drawer is open. Each drawer carries a
count when something inside needs the user, which is the mechanism the previous
system lacked — it had exactly one badge, inside the section it described.

### Phase Indicator

A persistent element stating the league phase in tracked caps with a one-clause
expectation ("PRE-DRAFT · SCOUT THE CLASS"). The previous system computed five
phases, gated six systems on them, and never named the phase anywhere inside a
save.

## Do's and Don'ts

### Do:

- **Do** resolve the team accent through the documented cascade, never from raw
  `primaryColor`.
- **Do** give every group an 11px tracked uppercase label.
- **Do** set every comparable figure in mono with `tabular-nums`.
- **Do** use three rule weights for structure, and keep any meaningful rule at
  or above 3.0:1.
- **Do** pick the archetype before the layout, and follow its container,
  density, and motion budget.
- **Do** put a visible focus ring on every interactive element.
- **Do** reserve display type, staging, and motion for Broadcast surfaces.
- **Do** wrap all motion in `prefers-reduced-motion`.

### Don't:

- **Don't** add a shadow. Anywhere.
- **Don't** use a radius other than 0, 2px, or full round.
- **Don't** use signal red for an ordinary validation error.
- **Don't** paint multiple team accents on one surface outside a two-franchise
  frame.
- **Don't** introduce a raw Tailwind palette color. The previous system
  accumulated 294 such uses across 12 hues against an 8-token palette; every
  color must come from a token.
- **Don't** reintroduce the universal `max-w-4xl px-6 py-16` wrapper or a
  uniform card grid — that skeleton is the specific failure this world exists
  to correct.
- **Don't** let a Ledger adopt Broadcast staging, or a Broadcast render a filter
  bar.
- **Don't** assume a light mode. There is no light palette.
