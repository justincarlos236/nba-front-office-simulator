# Architecture

How this codebase is put together and why. For a system-by-system reference
(every feature, its data model and its formulas) see
[`SYSTEMS.md`](./SYSTEMS.md). For what is built versus not, see
[`ROADMAP.md`](./ROADMAP.md).

---

## The shape of the thing

A Next.js App Router application where the interesting code is not in the
framework layer at all.

```
src/
  app/          ~40 routes. Server Components that fetch and render.
  components/   Presentation, grouped by the domain they serve.
  lib/
    actions/    "use server" - the only layer that writes to the database
    <domain>/   Pure functions. No I/O, no Prisma, no React.
prisma/
  schema.prisma 49 models, 51 migrations
  data/         Committed real-NBA fixtures so a fresh clone can seed offline
```

**The one rule that explains most of the layout: rules are pure, effects are
not.** Every piece of domain logic — cap math, trade legality, valuation,
simulation, development, scouting — lives in `src/lib/<domain>/` as a
function that takes plain data and returns plain data. Anything that touches
the database lives in `src/lib/actions/` and is a thin shell around those
functions.

This is what makes 1,240 unit tests cheap. `validateTrade` needs no database,
no session, and no fixtures; it takes a trade and returns violations. The
tests that matter run in milliseconds against the real implementation rather
than against mocks.

It also means the same rule cannot drift between surfaces. The trade builder
gives live feedback by calling `validateTrade` in the browser; the server
action re-runs _the same function_ before committing. There is no second
implementation to keep in sync, and a client that lies gets rejected by the
identical code that drew the UI.

---

## Data model: reference data vs. per-save state

Two layers, deliberately separated.

**Reference data** — `Team`, `Player`, `PlayerSeasonStat`. One real-world
snapshot, imported once by the seed pipeline, shared by every user, never
mutated by gameplay. This is what a player's career stats table reads from.

**Per-save state** — `League` and everything under it: `LeagueTeam`,
`LeaguePlayer`, `Contract`, `Game`, `Trade`, `DraftPick`, and ~40 more.
Created by _cloning_ the reference snapshot when a league is created, then
evolving independently.

Creating a league copies ~500 real players into `LeaguePlayer` rows with
generated contracts. From that moment the save is its own universe: a trade
in one user's league is invisible to every other league and cannot touch the
canonical `Player` row.

This is borrowed from how franchise modes in sports games actually work —
static roster data maintained once, a mutable save layered on top — and it is
what makes multi-tenancy fall out almost for free. There is no "current
league" global. Every league-scoped query is keyed by a `leagueId` from the
URL and authorized against its owner.

**Money is `BigInt` cents everywhere.** Never a float, never dollars. Cap
math involves comparisons against thresholds where a rounding error is a
legality bug, so the type system is doing real work here.

---

## The salary cap engine

The part worth reading first, and the reason the project exists.

`src/lib/cap/constants.ts` holds season-by-season CBA figures — cap, luxury
tax, first and second apron, the MLE variants, the trade-matching
breakpoints — as one table keyed by season. Everything else derives from it,
so a rule change is a data change.

`computeCapSheet` turns a roster into a team's financial position: committed
salary, dead money, empty-roster charges for teams below 12 signed players,
cap space, and apron classification. Nearly every other system consumes it.

`validateTrade` is where the domain complexity actually lives. It returns a
list of violations rather than a boolean, because "why is this illegal" is
the useful answer:

- salary matching against the season's breakpoints, for teams below the first apron
- **second-apron no-aggregation** — a team over it cannot combine salaries to match
- no-trade clauses
- a Stepien-lite rule on consecutive future first-round picks
- multi-team trades, validated per-team rather than pairwise

Free agency enforces the mirror image: cap space, non-taxpayer versus
taxpayer MLE gated on apron status, the veteran minimum, and Bird /
Early-Bird / Non-Bird re-signing rights.

**The design commitment:** money never hard-blocks a legal basketball move.
The cap constrains what is legal; owner confidence and opportunity cost
supply the pressure. "You cannot afford this" is never a modal.

---

## Simulation

A game is **a point margin drawn from a normal distribution centred on the
strength differential**, with the winner falling out of the margin's sign.

```
expectedMargin = strengthDiff × MARGIN_PER_STRENGTH_POINT
homeMargin     = expectedMargin + gaussian() × MARGIN_SD
```

Win probability is therefore _literally_ "how often is this margin
positive" — the two can never disagree, because they are one draw.

This replaced an earlier model that drew the winner from a logistic curve
and the margin from a bounded uniform that never looked at team strength.
Measured over 246,000 simulated games, that model produced identical margin
distributions for a 97.5% favourite and a coin flip, and not one game in
246,000 decided by 1 or 2 points. The constants in `simulateGame.ts` each
carry the measurement that set them.

