# Product

## Platform

web

## Users

The primary user is a basketball fan who wants to actually run a franchise:
someone who knows what the second apron is, or wants to, and who will spend
real time inside a save across multiple sessions. They are playing, not
sampling. The job is front-office decision-making — evaluating a roster,
finding a trade that clears legality, deciding who to scout, choosing what
the franchise becomes over seasons.

A second, real audience is engineers and recruiters evaluating the project
as a portfolio centerpiece: a visitor who spends a few minutes and needs to
leave understanding that the domain logic (CBA cap math, trade legality,
valuation, a real data pipeline, multi-tenant auth) is genuine depth rather
than a tutorial build.

**When the two conflict, the player wins.** The portfolio value is a
consequence of the game being genuinely good, not a separate thing to
design for. The evaluator is served by making the real product legible, not
by staging a demo on top of it.

## Product Purpose

Run an NBA franchise as its general manager, against the real 2023 CBA
rather than a simplified approximation of it. Every save starts from a real
snapshot of the NBA (30 teams, 497 real players, generated contracts
anchored to a valuation model) and diverges independently from there.

Success is a user who keeps returning to the same save: making trades that
the validator actually adjudicates, scouting a draft class over a pre-draft
window, running finances and an arena, and watching a franchise change shape
across seasons.

## Positioning

The rules are the product. Most trade tools stop at salary matching; this
implements apron classification, second-apron no-aggregation, no-trade
clauses, a Stepien-lite pick rule, multi-team trades, and mid-level
exception eligibility gated by apron status — and the same `validateTrade`
engine that gives live feedback in the builder re-runs server-side before
anything commits.

The "snapshot, then diverge" model is the second differentiator: reference
data (who a player really is, career stats) and per-save state (what is true
in this timeline) are separate layers with separate lifecycles, so one
user's league can never touch another's.

## Operating Context

Play is session-based and long-running. A save moves through real league
phases — regular season, playoffs, pre-draft, draft and lottery, offseason,
free agency — and the interface has to hold continuity across sessions:
returning users need to re-orient into a save they left days ago.

The surface area is already broad and organized into pillars: league
dashboard, roster and rotation, trades, free agency, finances (with arena,
operations, inbox, and report), scouting and the draft (big board, my board,
lottery, draft night), staff, fans, standings, schedule, playoffs, leaders,
history, transactions, all-star, career mode, and a multi-page in-app guide.
Design work touches a large, interconnected system, not isolated pages.

Users bring outside knowledge — real player names, real cap concepts, real
team identities — and the product is judged against that knowledge.

## Capabilities and Constraints

**Stack (existing):** Next.js 16 App Router, React 19, TypeScript, Tailwind
CSS v4, Prisma 7 + PostgreSQL, Auth.js v5 (credentials, JWT), Vitest +
Playwright, GitHub Actions CI, deployed on Vercel + Neon.

**Built and working:** the data pipeline and seed, the cap/trade/valuation
engine with unit tests, auth and per-user league ownership enforced at the
data-access layer, the core loop (sign up → pick a team → trade → sign free
agents), plus the draft/scouting, finances, staff, fans, and onboarding
pillars.

**Known constraints:**

- Rendering is largely dynamic: a session-aware NavBar in the root layout
  calls `auth()`, which made previously-static public pages (`/`,
  `/teams/*`) dynamic. Restoring static generation is a known open item.
- Team logos are hotlinked to Wikipedia thumbnails via `Team.logoUrl`, not
  hosted locally. `public/` is empty — there are no local image assets.
- Reference `Player.currentTeamId` is deliberately season-accurate to
  2023-24, not real-world-current. Rosters will look "wrong" versus today's
  NBA on purpose, and copy must not describe them as current.
- Fictional draft prospects are written into the shared `Player` table
  without league scoping and are not cleaned up on league deletion.
- The MLE check validates each signing against the exception's full
  per-season ceiling rather than tracking cumulative spend.

**Explicitly undecided / not yet built:** the AI GM assistant and its chat
UI (only the `AssistantThread`/`AssistantMessage` models exist — the README
calls it planned); GitHub OAuth; observability and error tracking. See
`docs/ROADMAP.md` for the current list.

**Terminology** is real NBA/CBA vocabulary and should stay real: apron,
mid-level exception, cap space, dead money, luxury tax, Bird rights, two-way
deal, Stepien rule.

## Brand Commitments

Name: **NBA Front Office Simulator**. Solo-built, MIT-licensed, positioned
in its own README as "a production-style web app, not a tutorial project" —
that self-description is a voice constraint as much as a claim.

Documentation voice is plain, specific, and technically candid: it names its
own simplifications and records bugs it caused and fixed. Product copy
should not drift into marketing language that this voice would not use. The
README explicitly avoids em dashes.

The incumbent interface is a dark, near-black world (`#05070a`) with layered
surfaces, an orange accent (`#ff7a1a`) and a gold secondary (`#ffcf40`),
Geist Sans/Mono, and existing reduced-motion-aware animation. This is
recorded as the incumbent state, not as a binding aesthetic decision — no
visual direction was set during init.

Real NBA names, marks, colors, and data are used freely; no IP constraint is
recorded for this personal, non-commercial project.

## Evidence on Hand

- **Live public demo:** https://nba-front-office-simulator-8s2o.vercel.app
- **Real seeded data:** 30 real teams with real brand colors, division,
  conference, and a qualitative market-size classification
  (`prisma/data/teams.ts`); 497 real players with real 2023-24 season
  averages aggregated from ~26k MIT-licensed box scores; 5 name collisions
  hand-resolved by alias.
- **Real engineering documentation:** `docs/ARCHITECTURE.md` (rationale and
  candid post-mortems), `docs/ROADMAP.md` (what is built vs. not), per-pillar
  design docs for scouting, finances, fans and onboarding, and three
  empirical audits of the simulation and roster systems.
- **Test suite** as the correctness story: 1,240 Vitest unit tests across 139
  files over the cap, trade, simulation and valuation engines, plus 10
  Playwright e2e specs over the core journeys, all run in CI on every push.

**Absences that must not be fabricated:** there are no users, no testimonials,
no traffic or engagement numbers, no press, no customers, no pricing, and no
awards. There are no local image assets in `public/`. The AI assistant does
not exist yet and must never be described as working.

## Product Principles

1. **The rules are the product.** Real CBA complexity is the reason to be
   here. Never simplify a rule away in the interface that the engine models
   correctly, and never imply certainty the engine does not have.
2. **The player wins over the evaluator.** Serve the person mid-franchise
   first; the portfolio impression follows from the game being good.
3. **Snapshot, then diverge.** Reference truth and save truth are different
   things. Never present one as the other, and never let a save's fiction
   leak into what a real player factually is.
4. **Depth must stay navigable.** The surface is already large and still
   growing. Every addition is judged on whether a returning user can still
   re-orient into their save.
5. **Candor over polish in language.** The project documents its own
   simplifications; the interface should hold the same standard rather than
   overclaiming.

## Accessibility & Inclusion

**WCAG 2.2 AA is the binding standard** for future work: contrast, full
keyboard operability, visible focus, correct labels and names, and honored
reduced-motion preferences. It is a requirement of the work as it is built,
not a cleanup milestone to be deferred.

Current state is partial: reduced-motion handling already exists in
`globals.css` for the lottery and marquee animations, but `ROADMAP.md` lists
the accessibility and responsive passes as not yet done, so existing screens
should not be assumed compliant.
