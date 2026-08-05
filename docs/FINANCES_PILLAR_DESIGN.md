# Finances as a First-Class Gameplay Pillar - Design Proposal

**Status:** proposal, awaiting approval. No code written.
**Request:** `docs/FEATURE_REQUESTS.md` -> "Finances as a First-Class Gameplay
Pillar (requested 2026-08-02)".
**Supersedes nothing.** This extends the existing Franchise Finances &
Business Operations system (Phases A-D, 2026-07-28) rather than replacing it.

---

## Part 1 - Architecture-overlap review

### 1.1 What already exists (and must be reused, not rebuilt)

| Area                     | Where it lives                                                                                                         | What it already does                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Season P&L               | `src/lib/finances/finances.ts`, `FinancialSnapshot` model                                                              | Four revenue buckets (ticket/media/playoff/league), five expense buckets (payroll/luxury tax/staff/investment/operating), net income, financial health tiers |
| Franchise value          | `computeFranchiseValue` in `finances.ts`, `LeagueTeam.franchiseValueCents`                                             | Smoothed multi-season value from market, cash, performance, icons                                                                                            |
| Cash                     | `LeagueTeam.cashReserveCents`                                                                                          | Running retained earnings, may go negative, never blocks a legal roster move                                                                                 |
| Business levers          | `LeagueTeam.ticketPricingPosture` / `facilitiesInvestment` / `medicalInvestment`, `updateBusinessStrategyAction`       | Three dropdowns; ticket posture -> gate multiplier + fan delta, facilities -> `developPlayerRating`, medical -> injury roll                                  |
| Ownership money pressure | `src/lib/finances/ownershipFinance.ts`, `League.ownerConfidence` / `payrollDirectiveSeason` / `financialMandateSeason` | `FinancialStanding` from net-income history, patience factor, tax backing, escalating "return to profitability" mandate                                      |
| Franchise icons          | `src/lib/finances/franchiseIcon.ts`                                                                                    | Derived icon score (tier + tenure + homegrown + awards), value premium, departure penalty                                                                    |
| Fan engagement           | `src/lib/fans/`                                                                                                        | `fanHappiness` 0-100, `franchisePopularity`, `attendancePct`, and **in-season sentiment deltas** (`applyFanHappinessDelta`)                                  |
| In-season event hook     | `src/lib/actions/leagueEvents.ts`                                                                                      | Per-game probability rolls already fire injuries, CPU trades/signings, morale events, All-Star buzz                                                          |
| News feed                | `LeagueTransaction` + `NewsImportance`                                                                                 | Typed, filterable feed; `FINANCIAL_REPORT` / `FRANCHISE_MILESTONE` / `OWNERSHIP_MESSAGE` types exist                                                         |
| Recommended actions      | `src/lib/gm/actionCenter.ts`                                                                                           | Fixed-priority "what should I do next" list on the dashboard                                                                                                 |
| Sim loop                 | `simulateGamesAction(leagueId, "NEXT_GAME" \| "NEXT_10_GAMES")`                                                        | Chunked simulation anchored on the user's team                                                                                                               |
| Finances UI              | `src/app/leagues/[id]/finances/page.tsx` (484 lines)                                                                   | Health/value/cash summary, mid-season projection, revenue-vs-expense breakdown, drivers explainer, two trend charts, business-strategy controls              |

### 1.2 Honest diagnosis - why it does not currently feel like a pillar

The existing system is a good **simulation** of franchise finance and a poor
**game** of it. Concretely:

1. **Three decisions per season, all of them dropdowns.** Ticket posture,
   facilities, medical. Set once, forget. Compare to roster building, which
   offers a decision on nearly every screen.
2. **Consequences are deferred to the season boundary.** The entire P&L is
   computed in one batch inside `advanceSeasonAction`. Nothing you do in
   November has a visible financial consequence in December.
3. **Cash has no competing sinks.** You cannot spend it on anything except
   raising an investment level. Money therefore accumulates into an inert
   number - the exact failure mode Phase D partly patched (owner tax backing)
   but did not solve.
4. **There is no counterparty.** Trades have 29 CPU GMs; free agency has
   players with preferences. Finance has nobody to negotiate with, so there is
   nothing to outsmart.
5. **No commitment or risk.** Every financial choice is instantly reversible
   next season. Reversible choices are not strategic choices.

The redesign targets exactly these five gaps. Every proposed system below is
justified against at least one of them.

### 1.3 Constraints the design must respect

These are load-bearing decisions already made in this codebase. The design
honors all of them:

- **Cap/CBA rules stay authoritative.** Money never hard-blocks a legal roster
  move. It applies pressure through owner confidence, opportunity cost, and
  contractual penalties - never through "you cannot sign this player."
