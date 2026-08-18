# Roadmap

Built in milestones across many sessions rather than all at once, so each
phase reaches a genuinely polished, tested state before moving on.

**Status:** the simulator is feature-complete as a single-player franchise
management game — a full season loop from preseason through the draft, with
salary-cap, trade, free-agency, scouting, finance, fan and career systems on
top of real NBA reference data. **1,240 unit tests across 139 files**, plus
10 Playwright e2e specs, all run in CI on every push.

The original M0–M6 milestone plan is preserved at the bottom for history. It
stopped describing the product around the time the season engine landed, so
what follows is organised by system rather than by milestone.

---

## What's built

### The season loop

- Schedule generation, game simulation from team strength, and per-game box
  scores for every player
- Standings, league leaders, and a play-in tournament
- Playoff bracket with series simulation, plus **live game-by-game playoff
  games** the user watches possession by possession and sets a rotation for
- All-Star weekend
- Offseason: retirements, progression/regression, draft, free agency, and
  season advancement gated on the phases actually being complete

### Salary cap & the CBA

- Season-by-season constants: cap, luxury tax, first and second apron, MLE
  variants
- Cap sheet per team per season — committed salary, empty-roster charges,
  dead money, apron status, cap space
- Trade legality: salary matching, second-apron no-aggregation, no-trade
  clauses, Stepien-lite pick protection, multi-team trades
- Free agency: cap space, non-taxpayer and taxpayer MLE gated by apron,
  veteran minimum, and **Bird / Early-Bird / Non-Bird re-signing rights**
- Multi-year projection and a financial flexibility grade

### The draft

- Lottery with real odds, a full two-round draft, and traded-pick resolution
- **Scouting as a pillar**: per-prospect scouting depth, private workouts that
  resolve hidden traits, class character, a public big board and a private
  board, and a scouting report whose reliability is modelled rather than
  assumed — every axis can come back genuinely unresolved
- Draft-night broadcast presentation with pick reveals, and draft hindsight
  that grades picks in later seasons

### Front office & career

- Ownership: archetypes, confidence, written mandates, payroll directives, and
  firing
- Season expectations derived from payroll tier and roster strength, with the
  gap to the team's actual identity named where they disagree
- Team identity and needs, feeding the trade AI's evaluation
- Career records across saves, and retirement
- Staff hiring across scouting, development, analytics, sports science

### Business & fans

- Franchise finances: revenue, expenses, debt, cash reserve, franchise value
- Ticket pricing, capital projects, arena quality and lease, relocation
- Business decision inbox, sponsorships, and ownership negotiations
- Fan sentiment, culture, mandates, and a curated franchise memory

### Roster management

- Rotation board with target minutes, morale, injuries, trade requests
- Player progression and development
- Contracts as documents, with an immutable cap snapshot recorded on every
  executed trade so the consequence is evidence rather than a recompute

### Platform

- Auth.js v5, per-user league ownership enforced at the data-access layer
  (404s, not 403s — a non-owner cannot tell a league exists)
- **Multiple saves per user**
- Deployed on Vercel with auto-deploy from `main`

---

## Design

A full visual overhaul, documented in `DESIGN.md` and tracked in
`docs/design/REDESIGN_PLAN.md`. The design language is **The Wire** — a front-office
document system, with six page archetypes and a documentary baseline so a
small number of moments can break the frame.

Shipped across five phases: a graphic language (icons, gauges, stamps), the
Artifact archetype (contracts, rulings, letters, draft cards), franchise
history as objects, an environmental layer (30 authored city skylines,
phase-aware light, material texture), and the scouting/draft surfaces.

- [ ] **Photography** — four surfaces are specified in
      the design record and await image selection. Every one
      degrades to the authored treatment already shipped, so none is blocking.

---

## Not built

Recorded honestly rather than implied. See `PRODUCT.md`.

- [ ] **AI GM assistant.** Only the `AssistantThread` / `AssistantMessage`
      schema exists. No chat UI, no tool-use wiring, and the unused SDK
      dependency has been removed. Do not describe this as a feature.
- [ ] GitHub OAuth (credentials-only)
- [ ] Observability / error tracking
- [ ] Photography for the four surfaces that reserve space for it
      (see Design above) — each degrades to the treatment already shipped
- [ ] Restore static generation for public pages. A session-aware `NavBar` in
      the root layout made every page dynamic, since `auth()` reads cookies.
      Fixable with a Suspense split or PPR; not worth the complexity yet.

---

## Original milestone plan (M0–M6)

Kept for history. Every item below is complete except where the "Not built"
section above says otherwise.

**M0 — Foundations.** Next.js 16 + TypeScript + Tailwind, Prisma schema, Neon
Postgres, ESLint/Prettier/Vitest/Playwright, GitHub Actions CI.

**M1 — Data pipeline.** 30 real teams; ~26k real per-game box scores aggregated
into season averages; 497 real player bios pulled from balldontlie and joined
by name (5 needed hand-resolved aliases); contracts generated from the
valuation model rather than hand-curated salary figures.

**M2 — Salary cap & trade engine.** Superseded by the CBA section above.

**M3 — Core UI.** League browser, team rosters, player pages, the league
dashboard, the trade builder, and the free-agency board — all superseded by
the design overhaul.

**M4 — AI GM assistant.** The valuation model shipped. The assistant did not.

**M5 — Auth & multi-tenancy.** Complete, including multiple saves.

**M6 — Polish & production.** Deployed, with two deploy-only issues found and
fixed: a missing `postinstall: prisma generate` (the gitignored client does not
exist on a fresh checkout) and a missing `AUTH_SECRET` (which surfaces as
Auth.js's generic "server configuration" error in production). Accessibility,
responsive, error-boundary and empty-state passes all landed during the
redesign — focus rings are defined once in `globals.css` for every interactive
element, and WCAG 2.2 AA is a binding commitment per `PRODUCT.md`.

**Stretch goals.** The season simulation engine was listed here as a stretch
goal. It is built, and the game is now largely about it.