It is deliberately **not** a possession-by-possession simulation. That buys
speed, determinism, and a model small enough to reason about; it costs
play-by-play texture. Box scores are generated separately, distributing a
team's score across its rotation.

**Determinism is a design requirement, not a convenience.** Every stochastic
path takes an injected `rng: () => number` rather than calling `Math.random`
directly, so any simulated outcome can be reproduced from a seed and asserted
against in a test.

**Seasons simulate in chunks** (`CHUNK_SIZE = 50` games). A full 1,230-game
season in one request would exceed a serverless function's execution limit,
so the action advances a bounded number of games and returns. League activity
— injuries, CPU trades, CPU signings — rolls _per game_ rather than once per
chunk, so behaviour is a function of games played and not of an
infrastructure constant.

---

## Auth & multi-tenancy

Auth.js v5, Credentials provider with bcrypt, JWT sessions.

Every `League` has an `ownerId`. Every read of league-scoped data checks
ownership **at the data-access layer**, not in the UI, and returns **404
rather than 403** — a non-owner cannot even confirm that a league exists.

A user can run up to 5 concurrent franchises. This required almost no work,
because no page was ever written against "the user's league" — they were
always keyed by a `leagueId` in the URL plus an ownership check.

`trustHost: true` is required outside Vercel. Without it Auth.js rejects
every request in a production build with `UntrustedHost`. Dev mode implicitly
trusts localhost, so this only appeared when the Playwright suite started
running against `next build && next start` — which is the reason it runs that
way.

---

## Deliberate simplifications

Recorded because a portfolio project that hides its approximations is worse
than one that names them.

- **CBA figures are approximations** of publicly reported thresholds, not an
  authoritative record of the league's audited numbers.
- **Contracts are generated**, not real. Real salary data was not available
  under a license this project could use, so contracts are derived from the
  valuation model. They are plausible, not factual.
- **Player ratings are a hand-tuned heuristic** over box-score and true-shooting
  inputs — no BPM, no VORP, no on/off data. Low-volume, high-value role players
  are systematically undervalued by it.
- **No possession-level simulation.** See above.
- **Every page is dynamically rendered.** A session-aware `NavBar` in the root
  layout means every route calls `auth()`, which reads cookies. Fixable with a
  Suspense split or PPR; not yet worth the complexity.

---

## Testing

**1,240 unit tests across 139 files**, plus 10 Playwright end-to-end specs
covering league creation, trade execution, free agency, season simulation,
playoffs, the draft, and the offseason.

CI runs on every push and pull request against a real Postgres service
container: migrations, seed, lint, typecheck, format check, unit tests,
production build, then e2e against that build.

Three categories worth distinguishing:

1. **Rule tests** — `validateTrade` rejects an over-apron aggregation.
   Ordinary unit tests over pure functions.
2. **Statistical tests** — seeded, large-sample assertions that the
   simulation's _distributions_ are right: margins widen as mismatches grow,
   one-possession finishes and genuine blowouts both occur at NBA-like rates,
   team scores vary as much as real box scores, and home teams win 54–58% at
   equal strength. These catch the failure mode where every individual game
   looks fine and the league is nonsense. League-level spread (win totals
   across a full season) is measured out-of-band by `scripts/balance-harness.ts`,
   which runs hundreds of seasons against a real database.
3. **Invariant harnesses** — `longSave.invariant.test.ts` runs 20 seasons of
   the real progression loop and asserts the properties that make a long save
   survivable: players retire every season, population converges instead of
   compounding, the age distribution stays realistic.

Category 3 exists because of a defect that categories 1 and 2 both missed:
every seeded player was permanently 27 years old, so nobody aged, declined,
or retired, and a six-season save had recorded zero retirements. The unit
tests for the development and retirement models all passed — they were
correct functions being fed a constant. See
[`ROSTER_PROGRESSION_AUDIT.md`](./ROSTER_PROGRESSION_AUDIT.md).

---

## Audits

Three empirical audits of the running system, kept because the findings are
more informative than the architecture:

- [`SIMULATION_AUDIT.md`](./SIMULATION_AUDIT.md) — the game engine and season
  results, measured over 246,000 simulated games
- [`ROSTER_PROGRESSION_AUDIT.md`](./ROSTER_PROGRESSION_AUDIT.md) — ageing,
  development and retirement, measured against 13 live saves
- [`SECOND_PASS_AUDIT.md`](./SECOND_PASS_AUDIT.md) — a whole-simulator
  re-audit that re-verified every prior finding against the code

They score the system harshly and in places contradict earlier claims made in
this repository. That is the point of them.