- **Canonical reference data is immutable.** `Team`, `Player`,
  `PlayerSeasonStat` are seeded once and shared by all saves. Anything mutable
  (including a relocated team's market size) belongs on `LeagueTeam`.
- **Consume the fan system, never duplicate it.** Attendance and popularity
  keep flowing from `src/lib/fans/`; new mechanics feed inputs into it rather
  than computing parallel numbers.
- **Seed/sim boundary.** Imported real-world data establishes initial state
  only. New business state is per-league and evolves independently.
- **Generated/fictional future leagues must work identically.** No mechanic may
  depend on a real-world player or brand name existing.
- **Existing saves get backfilled**, per standing project rule.
- **Basketball stays primary.** The win condition is still building a great
  team; money is a resource and a constraint, not the score.

### 1.4 Direct conflicts and overlaps found

Seven things need an explicit decision or migration. These are the real
architectural findings:

1. **The two investment dropdowns get subsumed.** `facilitiesInvestment` and
   `medicalInvestment` become two departments inside the proposed operations
   budget (System 6). Their existing effects (`INVESTMENT_QUALITY_DELTA` into
   `developPlayerRating` and the injury roll) are preserved and re-pointed at
   the new department levels. Existing saves need a mapping migration
   (MINIMAL/STANDARD/PREMIUM -> a budget allocation) so no save silently loses
   its configuration.
2. **The P&L is batch-only.** In-season decisions cannot show up in a model
   that is computed once at the season boundary. This needs a running
   accrual - proposed as an itemized `BusinessLedgerEntry` table plus a cached
   `LeagueTeam.inSeasonAdjustmentsCents`, folded into `computeSeasonRevenue` /
   `computeSeasonExpenses` as two new "other income / other expense" buckets.
   `FinancialSnapshot` gains matching columns. This is the single largest
   structural change in the proposal.
3. **The sim loop cannot currently be interrupted.** Football Manager's core
   loop works because simming _stops_ when something needs you. Today
   `simulateGamesAction` runs its chunks to completion. It needs to return a
   "halted early - a decision is waiting" result and the client needs to
   surface it. Without this, deadline-bearing decisions are meaningless.
4. **Relocation vs. canonical `Team.marketSize`.** Market size lives on the
   shared `Team` table. Relocation requires `LeagueTeam.marketSizeOverride`
   plus a `LeagueTeam.cityNameOverride`, and every read of market size must go
   through one resolver helper. Cheap to do correctly, expensive to retrofit -
   flagging now.
5. **CPU participation is a performance and balance risk.** 30 teams resolving
   every decision card each season is both slow and impossible to balance.
   Confirmed resolution (Part 5): **selective depth** - a two-tier model.
   _Tier 1, genuinely simulated:_ the franchise-defining events that generate
   league stories over decades - ownership changes, arena projects,
   organizational investment shifts, major financial swings, and relocation
   under the same near-unreachable gating the user faces. These are rare per
   team per season, so the cost is bounded. _Tier 2, formula-abstracted:_
   routine business - sponsorship income, ticket postures, department drift -
   computed directly with no card resolution. The design goal is a believably
   evolving league, not parity.
6. **`actionCenter.ts` overlaps the proposed inbox.** The Action Center is a
   derived, stateless recommendation list; the inbox is persisted, stateful
   decisions with deadlines. They are genuinely different. The integration is
   that the Action Center gains one high-priority item - "N business decisions
   awaiting response, earliest deadline in M days" - linking into the inbox.
   No duplication.
7. **Sponsorship conditions vs. trade validation.** A sponsorship clause tied
   to a player ("keep this star rostered") must never block a trade. It surfaces
   as a warning in the trade builder and a penalty on execution. Same philosophy
   as cap authority: the game tells you the cost, then lets you pay it.

---

## Part 2 - The design

### 2.0 Design spine: the Front Office Inbox

Everything below emits into one shared surface rather than seven new pages.

**Model:** a `BusinessDecision` row per pending decision - a typed kind, a
generated headline and body, 2-4 structured options each with a described
consequence, a deadline expressed in season-day index, and a resolution record.

**Rules that make it a game rather than a menu:**

- **Deadlines are real.** Simming past a deadline auto-resolves to the
  designated default option, which is never the best one. Ignoring the business
  side is a playable strategy with a real, understood cost.
- **Simulation halts on `BREAKING` decisions.** Clicking "sim 10 games" stops
  at game 4 when the owner calls. This is the beat that makes a management game
  feel alive, and it is why finding 1.4.3 must be fixed first.
- **Every option shows its cost in the currencies the player already tracks:**
  cash, fan happiness, owner confidence, franchise value, player morale, roster
  flexibility. No option is free.
- **No option is strictly dominant.** This is a design review criterion for
  every card written, not an aspiration - each card gets checked against it.

Decisions also write into the existing `LeagueTransaction` news feed on
resolution, so the season's business narrative reads back in the same place as
trades and injuries.

---

### System 1 - Sponsorship & Commercial Deals

**What it is.** Multi-year commercial contracts the user negotiates and signs:
jersey patch, arena naming rights, a local broadcast deal, an apparel partner,
an international market partnership.

**The decision.** Offers arrive with a term, an annual value, and a condition
that creates the trade-off. Representative cards:

- _Bet on yourself:_ 1 year at $18M vs. 5 years at $22M/yr. If you win a title
  your commercial value spikes - locking in long caps your upside, but going
  short and missing the playoffs craters the next offer.
- _The star clause:_ $32M/yr for 4 years, contingent on a named player staying
  rostered. Trading them is allowed, voids the deal, and triggers a buyout
  penalty. Roster flexibility, priced.
- _The unpopular money:_ a brand your fans dislike pays 25% above market.
  Cash up, fan happiness down.
- _The equity swap:_ lower annual cash, a share of franchise-value upside.
  A bet on your own multi-season plan.

**Why it improves the game.** It supplies the missing counterparty and the
missing commitment. Offer quality is computed from state you already earn -
market size, `franchisePopularity`, `fanHappiness`, star tier, franchise icon
score, recent playoff runs - so winning basketball visibly buys better business
options. That is the requested feedback loop, made legible.

**Cadence.** 2-5 decisions per season, clustered in the preseason plus
event-triggered offers after a championship, a blockbuster trade, or a
superstar's breakout.

**Integration.** New `sponsorshipCents` revenue bucket. Reads
`franchiseIcon.ts` and the fan system as inputs. Conditions surface as warnings
in the trade builder. CPU teams receive a formula-computed sponsorship line.

---

### System 2 - The Arena (multi-season capital projects)

**What it is.** Per-league arena state - capacity, quality, age, lease term
with the city - and the long-horizon projects that change it. This is the
Civilization "build a wonder" beat.

**The decision.** Three paths, each a genuine multi-season commitment:

- **Renovate** - moderate cost, 1-2 seasons, reduced capacity _during_
  construction. You accept a revenue dip now for a permanent gate lift later.
- **Build new** - very large cost, 3-4 seasons, almost always requires
  financing (System 3) and a public-funding negotiation with the city. Largest
  franchise-value and revenue payoff in the game. The negotiation can fail,
  leaving you with sunk cost and a decision about what to do next.
- **Do nothing** - a real option. An aging arena slowly bleeds capacity,
  quality, and eventually leverage in lease negotiations.

**Relocation - the last resort, deliberately near-unreachable.** Per the
confirmed decision in Part 5, the entire finance system is designed around
franchises _staying in their market_. Relocation is not a business option on a
menu; it is what is left when every other path has failed. It unlocks only when
a demanding conjunction of conditions holds simultaneously - sustained
financial distress across multiple seasons, repeated failed arena/lease
negotiations with the city, an expired or expiring lease, and ownership
pressure already at a breaking point. Meeting all of them should be the
exception across a long career, not a route a player can steer toward as an
optimization.

When it does unlock, it is franchise-defining and permanent: an enormous
franchise-value and market-size change, a catastrophic and slow-healing
fan-happiness collapse, an owner-confidence gamble, a rewritten team identity,
and an indelible entry in the save's history. Renovation and new construction
must remain the strictly better play in essentially every reachable game state;
if balance testing ever shows relocation reading as an efficient move rather
than a desperate one, the gating is wrong and gets tightened.

**Why it improves the game.** It is the only mechanic here that spans multiple
seasons irreversibly, which is precisely what makes a strategy game's decisions
weigh anything. It also gives cash a large, worthy sink, fixing gap 1.2.3.

**Cadence.** Rare and enormous - a handful of moments per save - with a
persistent project tracker visible on the finances screen throughout
construction.

**Integration.** Capacity and quality feed `computeAttendancePct` inputs rather
than replacing the fan model. Relocation uses `LeagueTeam.marketSizeOverride`
per finding 1.4.4. Construction milestones emit news.

---

### System 3 - Financing, Debt & the Owner's Wallet

**What it is.** Structure for the currently-inert cash balance. Three ways to
get money you do not have, each with a different price.

**The decision.**

- **Debt.** Take a loan against future revenue. Interest becomes a real
  recurring expense line. Ownership dislikes leverage - high debt reduces
  patience and accelerates mandates.
- **Owner capital call.** Ask the owner to write a cheque. The money is free;
  the _confidence_ is not. This is the cleanest trade-off in the entire design
  because it converts one existing currency directly into another.
- **Distressed league financing.** Available when financially desperate, at
  terms bad enough that taking it is an admission.

**Why it improves the game.** It turns "should I go into the luxury tax" from a
cap question into a genuinely multi-dimensional one: the cap permits it, the
cash may not cover it, debt can bridge it, and the owner will remember it. It
also makes recovery from a bad financial position an interesting problem to
play rather than a slow death.

**Cadence.** On demand, plus forced decisions when a payment comes due or the
owner notices the balance sheet.

**Integration.** Extends `ownershipFinance.ts` (`FinancialStanding` gains a
leverage input). New `interestExpenseCents` bucket. Debt load feeds
`financialSpendingResistance` for CPU teams.

---

### System 4 - Ownership as a Character

**What it is.** Ownership is currently two mechanical mandates. This turns it
into a personality you manage across a career.

**The decision.**

- **Owner archetypes** - Win-Now Billionaire, Penny-Pincher, Patient Builder,
  Absentee, Meddler. Each weights owner confidence differently, grants
  different capital access, sets different expectations, and issues different
  directives. The same GM performance reads as a triumph to one owner and a
  disappointment to another.
- **Directives become negotiations.** Today a mandate simply appears. Instead:
  accept it, or **push back and stake confidence on an outcome** - "give me one
  more season and we make the second round." Delivering on a stake is the
  largest confidence swing available in the game. Missing it is worse than
  never having negotiated.
- **Ownership changes hands.** Occasionally the franchise sells. A new owner
  with a new archetype resets your strategic environment mid-career, sometimes
  mid-rebuild. This is the single highest-value replayability mechanic in the
  proposal and costs almost nothing to build once archetypes exist.

**Why it improves the game.** It converts owner confidence from a hidden
scoreboard into a relationship with a character who has known preferences you
can plan around - and occasionally an unwelcome new one you cannot.

**Cadence.** 2-4 interactions per season, plus a rare ownership change.

**Integration.** Extends `League.ownerConfidence` and `ownershipFinance.ts`;
does not replace them. Archetype modulates the existing `computeConfidenceDelta`
and `expectationLevel` calculations. Ties into GM reputation and the existing
job market.

---

### System 5 - Season Tickets & Dynamic Pricing

**What it is.** An upgrade of the ticket-posture dropdown into something with
memory: a sticky **season-ticket base** (0-100) that forms the floor under
gate revenue.

**The decision.** The base grows slowly with sustained winning, high fan
happiness, and fair pricing - and **erodes quickly** with gouging and losing.
That asymmetry is the whole mechanic: premium pricing is genuinely tempting for
a contender and genuinely costly for a rebuilder, and a cash grab during a bad
season takes years to undo. On top of the base sit in-season pricing moments:
playoff ticket pricing (gouge a deep run or reward the fans), promotional
nights, giveaways.

**Why it improves the game.** It is the clearest example in the design of a
decision with an immediate payoff and a delayed, asymmetric cost - the single
most reliable generator of interesting choices in management games.

**Cadence.** One posture decision preseason, 2-4 in-season moments.

**Integration.** Consumes `fanHappiness` and feeds `computeAttendancePct`
inputs. Replaces the standalone posture multiplier while preserving
`TICKET_POSTURE_FAN_DELTA`'s intent. New `LeagueTeam.seasonTicketBase`.

---

### System 6 - Front Office Departments (operations budget)

**What it is.** Replaces the two investment dropdowns with a zero-sum
allocation problem across six departments: Scouting, Player Development,
Sports Science, Analytics, Marketing, Coaching Support.

**The decision.** The annual operations budget is capped by financial health,
so funding one department means starving another. Each department pays off in a
system that already exists:

| Department         | Existing system it feeds                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| Scouting           | Draft prospect evaluation accuracy (and the pending real-prospect pipeline) |
| Player Development | `developPlayerRating` - the current facilities effect                       |
| Sports Science     | Injury frequency and recovery - the current medical effect                  |
| Analytics          | Trade valuation confidence, CPU offer quality visibility                    |
| Marketing          | `franchisePopularity` growth, sponsorship offer quality                     |
| Coaching Support   | Staff effectiveness modifiers                                               |

Department levels move slowly, so the allocation is a commitment rather than a
slider you flip each season.

**Why it improves the game.** Scarcity is what makes an allocation a decision.
It also gives money a direct, legible line into basketball outcomes, which is
the request's central ask.

**Cadence.** Set in the preseason, adjustable once at the trade deadline.

**Integration.** Preserves `INVESTMENT_QUALITY_DELTA`'s effects, re-pointed at
department levels. Requires the migration in finding 1.4.1.

---

### System 7 - Business Events (the heartbeat)

**What it is.** A weighted event deck rolled during simulation - the mechanic
that actually delivers "finances feel alive."

**The decision.** Each card presents 2-3 options with different currency
trades. Eligibility is gated on real state, so cards always feel earned:

- _Crises:_ a sponsor pulls out after a player's off-court incident (reads the
  existing morale/personality system), an arena systems failure mid-season, a
  ticketing scandal, a league-wide revenue downturn.
- _Opportunities:_ an international preseason game (cash and popularity, but
  travel fatigue and a morale risk), a documentary crew (exposure vs. locker
  room), a jersey redesign, a G-League affiliate investment, a merchandise push
  built around a specific rising star.

**Why it improves the game.** This is the cadence engine. It is what turns the
finance screen from a place you visit once a season into a live feed you
respond to, and it is the cheapest system here to extend indefinitely - new
cards are data, not architecture.

**Cadence.** 6-10 per season, rate-limited to roughly one per 8-12 games so it
never spams.

**Integration.** Rides the existing per-game roll in
`src/lib/actions/leagueEvents.ts` - no new simulation machinery. Effects land
through the ledger from finding 1.4.2 and through existing fan/morale delta
helpers.

---

### System 8 - Business Expansion (organizational growth)

**What it is.** Capital projects that grow the _organization_ rather than the
arena: a G-League affiliate, an international academy or overseas market
office, a dedicated practice-and-performance facility, an arena-district real
estate play, a franchise media/content arm.

**The decision.** Each is a large multi-season commitment competing for the
same cash as the arena and the same attention as payroll. Each pays off in a
different currency, so there is no default best build:

- _G-League affiliate_ - a real development pipeline for young and two-way
  players, plus a place for prospects to grow. Basketball payoff, slow.
- _International academy / market office_ - `franchisePopularity` and
  sponsorship reach, especially valuable for a small market that cannot win the
  gate-revenue game. Business payoff, very slow, high ceiling.
- _Practice & performance facility_ - development and injury resilience, and a
  free-agency draw. Compounds with the Sports Science and Player Development
  departments.
- _Real estate / media arm_ - the purest money play: revenue diversification
  that insulates you from losing seasons, at the cost of everything else you
  could have built with that cash.

**Why it improves the game.** It is where a _patient_ strategy finally has
something to buy. Rebuilding teams currently have nothing constructive to do
with their financial slack; this gives the rebuild a build order. It also
extends ownership and investment naturally - an owner archetype meaningfully
changes which of these get approved.

**Cadence.** Rare and large, like the arena - a handful of commitments per
save, with visible construction/maturation progress in between.

**Forward compatibility with league expansion.** NBA league expansion is
confirmed as a **separate flagship feature for later** (expansion applications,
city selection, ownership approval, expansion fees, branding, an expansion
draft, schedule regeneration). Nothing here couples to it. Two cheap
precautions so the later feature slots in without a rewrite: keep every
business-expansion project keyed to a `LeagueTeam` rather than to any
league-wide roster of franchises, and keep the city/market concepts introduced
by relocation (`marketSizeOverride`, city identity resolution) in one shared
resolver that a future expansion feature can reuse for brand-new franchises.
Beyond that, no shared models, no shared enums, no anticipatory abstraction.

---

## Part 3 - Cadence summary

The pillar test: how often does the user make a real financial decision?

| System             | Decisions / season | Weight                        |
| ------------------ | ------------------ | ----------------------------- |
| Business events    | 6-10               | Small to medium               |
| Sponsorship        | 2-5                | Medium to large               |
| Ownership          | 2-4                | Medium to career-defining     |
| Ticket pricing     | 3-5                | Small to medium               |
| Departments        | 1-2                | Medium, multi-season          |
| Financing          | 0-3                | Large                         |
| Business expansion | rare               | Large, multi-season           |
| Arena              | rare               | Save-defining                 |
| Relocation         | near-never         | Franchise-defining, permanent |
| **Total**          | **~15-25**         |                               |

Fifteen to twenty-five meaningful decisions per season, arriving in the flow of
simulation rather than in a menu, is comparable to the decision density of the
trade and free-agency systems. That is what makes it a pillar.

---

## Part 4 - Risks

1. **Decision fatigue.** 25 cards a season becomes homework if the writing is
   weak or the options are obvious. Mitigation: strict "no dominant option"
   review per card, `MINOR` decisions batchable from the inbox, and a settings
   toggle for event frequency.
2. **Balance drift over a long career.** Compounding money systems tend to
   produce runaway leaders. Mitigation: a scripted 20-season CPU-only
   simulation harness as an explicit phase deliverable, checking that franchise
   values do not diverge without bound and that small markets stay viable.
3. **Scope.** This is the largest feature in the project's history - larger
   than the entire original Franchise Finances feature. The phasing in Part 6
   is designed so each phase ships something playable on its own.
4. **CPU cost.** Addressed by the abstraction in finding 1.4.5, pending your
   confirmation.
5. **Doc debt.** Four doc sets must be updated per standing rule, including the
   barely-started `extreme-deep-dive/` Track B. Budgeted into each phase rather
   than deferred to the end.

---

## Part 5 - Decisions confirmed (2026-08-05)

1. **Scope: build all seven systems, phased.** Full pillar, spread across
   sessions per the project's pacing rule, each phase independently playable.
2. **Relocation: exists, but as an extremely rare late-game last resort.**
   Gated behind prolonged financial distress, repeated arena-negotiation
   failures, an expiring lease, and sustained ownership pressure - never a
   routine business mechanic and never an optimization tool. The finance system
   is designed around franchises _staying_ in their markets; the overwhelming
   majority of saves renovate or build new. Consequences are permanent and
   franchise-defining. See System 2.
3. **Expansion: both, split across features.** _Business expansion_ is part of
   this pillar now (System 8), because it extends ownership, investments, and
   franchise growth naturally. _NBA league expansion_ remains a separate
   flagship feature for later - full expansion applications, city selection,
   ownership approval, expansion fees, branding, an expansion draft, and
   schedule regeneration, not merely inserting teams into the database.
   Today's work stays forward-compatible without coupling to it.
4. **CPU: selective depth.** Franchise-defining events (ownership changes,
   arena projects, organizational investments, major financial shifts, and
   relocation under the same gating) genuinely simulate so the league evolves
   believably over decades; routine business stays abstracted for performance,
   maintainability, and balance. Believable league evolution is the goal, not
   simulation parity. See finding 1.4.5.

---

## Part 6 - Proposed phasing

Each phase is independently playable and independently testable by hand.

- **Phase 1 - The spine.** `BusinessDecision` model, the inbox UI, the
  `BusinessLedgerEntry` accrual, sim-loop interruption, Action Center hook, and
  System 7 (business events) as the first live producer of decisions. After this
  phase, finances already feel alive.
- **Phase 2 - Sponsorship & commercial deals.** The counterparty and the first
  multi-year commitments.
- **Phase 3 - Ownership as a character.** Archetypes, negotiated directives,
  ownership changes.
- **Phase 4 - Departments + season tickets.** Subsumes the old dropdowns
  (with migration) and adds the sticky demand model.
- **Phase 5 - Arena, financing & business expansion.** The capital-project
  layer, debt, the owner's wallet, and System 8's organizational projects.
  Relocation ships here as the gated last-resort branch.
- **Phase 6 - CPU selective depth, balance & docs.** Tier-1 CPU event
  simulation, the long-run (20-season) balance harness, small-market viability
  tuning, and the four doc sets brought current.

Existing-save backfill is built into every phase, not deferred.

---

## Part 7 - Business Decision catalog expansion (proposed 2026-08-06)

**Status:** proposal, awaiting approval. No code written.
**Trigger:** user feedback after playing Phase 1-5 - 12 rotating cards will
repeat within a season or two of game-time in a multi-season save, and the
catalog skews toward sponsorship/crisis with no cards that react to _how your
season is actually going_. Confirmed scope: team-performance-driven variety,
~13 new cards (roughly doubling the catalog to 25).

### 7.1 - What's reused, what's new

**Reused as-is, no new plumbing:**

- `LeagueTeam.currentStreak` (signed int, already on the schema, already read
  by `moraleEvents.ts`) - positive is a win streak, negative a loss streak.
  No new tracking needed.
- The existing `CatalogEntry.eligible(ctx)` / `build(ctx)` shape, deadline-
  by-severity table, `defaultOptionId` convention, and the "no option ever
  free, no option strictly dominant" review criterion from Part 2 - every new
  card follows the exact same discipline as the original 12.
- `rollForBusinessDecision` and its call site in `leagueEvents.ts` - new
  cards just add entries to `CATALOG` and extend the context object passed
  in; the roll mechanism itself doesn't change.

**New context fields on `BusinessDecisionContext`:**

- `currentStreak: number` - passed straight through from the existing
  `LeagueTeam` field already fetched at the `leagueEvents.ts` call site.
- `isPlayoffContender: boolean` - top-N in conference by win%, reusing the
  standings logic already in `src/lib/actions/playoffs.ts` rather than
  building new math. Computed once per roll, same place `franchisePopularity`
  is computed today.
- `isLotteryBound: boolean` - the inverse tail (bottom-N in conference),
  same source.
- `lastGameMargin: number | null` - point differential of the most recently
  completed game, for the two blowout cards. `null` when no game has been
  played yet this trigger (cards gated on it are simply ineligible then).

No new database columns. No new models. This is a `businessDecisions.ts` +
`leagueEvents.ts` change only.

### 7.2 - New cards (13)

Same headline/body/two-option shape as the existing catalog; dollar and
happiness magnitudes calibrated to match the existing cards' scale (roughly
±0.5-4M cash, ±1-6 fan happiness, ±1 owner confidence per the established
convention).

**Win streak (`currentStreak >= 4`) - 3 cards**

- `HOT_STREAK_MEDIA_FEATURE` - a local news feature wants embedded access
  during the streak. Accept (cash + fan happiness, minor distraction risk
  ownership notes) vs. decline (stay focused, ownership approves).
- `MOMENTUM_MERCHANDISE_SURGE` - a limited "hot streak" merchandise run.
  Rush it to market (cash now, thin margins ownership dislikes) vs. do it
  right (smaller, slower payoff, better margins).
- `BANDWAGON_SPONSOR_INTEREST` - a new sponsor wants in _because_ of the
  streak, offering a short deal at streak-inflated rates. Sign now (real
  money, but a bet the streak holds - `sponsorshipDeal` payload, term 1-2
  seasons) vs. wait for a stronger, streak-independent offer later.

**Loss streak (`currentStreak <= -4`) - 3 cards**

- `SEASON_TICKET_HOLDER_BACKLASH` - a bloc of season-ticket holders is
  asking for concessions. Offer a goodwill gesture (cash out, fan happiness
  up, ownership annoyed at the cost) vs. hold firm (ownership approves the
  discipline, fan happiness takes a real hit).
- `BOOSTER_CLUB_PATIENCE_TEST` - a prominent local booster/community group
  goes public questioning the direction of the team. Engage publicly
  (owner-confidence cost for looking rattled, but stems the fan-happiness
  bleeding) vs. stay quiet (no cost now, fan happiness keeps sliding).
- `LOCAL_MEDIA_CRITICISM_CYCLE` - beat reporters turn openly critical.
  Grant a rare sit-down interview to address it directly (cash cost for the
  media event, fan happiness recovers some) vs. decline comment (free, but
  the criticism cycle continues - fan happiness dips further).

**Playoff contention (`isPlayoffContender`) - 3 cards**

- `PLAYOFF_PUSH_TICKET_DEMAND` - ticket demand is spiking with a playoff
  race on. Raise prices for the stretch run (real cash, fans grumble at the
  gouge) vs. hold pricing steady (goodwill, leaves money on the table).
- `NATIONAL_TV_SLOT_REQUEST` - a national broadcaster wants to flex one of
  your home games into a marquee slot. Accept (cash + exposure, but the
  schedule shuffle irritates some season-ticket holders) vs. decline (no
  disruption, no payday).
- `PLAYOFF_WATCH_PARTY_PROPOSAL` - the business office wants to run paid
  fan watch-parties for road playoff games. Greenlight it (cash + fan
  happiness, but ownership would rather see the spend saved) vs. pass
  (ownership approves the restraint, but fans notice the missed chance to
  gather).

**Lottery-bound (`isLotteryBound`) - 2 cards**

- `TANK_WATCH_FAN_FRUSTRATION` - fans and media are openly speculating
  about tanking for draft position. Publicly commit to competing every
  night (owner-confidence cost if paired with a bad record, fan happiness
  holds) vs. stay silent and let the speculation ride (free, but fan
  happiness erodes as frustration builds).
- `REBUILD_PATIENCE_APPEAL` - ownership asks you to help sell the fanbase
  on patience with the rebuild. Run a public "trust the process" campaign
  (cash cost, meaningful fan-happiness floor for the rest of a bad season)
  vs. decline to spend on messaging (free, no floor).

**Blowout result (`lastGameMargin`) - 2 cards**

- `SIGNATURE_WIN_HIGHLIGHT_DEAL` (`lastGameMargin >= 25`, a blowout win) -
  a highlight-reel network wants rights to package the win. Sell the rights
  (cash now) vs. keep it in-house for your own team media channels (fan
  happiness instead of cash - keeps the moment "yours").
- `EMBARRASSING_LOSS_DAMAGE_CONTROL` (`lastGameMargin <= -25`, a blowout
  loss) - ownership wants a response to a viral bad loss. Address it head-on
  (owner-confidence gain for taking it seriously, small cash cost for the
  press event) vs. let it blow over (free, fan happiness takes the hit
  instead).

### 7.3 - Design review checklist (same criteria as Part 2)

- Every card: exactly 2 options, neither free (each carries at least one
  non-zero delta), neither strictly dominant (every "more cash" option pairs
  with a real fan-happiness or owner-confidence cost, or vice versa).
- `defaultOptionId` is never the objectively-best option, matching the
  existing convention that ignoring the inbox has a real cost.
- Severity: win/loss-streak and blowout cards are `STANDARD` (colorful, not
  urgent); playoff/lottery cards are `STANDARD` or `MINOR` depending on
  whether they're time-pressured; none of the 13 are `BREAKING` - that
  severity stays reserved for genuine crises per the existing catalog's use.
- `BANDWAGON_SPONSOR_INTEREST` is the only new card carrying a
  `sponsorshipDeal` payload - reuses Phase 2's existing mechanism rather than
  inventing a new one.

### 7.4 - Not in this pass

Owner-archetype-flavored cards, franchise-icon/GM-reputation cards, and
league/rival-context cards (the three other variety axes considered) are
explicitly deferred, not rejected - each is its own coherent follow-up pass
once this one is live and played. Keeping this pass to one axis (team
performance) keeps eligibility logic easy to reason about and keeps the
review checklist above tractable in one sitting.

Existing-save backfill: not applicable - this is pure catalog content plus
new _read-only_ context fields at generation time, nothing persisted to
existing rows needs migrating.

---

## Part 8 - Phase 6: CPU Selective Depth, Balance & Docs (proposed 2026-08-06)

**Status:** proposal, awaiting approval. No code written.
**Scope confirmed:** full Tier-1 CPU simulation (the biggest of 3 options
presented) - CPU teams get real capital-project/debt behavior, real
relocation eligibility, and their own owner archetype, not just tuning.

### 8.1 - What's already true (found while auditing, not assumed)

The season-end finance pass in `advanceSeasonAction` already runs
`league.teams.map(...)` over **every** team, CPU included:

- Revenue/expenses/net income, franchise value, season-ticket base drift -
  all already computed for CPU teams every season.
- Arena aging (`computeArenaAgingDelta`) already applies to CPU teams too -
  a CPU team that never invests already does decay.

So "Tier 2, formula-abstracted: routine business" (Part 1, finding 1.4.5)
is **done**, not part of this phase. What's actually missing is narrower
than the original phasing description implied: the _decision-driven_ layer
that today is hard-coded to `userControlledTeamId` only:

- Capital projects (arena renovation/new-build, business expansion) -
  CPU teams never start one; only aging ever touches their arena.
- Financing (loans, capital calls, distressed financing) - CPU `debtCents`
  never moves off 0.
- Relocation eligibility - `isRelocationEligible` is only ever checked for
  `userLeagueTeamId`.
- Owner archetype - `ownerArchetype` lives on `League`, not `LeagueTeam`.
  There is exactly one archetype per save (the user's own owner); CPU teams
  have no ownership personality at all, modeled or otherwise.

### 8.2 - Design decision: CPU gets outcomes, not a parallel confidence system

`isRelocationEligible` and the archetype-effect functions
(`archetypeShouldIssueFinancialMandate`, directive thresholds, etc.) are all
built on top of `League.ownerConfidence` - a single number driven by season
verdicts, payroll directives, and financial mandates the user personally
negotiates through the Front Office Inbox. None of that apparatus is
player-facing for a CPU team; the user never sees a CPU team's owner get
angry or issue a directive. Building a full parallel confidence/mandate/
directive system per CPU team would be substantial new invisible machinery
for effects nobody experiences directly.

**Resolution:** CPU teams get a lighter, formula-driven policy that
produces the _same class of outcomes_ (occasional arena investment,
occasional debt, rare relocation, a flavor-only owner personality) without
replicating the interactive confidence apparatus:

- **CPU owner archetype** - a new `LeagueTeam.ownerArchetype` field (every
  team gets one, including the user's - see 8.4 on reconciling with the
  existing `League.ownerArchetype`), rolled at bootstrap/backfill the same
  way the user's is today. For CPU teams it's presentational plus a
  multiplier on the policy heuristics below (a `PENNY_PINCHER` CPU team is
  less likely to take on debt; a `WIN_NOW_BILLIONAIRE` CPU team is more
  likely to renovate) - never wired to a confidence number that doesn't
  exist for them.
- **CPU capital-project policy** - once per season boundary, per CPU team:
  if `arenaQualityIndex` is below a threshold and `cashReserveCents` is
  comfortably positive, roll a small chance to auto-start an
  `ARENA_RENOVATION` (the direct-purchase project - no negotiation needed,
  matching the user's own "Renovate" button). No CPU `ARENA_NEW_BUILD` (that
  requires the multi-round Negotiation engine, which is Tier-1-expensive for
  30 teams) and no CPU business-expansion projects (those are about a
  human's strategic choice, not a franchise-defining event the league needs
  to see).
- **CPU financing policy** - once per season boundary, if a CPU team's
  `cashReserveCents` is deeply negative, roll a small chance to take a
  `SMALL` loan (reusing `financing.ts`'s existing tiers) rather than run
  the deficit indefinitely. No capital calls or distressed financing for
  CPU (both are priced in owner confidence, which CPU doesn't have).
- **CPU relocation** - a simplified eligibility check reusing the same
  _shape_ as `isRelocationEligible` but substituting CPU-available signals:
  sustained losses + negative cash (same as today) + arena quality at rock
  bottom for several seasons (a CPU-only proxy for "failed negotiations,"
  since CPU never negotiates) + expired lease. Same rarity target as the
  user's gate (near-unreachable), resolved as a single weighted outcome
  (no round-by-round negotiation for CPU - there's no one to negotiate
  with), landing on one of `RELOCATION_DESTINATIONS`. Generates the same
  `LeagueTransaction` news story a user relocation does.

All of this is silent/logged - a CPU team never sees a decision card, per
the original Tier 1/Tier 2 split. Every event (CPU arena renovation, CPU
loan taken, CPU relocation) posts to the league news feed via
`LeagueTransaction`, using the existing `BUSINESS_DECISION` (or a new
narrow `FRANCHISE_RELOCATION` if warranted) transaction type - so it's a
league story the user reads about, not just a database write.

### 8.3 - Frequency & performance

Every check above is a cheap read against already-fetched `LeagueTeam` rows
(no new heavy queries) and a probability roll, run inside the same
`league.teams.map` pass that already computes routine finances - not a
second full-league pass. Franchise-defining outcomes stay rare per team per
season (matching the original "bounded cost" reasoning in Part 1, finding
1.4.5), so this doesn't materially change `advanceSeasonAction`'s cost.

### 8.4 - Owner archetype: League-scoped vs. LeagueTeam-scoped

Moving `ownerArchetype` from `League` to `LeagueTeam` changes what it means
for the user's own team: today `league.ownerArchetype` _is_ the user's
owner. After this change, `userLeagueTeam.ownerArchetype` is. All 5 existing
read sites (`offseason.ts`, `capitalProjects.ts`, `arena.ts`,
`finances/page.tsx`, `league.ts`) get a one-line swap from
`league.ownerArchetype` to `userLeagueTeam.ownerArchetype` - the archetype
_values_, multiplier functions, and all existing behavior for the user are
unchanged, only where the field lives. `League.ownerArchetypeSince` moves
the same way. This is additive at the schema level (new column on
`LeagueTeam`, old `League` column dropped) - existing-save backfill copies
each league's current `League.ownerArchetype`/`ownerArchetypeSince` onto its
`userControlledTeamId` row, then rolls a fresh archetype for the other 29.

### 8.5 - The 20-season balance harness

A new script (`scripts/balance-harness.ts`, following the existing
`scripts/backfill-*.ts` pattern), not part of the app itself:

- Bootstraps a throwaway league, sets every team to CPU-controlled (no
  `userControlledTeamId`), and repeatedly calls `advanceSeasonAction`-
  equivalent logic 20 times, capturing each team's finances snapshot
  per season.
- Reports: small-market vs. large-market average franchise value and cash
  trajectory over 20 seasons (the specific viability question Part 5's
  decisions worried about), how many teams ever reach relocation
  eligibility (should be rare, not never and not common), luxury-tax-line
  crossing frequency, and CPU capital-project/loan/relocation counts (a
  sanity check that the new Tier-1 policy actually fires sometimes and
  doesn't runaway).
- Not a test file (`vitest` isn't the right shape for a 20-season
  simulation run) - a standalone script the user runs by hand and reads the
  printed report from, same as the existing backfill scripts.
- Any real imbalance the harness surfaces (e.g. small markets trending to
  bankruptcy, or CPU relocation firing too often) gets tuned in the relevant
  existing formula module (`finances.ts`, `arena.ts`, etc.) - this phase
  doesn't pre-commit to specific numbers, since the harness's actual output
  determines what (if anything) needs adjusting.

### 8.6 - Docs

The four doc sets (`docs/handbook/`, `docs/code-guide/`,
`docs/code-deep-dive/`, `docs/extreme-deep-dive/`) get brought current with
everything since the last doc pass: Phases 1-5 of the Finances pillar, the
13-card catalog expansion (Part 7), and this phase's CPU depth work. This
was deferred through Phases 1-5 per the standing "don't update docs until
told" instruction - Phase 6 is an explicit ask to close that gap, not a
reversal of that instruction going forward.

### 8.7 - Design review checklist

- No CPU-facing decision card, ever - Tier 1/Tier 2 split preserved exactly
  as originally designed.
- No new interactive confidence/mandate/directive system for CPU teams -
  outcomes are formula-driven, not simulated negotiations nobody sees.
- CPU relocation stays as rare as the user's own gate, not easier - checked
  by the balance harness (8.5), not just asserted.
- Existing-save backfill for the archetype migration (8.4), not deferred.
- Every CPU Tier-1 event produces a real, readable `LeagueTransaction` -
  a franchise-defining CPU event is a league story, not a silent write.

### 8.8 - Phasing within Phase 6

Independently buildable/testable, in this order:

1. **Owner archetype migration** (8.4) - schema change + backfill first,
   since the CPU policy work in step 2 depends on every team having one.
2. **CPU capital-project + financing policy** (8.2, first two bullets).
3. **CPU relocation** (8.2, last bullet) - built last since it depends on
   the archetype migration and reuses patterns proven in step 2.
4. **Balance harness** (8.5), run against the now-complete CPU behavior.
5. **Tuning** - address whatever the harness actually surfaces.
6. **Docs** (8.6) - last, once the phase's real shape is settled.
