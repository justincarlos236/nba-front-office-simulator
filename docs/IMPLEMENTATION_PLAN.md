# Implementation Plan — Living Document

This is the project's living roadmap-execution tracker. It maps every item
in [`docs/FEATURE_ROADMAP.md`](./FEATURE_ROADMAP.md) (the 100-item
long-term wishlist) to its **actual, verified** implementation status, a
priority, a planned phase, and dependency notes — then breaks the
remaining work into ordered, self-contained development phases.

**How to use this file:**

- Before starting new roadmap work, re-read the current phase's section
  below and the status table for the features in scope.
- As a feature moves Not Implemented → Partially Implemented → Fully
  Implemented, update its row in the table **and** the phase checklist.
- This file is the source of truth for "what's done against the 100-item
  roadmap" — `docs/ROADMAP.md` remains the source of truth for the
  original MVP milestones (M0–M6), which are a subset of what's tracked
  here (roughly items 1–12, 84 map onto M0–M5).
- Statuses were assigned by direct code inspection (grepping for actual
  usage, not assumptions) as of **2026-07-18**. If this file and the code
  disagree, trust the code and fix this file.

**Quality bar (applies to every phase, not just the one that prompted
this note):** passing tests/build/e2e proves a feature is _correct_, not
that it's _impressive_. Before marking any phase done, do a deliberate
second pass from the user's actual in-app perspective: Is the user's own
team/data visually distinguished anywhere it appears (not just buried in
a neutral list)? Is there data already being computed/stored that never
actually reaches the UI? Would a reviewer clicking through this feel like
it was designed, or just built to the minimum spec? Close gaps like these
using data/plumbing that already exists - this is about polish, not about
opening new scope (keep it proportionate; don't turn a phase into
unbounded extra work over it).

## Legend

- **Status**: ✅ Fully Implemented · 🟡 Partially Implemented · ⬜ Not
  Implemented · 🔒 Blocked (depends on another unimplemented feature)
- **Priority**: P0 (foundational/critical) · P1 (high value, do soon) ·
  P2 (valuable, not urgent) · P3 (nice-to-have / large lift for the payoff)
- **Phase**: which development phase (below) this belongs to. "—" means
  not yet scheduled into a concrete phase.

## Feature status table

| #   | Feature                               | Status | Priority | Phase   | Depends on   | Notes                                                                                                                                                                           |
| --- | ------------------------------------- | ------ | -------- | ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | NBA Trade Machine                     | ✅     | P0       | done    | —            | `/leagues/[id]/trades/new`, 2-team only, players and draft picks both tradeable (Phase 11a)                                                                                     |
| 2   | Realistic Salary Cap Engine           | ✅     | P0       | done    | —            | `src/lib/cap/*`, 39 unit tests, real 2023 CBA aprons/MLE                                                                                                                        |
| 3   | Full Roster Management                | 🟡     | P0       | done*   | —            | View is complete; no waive/release/lineup management yet                                                                                                                        |
| 4   | Real NBA Teams and Players            | ✅     | P0       | done    | —            | 30 real teams, 497 real players + 2023-24 stats                                                                                                                                 |
| 5   | AI GM Assistant                       | ⬜     | P1       | paused  | —            | Started, then user explicitly said skip for now — **do not resume unprompted**                                                                                                  |
| 6   | Player Valuation Model                | ✅     | P0       | done    | —            | `src/lib/valuation/*`, rating + age curve + market value + surplus                                                                                                              |
| 7   | AI Trade Evaluation                   | ✅     | P1       | 11      | 21, 22       | ✅ DONE (Phase 11c) - `evaluateTradeOffer` gates `executeTradeAction`; CPU-CPU random trades (`rollForCpuTrade`) still don't use it                                             |
| 8   | Franchise / GM Mode                   | ✅     | P0       | 1,2,3,4 | —            | Cap/roster/standings/playoffs/draft/multi-season progression (aging, retirement, awards) all work now                                                                           |
| 9   | Team Dashboard                        | ✅     | P0       | done    | —            | Cap sheet + roster + a "Franchise overview" card row (conference rank, playoff status, draft picks, recent activity, all-time record, free agency)                              |
| 10  | Save and Load Franchises              | ✅     | P0       | done    | —            | Continuous DB persistence; "load" = sign back in                                                                                                                                |
| 11  | Free Agency                           | ✅     | P0       | done    | —            | `/leagues/[id]/free-agents`, real signing-mechanism validation                                                                                                                  |
| 12  | Contract Negotiations                 | 🟡     | P2       | —       | 31           | User sets terms + system validates; no back-and-forth or player preference                                                                                                      |
| 13  | NBA Draft                             | ✅     | P1       | 4       | 66,67        | Interactive `/leagues/[id]/draft` - lottery, 60-pick order, generated class, real rookie contracts                                                                              |
| 14  | Draft Pick Trading                    | ✅     | P2       | 11      | 62           | ✅ DONE (Phase 11a, 2026-07-21) - rolling 5-season future-pick inventory, `TradeBuilder` pick selection, ownership transfer on execution                                        |
| 15  | Season Simulation                     | ✅     | P0       | 1       | —            | Batch-simulate 1/10/50 games from `/leagues/[id]/standings`                                                                                                                     |
| 16  | Game Simulation Engine                | ✅     | P0       | 1       | —            | `src/lib/simulation/simulateGame.ts` — strength-based, not possession-level (documented)                                                                                        |
| 17  | League Standings                      | ✅     | P0       | 1       | —            | `/leagues/[id]/standings`, conference-sorted, live games-back                                                                                                                   |
| 18  | NBA Playoffs                          | ✅     | P1       | 2       | 15,16,17     | Play-in + fixed single-elim bracket, `/leagues/[id]/playoffs` (real visual bracket, East/West/Finals), real 2-2-1-1-1 home pattern                                              |
| 19  | Player Development                    | ✅     | P1       | 3       | 15           | `developPlayerRating.ts` - age-based growth/decline, applied by `advanceSeasonAction`                                                                                           |
| 20  | Dynamic Player Ratings                | ✅     | P1       | 3       | 19           | Ratings now actually change season-over-season (see #19)                                                                                                                        |
| 21  | Team Direction System                 | ✅     | P1       | 11      | —            | ✅ DONE (Phase 11b) - `computeTeamIdentity`                                                                                                                                     |
| 22  | Team Needs System                     | ✅     | P1       | 11      | —            | ✅ DONE (Phase 11b) - `computeTeamNeeds`, minus "Shooting" (no detectable signal)                                                                                               |
| 23  | Trade Finder                          | ⬜     | P2       | 6       | 6,21,22      | —                                                                                                                                                                               |
| 24  | Three/Multi-Team Trades               | 🟡     | P2       | —       | —            | `validateTrade` supports N teams (tested); `TradeBuilder` UI is 2-team only                                                                                                     |
| 25  | Trade Grades                          | ⬜     | P2       | 6       | 6            | Legality validation exists; a quality "grade" doesn't                                                                                                                           |
| 26  | Advanced Player Statistics            | 🟡     | P2       | —       | —            | PPG/RPG/APG/TS%/FG% shown; PER/BPM/usage columns exist but unpopulated (no source)                                                                                              |
| 27  | Player Comparison Tool                | ⬜     | P1       | 7       | —            | —                                                                                                                                                                               |
| 28  | Depth Chart Management                | ✅     | P2       | 17      | —            | Drag-and-drop depth chart at `/leagues/[id]/rotation` - see `src/lib/rotation/` and `docs/ARCHITECTURE.md`'s Rotation Management section                                        |
| 29  | Rotation Management                   | ✅     | P2       | 17      | 28           | Same phase as #28 - user-assigned target minutes actually drive box-score minute allocation and rotation-adjusted team strength, not cosmetic                                   |
| 30  | Injury System                         | ✅     | P2       | 7       | 15,16        | Fast-tracked out of order: in-season injuries roll as games are simulated, with a real mechanical effect (`InjuryStatus`/strength calc) - see `src/lib/actions/leagueEvents.ts` |
| 31  | Player Morale                         | ⬜     | P2       | 6       | —            | —                                                                                                                                                                               |
| 32  | Trade Requests                        | ⬜     | P3       | —       | 31           | —                                                                                                                                                                               |
| 33  | Player Roles                          | ✅     | P3       | 17      | 28           | Satisfied as a byproduct of Rotation Management - role labels (Starter/Sixth Man/Rotation Player/Bench Player) are derived from depth-chart rank, not a separate field          |
| 34  | Player Potential                      | 🟡     | P1       | 3       | —            | `potentialRating` computed + shown; doesn't drive development yet (see #19)                                                                                                     |
| 35  | Scouting Reports                      | ⬜     | P3       | —       | —            | —                                                                                                                                                                               |
| 36  | League News Feed                      | ✅     | P2       | 5       | 37           | Same `LeagueTransaction` feed as #37, framed as a news wire - `/leagues/[id]/transactions`                                                                                      |
| 37  | Transaction History                   | ✅     | P1       | 5       | —            | `LeagueTransaction` log created on every trade, signing, and retirement; viewable at `/leagues/[id]/transactions`                                                               |
| 38  | Player Career History                 | 🔒     | P2       | —       | multi-season | Only one season (2023-24) of stats exists per player                                                                                                                            |
| 39  | NBA Awards                            | 🟡     | P2       | 3       | 15,19        | MVP/ROY/Most Improved computed and shown; DPOY/Sixth Man/All-Defense deliberately skipped (no defensive stats or depth chart to base them on honestly)                          |
| 40  | All-Star Weekend                      | ✅     | P3       | 16      | 15           | Real selections/Rising Stars/3PT/Dunk/ASG, genuine mid-season sim block - see `docs/ARCHITECTURE.md`'s All-Star Weekend section                                                 |
| 41  | Hall of Fame                          | ⬜     | P3       | —       | 42           | —                                                                                                                                                                               |
| 42  | Player Retirement                     | ✅     | P3       | 3       | 19           | `retirement.ts` - age/rating-based probability, forced at 41; shown on the offseason recap page                                                                                 |
| 43  | League History                        | ✅     | P2       | 5       | 15,18,39     | `/leagues/[id]/history` - season-by-season champions, awards, retirees                                                                                                          |
| 44  | League Records                        | ⬜     | P3       | —       | 43           | —                                                                                                                                                                               |
| 45  | Championship History                  | ✅     | P2       | 5       | 18           | Past champions shown per-season on `/leagues/[id]/history`                                                                                                                      |
| 46  | AI General Managers                   | 🟡     | P1       | 11      | 21,22        | CPU teams now genuinely evaluate user-proposed trades (Phase 11c); CPU-CPU trades and free-agent signings are still random-but-cap-legal, not run through the new evaluation    |
| 47  | GM Personalities                      | ✅     | P2       | 11      | 46           | ✅ DONE (Phase 11c) - `GmPersonality`, 7 values, randomized per team at bootstrap                                                                                               |
| 48  | AI Trade Negotiations                 | ✅     | P2       | 11      | 46           | ✅ DONE (Phase 11d) - `suggestCounterOffer` proposes a real modification from the user's own available assets when a team wouldn't accept, one-click apply                      |
| 49  | AI GM Chat                            | ⬜     | P1       | paused  | —            | The explicitly-paused conversational assistant                                                                                                                                  |
| 50  | Natural-Language Player Search        | ⬜     | P2       | —       | 86           | LLM-flavored - hold pending user re-opening the AI thread                                                                                                                       |
| 51  | AI Roster Analysis                    | ⬜     | P2       | —       | 6,49         | —                                                                                                                                                                               |
| 52  | AI Offseason Plan                     | ⬜     | P3       | —       | 49           | —                                                                                                                                                                               |
| 53  | AI Trade Suggestions                  | ⬜     | P2       | —       | 6,49         | —                                                                                                                                                                               |
| 54  | AI Trade Explanations                 | ✅     | P2       | 11      | —            | ✅ DONE (Phase 11d) - `tradeReasonMessages.ts`'s plain-English, varied rejection/acceptance bank; a rule-based (not LLM) version of this, doesn't need #49                      |
| 55  | AI Counteroffers                      | ✅     | P3       | 11      | 48           | ✅ DONE (Phase 11d) - see #48; `suggestCounterOffer` also identifies when the real blocker is a specific untouchable player, not just a value gap                               |
| 56  | Trade Value Visualization             | ⬜     | P2       | 7       | 6            | Values shown as numbers/tables today, no chart                                                                                                                                  |
| 57  | Championship Probability              | ⬜     | P3       | —       | 15,16        | —                                                                                                                                                                               |
| 58  | Playoff Probability                   | ⬜     | P2       | —       | 15,16,17     | —                                                                                                                                                                               |
| 59  | Team Power Rankings                   | ⬜     | P2       | 2       | 17           | Natural add-on once standings exist                                                                                                                                             |
| 60  | Salary Cap Visualization              | ⬜     | P1       | 7       | —            | Cap sheet is text stat cards today, not a chart                                                                                                                                 |
| 61  | Contract Timeline                     | 🟡     | P2       | 7       | —            | Current-season salary + end year shown; no multi-year visual                                                                                                                    |
| 62  | Draft Pick Inventory                  | ⬜     | P1       | 4       | —            | Prerequisite for #14, #71, #72, #73                                                                                                                                             |
| 63  | Roster Strength Analysis              | ⬜     | P2       | 7       | 6            | —                                                                                                                                                                               |
| 64  | Player Performance Trends             | 🔒     | P3       | —       | multi-season | Only one season of data exists                                                                                                                                                  |
| 65  | Team Performance Trends               | 🔒     | P2       | —       | 15,16,17     | Needs games actually being simulated over time                                                                                                                                  |
| 66  | Draft Lottery                         | ✅     | P1       | 4       | 17           | `draftLottery.ts` - real post-2019 odds table (top 3 tied at 14.0%)                                                                                                             |
| 67  | Generated Draft Classes               | ✅     | P1       | 4       | —            | `generateDraftClass.ts` - 60 fictional prospects/season, slot-correlated with real variance                                                                                     |
| 68  | Prospect Scouting                     | ⬜     | P2       | 4       | 67           | —                                                                                                                                                                               |
| 69  | Mock Drafts                           | ⬜     | P2       | 4       | 67, 21/22    | —                                                                                                                                                                               |
| 70  | Draft Combine                         | ⬜     | P3       | —       | 67           | —                                                                                                                                                                               |
| 71  | Draft-Day Trades                      | ⬜     | P2       | 4       | 1, 62        | —                                                                                                                                                                               |
| 72  | Pick Protections                      | ⬜     | P2       | 4       | 62           | `protectionNote` field already exists on `DraftPick`, unused                                                                                                                    |
| 73  | Pick Swaps                            | ⬜     | P3       | —       | 62           | —                                                                                                                                                                               |
| 74  | Multi-Season Simulation               | ⬜     | P1       | 3       | 15,19        | "Advance to next season" mechanic                                                                                                                                               |
| 75  | Salary Cap Growth                     | 🟡     | P1       | 3       | 74           | `SEASON_CAP_RULES` has real multi-season figures; nothing advances `currentSeason` yet                                                                                          |
| 76  | League Evolution                      | ⬜     | P3       | —       | 74           | —                                                                                                                                                                               |
| 77  | Expansion Teams                       | ⬜     | P3       | —       | —            | —                                                                                                                                                                               |
| 78  | Expansion Draft                       | ⬜     | P3       | —       | 77           | —                                                                                                                                                                               |
| 79  | Custom Team Creation                  | ⬜     | P3       | —       | —            | —                                                                                                                                                                               |
| 80  | Historical Seasons                    | 🟡     | P3       | —       | —            | Fixed to 2023-24 only; not selectable                                                                                                                                           |
| 81  | What-If Mode                          | ⬜     | P3       | —       | 79/82        | —                                                                                                                                                                               |
| 82  | Custom Rosters                        | ⬜     | P3       | —       | —            | —                                                                                                                                                                               |
| 83  | League Settings                       | ⬜     | P2       | 9       | —            | —                                                                                                                                                                               |
| 84  | User Authentication                   | ✅     | P0       | done    | —            | Auth.js v5, Credentials, ownership-scoped                                                                                                                                       |
| 85  | Multiple Franchise Saves              | ✅     | P0       | 9*      | —            | `/leagues` hub - up to `MAX_LEAGUES_PER_USER` (5) franchises, switch anytime; fast-tracked out of Phase 9's original order per explicit user request                            |
| 86  | Global Player Search                  | ⬜     | P1       | 8       | —            | —                                                                                                                                                                               |
| 87  | Global Team Search                    | ⬜     | P2       | 8       | —            | `/teams` browse exists; no search box                                                                                                                                           |
| 88  | Advanced Filters                      | ⬜     | P2       | 8       | 86           | —                                                                                                                                                                               |
| 89  | Command Palette                       | ⬜     | P2       | 8       | 86,87        | —                                                                                                                                                                               |
| 90  | Shareable Trades                      | ⬜     | P3       | —       | 1            | —                                                                                                                                                                               |
| 91  | Trade Card Generator                  | ⬜     | P3       | —       | 90           | —                                                                                                                                                                               |
| 92  | Beautiful Player Profile Pages        | 🟡     | P2       | 7       | —            | Bio+stats+valuation exist; no photo (field unpopulated), no career history section                                                                                              |
| 93  | Detailed Team Pages                   | 🟡     | P2       | 7       | —            | Roster+colors+division shown; no payroll chart, draft assets, or transaction history                                                                                            |
| 94  | Interactive League Dashboard          | 🟡     | P2       | 2       | 17           | Standings page now has recent league-wide results + a playoffs link; still no news/power rankings                                                                               |
| 95  | Responsive Design                     | 🟡     | P2       | 7       | —            | Some Tailwind responsive classes used; not comprehensively verified across breakpoints                                                                                          |
| 96  | Dark and Light Mode                   | 🟡     | P3       | —       | —            | Dark theme only, no toggle                                                                                                                                                      |
| 97  | Interactive Charts and Visualizations | 🟡     | P1       | 7       | —            | One recharts scatter chart exists; cap/trend visualizations don't                                                                                                               |
| 98  | Onboarding Tutorial                   | ⬜     | P3       | —       | —            | —                                                                                                                                                                               |
| 99  | Achievements                          | ⬜     | P3       | 9       | 100          | —                                                                                                                                                                               |
| 100 | GM Career Score                       | ⬜     | P2       | 9       | 6,37         | —                                                                                                                                                                               |

\* "done" for #3 means "done to the extent scoped for the MVP" - it's
marked 🟡 above and will deepen further in Phase 3 (roster management
gets waive/depth-chart tools). #9 (Team Dashboard) was upgraded from 🟡
to a full ✅ once the "Franchise overview" card row was added - it now
embeds live snapshots of standings/playoffs/draft/activity/history
directly, not just links out to them.

## Development phases

Phases are ordered by dependency and leverage (how many other features
they unlock), not roadmap numbering, per the plan's guidance.

### Phase 1 — Season Simulation & Standings ✅ DONE (2026-07-18)

The single highest-leverage phase: `LeagueTeam.wins`/`losses` have existed
in the schema, unused, since M0. Building this unlocks playoffs, awards,
player development triggers, team/performance trends, and power rankings
in later phases.

- [x] `Game` model (season, gameNumber, home/away `LeagueTeam`, scores, `playedAt`)
- [x] Team strength function (derived from roster ratings) — pure, unit tested
- [x] Game simulation function (strength + home court → win probability →
      simulated result) — pure, unit tested, documented as a simplified,
      strength-based model rather than possession-by-possession simulation
- [x] Simplified schedule generator (documented simplification vs. the
      real 82-game/back-to-back NBA schedule) — 58 games/team round robin
- [x] "Simulate" server action, batch-limited (1/10/50 games per call, not
      "whole season" in one request — avoids a serverless timeout risk)
- [x] Standings page (`/leagues/[id]/standings`), conference-sorted, with
      games-back and live simulate controls
- [x] Dashboard shows real W-L record
- [x] 17 new unit tests + 1 new e2e test (season-simulation.spec.ts),
      verified against a production build (screenshots)

### Phase 2 — Playoffs & League-Wide Dashboard ✅ DONE (2026-07-19)

- [x] Play-in + playoff bracket generation from final standings (fixed
      single-elimination bracket, not reseeded each round - matches the
      real NBA format)
- [x] Series simulation (best-of-7, real 2-2-1-1-1 home-court pattern,
      reusing the Phase 1 `simulateGame` engine)
- [x] Interactive bracket UI (`/leagues/[id]/playoffs`) - play-in results,
      round-by-round series cards, champion banner
- [x] League-wide dashboard view: standings page now shows league-wide
      recent results (last 10 games, any type), not just the user's own
      team's record

### Phase 3 — Player Development & Multi-Season Progression ✅ DONE (2026-07-20)

The other big unlock: advancing `League.currentSeason`, aging/developing
ratings, expiring contracts, and growing the cap season-to-season.

- [x] "Advance to next season" flow (`advanceSeasonAction`) - ages every
      active player, applies development/decline, resolves retirements,
      expires contracts, resets standings, generates the next season's
      schedule, rolls `currentSeason` forward. Gated on a crowned playoff
      champion for the season being closed out.
- [x] Dynamic ratings that actually change year over year
      (`developPlayerRating.ts`, unit tested)
- [x] Retirement (age/rating-based, `retirement.ts`) - deliberately
      conservative since there's no draft yet (Phase 4) to replenish the
      talent pool
- [x] Awards (MVP/Rookie of the Year/Most Improved computed and shown on
      `/leagues/[id]/offseason`; DPOY/Sixth Man/All-Defense deliberately
      skipped - no honest data to base them on, see docs/ARCHITECTURE.md)
- [ ] Depth chart + rotations (minutes distribution feeding team strength) - **moved to Phase 7**: this is roster micromanagement, not season
      progression, and didn't need to block this phase
- [ ] Injuries (using the existing `InjuryStatus` enum) - **moved to
      Phase 7** for the same reason

### Phase 4 — Draft System ✅ DONE (2026-07-20)

- [x] `DraftPick` inventory generation - lazily per-season in
      `startDraftAction` (60 rows: 2 rounds x 30 teams) rather than
      upfront at league bootstrap for many future years; simpler, and
      sidesteps backfilling leagues that bootstrapped before this phase
      existed
- [x] Generated draft class (fictional prospects, `generateDraftClass.ts`,
      since a real future draft class doesn't exist yet) - slot-correlated
      ratings with real variance (bust/gem potential)
- [x] Draft lottery (`draftLottery.ts`) - real post-2019 odds table
- [x] Interactive draft-day flow (`/leagues/[id]/draft`) - user makes their
      own picks from the live board; CPU picks fast-forward in one click
      ("Simulate to your next pick") to the user's next turn
- [x] Rookie contracts via the existing `generateContract` engine
      (`ageAdjustedScore` derived from rating, not real stats)
- [x] `advanceSeasonAction` now also gated on the draft being fully
      resolved for the season, not just a crowned champion
- [ ] Pick protections/swaps, draft pick trading (extends `validateTrade`'s
      already-built but unused Stepien-lite check) - **deferred**: the
      pick inventory now exists, but trading picks needs `TradeBuilder` UI
      work (currently player-only) that's out of this phase's scope

### Phase 5 — Transactions, News & League History ✅ DONE (2026-07-20)

- [x] Transaction history UI (`/leagues/[id]/transactions`) - a unified
      `LeagueTransaction` log fed by trades, free-agent signings, and
      retirements, with pre-rendered human-readable descriptions
- [x] League news feed generated from transactions/results - the same
      `LeagueTransaction` feed doubles as the news feed (see
      `docs/ARCHITECTURE.md`'s "Transactions, news feed & league history"
      section for why this is one system, not two)
- [x] Championship/league history (`/leagues/[id]/history`) - past
      champions, season awards, and retirees, season-by-season, once
      playoffs (Phase 2) and offseason advancement (Phase 3) produce results

### Phase 6 — AI-Driven CPU Teams & Trade Depth

Note: this is about **CPU team decision-making logic** (should the AI
accept this trade, what does it need), not the conversational assistant —
that one stays paused per the user's explicit instruction until they
reopen it.

- [x] CPU-CPU trades and CPU free-agent signings - **fast-tracked out of
      order** alongside the injury system (#30) as part of a "living
      league" pass (2026-07-20): CPU teams now trade with each other
      (never involving the user's team) and sign free agents as games are
      simulated, validated through the same real `validateTrade`/
      `validateSigning` cap logic the user's own moves use. This is
      **not** the "AI GM" evaluation Phase 6 is really about - moves are
      randomly rolled and legality-checked, not chosen for team benefit -
      the items below are still the real scope of this phase
- [ ] Team direction (contending/rebuilding/retooling) + team needs
- [ ] AI trade evaluation (CPU teams can actually reject bad trades)
- [ ] Trade finder / trade grades
- [ ] Player morale (feeds future trade-request features)

### Phase 7 — Analytics, Visualization & Page Polish

Lower architectural risk — mostly additive UI/data-viz on data that
already exists. Good candidate to interleave between bigger phases.

- [ ] Player comparison tool
- [ ] Salary cap visualization (chart, not just stat cards)
- [ ] Contract timeline visualization
- [ ] Roster strength breakdown
- [ ] Richer player/team profile pages
- [ ] Responsive design pass across breakpoints
- [ ] Depth chart + rotations (#28, moved from Phase 3 - roster
      micromanagement, not season progression)
- [x] Injury system (#30, moved from Phase 3 for the same reason) -
      **fast-tracked out of order, done 2026-07-20** - see Phase 6's
      checklist and `docs/ARCHITECTURE.md`

### Phase 8 — Search & Discovery

- [ ] Global player search
- [ ] Global team search
- [ ] Advanced filters
- [ ] Command palette

### Phase 9 — Multi-Save, Settings & Meta Features

- [x] Multiple franchise saves per user ✅ DONE (2026-07-20, fast-tracked
      out of order per explicit user request) - `/leagues` hub, up to
      `MAX_LEAGUES_PER_USER` (5)
- [ ] League settings/configuration
- [ ] GM career score, achievements

### Phase 10 — Simplified Financial System & GM Accountability

Not one of the original 100 roadmap items - a detailed user-authored
design brief ("realistic consequences without complicated rules"), too
large for one pass. Split into sub-phases; only the first is done.

- [x] **10a - Simplified financial presentation layer** ✅ DONE
      (2026-07-21): player market-value tiers, `Under the Cap`/`Over the
Cap`/`Luxury Tax` status replacing raw apron enums, plain-English
      trade/signing feasibility messaging - all sitting on top of the
      existing real cap engine, which is unchanged underneath. See
      `docs/ARCHITECTURE.md`'s "Simplified financial presentation layer".
- [x] **10b - Re-Signing Rights + tracked Signing Exception** ✅ DONE
      (2026-07-21): `LeaguePlayer.reSigningTeamId` (new field + migration)
      tracks which team holds a player's simplified Re-Signing Rights,
      kept in sync on every signing/trade/draft assignment but not
      cleared on contract expiration. A team holding rights can offer a
      rating-based "fair market value" ceiling regardless of cap/apron
      status. Signing Exception usage is now cumulative per season,
      derived from existing `Contract.signedUsing` rows (no new running
      total to keep in sync). See `docs/ARCHITECTURE.md`'s "Free agency"
      section.
- [x] **10c - Multi-year cap projections + Financial Flexibility Grade**
      ✅ DONE (2026-07-21): a "Future Financial Flexibility" card on the
      team dashboard showing the next 4 seasons' already-committed
      payroll (tapering off naturally as shorter deals expire) plus an
      A-F grade folding in current Financial Status, the 4-season
      projection, and a check for single large long-term ("albatross")
      contracts. See `docs/ARCHITECTURE.md`'s "Simplified financial
      presentation layer".
- [x] **10d - Owner Confidence, expectations, directives & firing trigger**
      ✅ DONE (2026-07-21): `League.ownerConfidence` (0-100, starts at 65)
      plus a locked-in `SeasonExpectation` row per league+season (payroll
      tier + roster strength → one of six expectation levels, set at
      league creation and at the start of every `advanceSeasonAction`).
      When a season ends, its expectation is evaluated against the actual
      playoff outcome (a 0-6 scale derived from `PlayoffSeries`/play-in
      `Game` rows, aligned 1-for-1 with the 0-5 expectation scale) into a
      verdict, which moves Owner Confidence by an amount that scales with
      payroll tier (heavier spending amplifies both reward and penalty).
      Confidence buckets into six `JobSecurityLevel`s from Very Secure down
      to Critical - Critical _is_ the firing trigger's scope for this
      phase (a clearly surfaced "your job is at risk" state); the actual
      firing event/consequences are Phase 12's job, per the split above.
      Low confidence + still-heavy payroll can also trigger a one-time
      "reduce payroll below $X by season Y" ownership directive, resolved
      (met/ignored) the next time it's checked. Every evaluation, new
      expectation, and directive is posted to the existing
      `LeagueTransaction` feed as a new `OWNERSHIP_MESSAGE` type - reusing
      the Phase 5 news feed rather than a separate messaging system. UI:
      a "GM Job Security" card on the team dashboard, an "Ownership"
      section on the offseason page after advancing, and a new
      `#owner-confidence` section on `/guide/finances`. See
      `docs/ARCHITECTURE.md`'s "GM accountability" section.

### Phase 11 — AI Trade Evaluation & GM Personalities ✅ DONE (2026-07-21)

Not one of the original 100 roadmap items on its own, but directly closes
several that were: #7 "AI Trade Evaluation", #14 "Draft Pick Trading", #21
"Team Direction System", #22 "Team Needs System", #46 "AI General
Managers" (the trade-decision portion only, not full autonomous
management), #47 "GM Personalities", #48 "AI Trade Negotiations", #55 "AI
Counteroffers". Today, any trade a user proposes to a CPU team succeeds as
long as it's financially legal - the CPU side never evaluates whether the
deal is actually good for it. This phase makes every CPU team behave like
a real front office: an identity (contender/rebuilding/etc.), dynamically
recognized needs, a personality, and a genuine accept/reject/counter
decision with a believable reason. Split into four sub-phases (11a-11d),
same pattern as Phase 10; only the first is done so far.

- [x] **11a - Future Draft Pick Inventory & Pick Trading** ✅ DONE
      (2026-07-21): the mechanical prerequisite - draft-pick trading didn't
      exist at all before this (no future-pick inventory, Trade Builder
      was player-only). Every team now owns a rolling 5-season-ahead
      window of both rounds' own picks from league creation onward (kept
      sliding forward one season every `advanceSeasonAction`), tradeable
      through the Trade Builder alongside players. See
      `docs/ARCHITECTURE.md`'s "Draft pick trading" section for the
      "placeholder row, filled in on draft day" mechanism and the several
      pre-existing `RESTRICT` (not cascade) foreign keys into `LeagueTeam`
      this surfaced.
- [x] **11b - Team Identity & Team Needs** ✅ DONE (2026-07-21):
      `computeTeamIdentity` (Contender/Playoff Team/Play-In Team/
      Rebuilding/Tanking from a competitiveness percentile - actual win%
      once 20+ games are played, team strength before that - plus average
      roster age to split Rebuilding vs. Tanking at the bottom) and
      `computeTeamNeeds` (positional gaps + bench depth from roster
      composition; "Shooting" from the brief's original list was
      deliberately dropped - no shot-profile stat exists anywhere in this
      data model to detect it from, so faking it would be noise, not a
      documented simplification) - pure modules under `src/lib/gm/`, the
      foundation the acceptance-score engine (11c) builds on. Both are
      computed on demand from data every league already has (roster
      ratings/positions, win-loss records) - no schema change, and no
      backfill needed for existing leagues, unlike 11a. Surfaced on the
      team dashboard as a "Team identity" card. All 10 e2e tests and all
      295 unit tests (10 new) passing against a real production build.
      Next up: **11c (Trade Value Engine + GM Personality + Acceptance
      Score)**.
- [x] **11c - Trade Value Engine + GM Personality + Acceptance Score** ✅
      DONE (2026-07-21): CPU teams now actually evaluate whether a
      proposed trade is good for them - the core of the whole trade-AI
      overhaul. `computePlayerTradeValue`/`computeDraftPickTradeValue`
      (`src/lib/gm/`) give every player/pick an objective cents-denominated
      value (rating/potential/age/contract-quality/injury for players;
      projected slot/years-away/round for picks - picks reuse the exact
      rating-by-pick curve `generateDraftClass.ts` already uses, rather
      than a second hand-tuned scale). A 7-value `GmPersonality` enum
      (`LeagueTeam.gmPersonality`, new migration) assigned once per team at
      bootstrap reweights _how much_ a team leans toward certain factors
      via bounded 0.7-1.3 multipliers - it never overrides whether a trade
      is objectively fair. `evaluateTradeOffer` (`src/lib/trade/`) combines
      identity (11b) + needs (11b) + personality + an untouchable-player
      gate (young superstars, or a contender/playoff team's top 2 by
      rating, require a 1.75x objective overpay to even consider) into an
      Accept/Reject/Counter decision - wired into `executeTradeAction` as
      the real, authoritative gate (after `validateTrade`'s legality check,
      never before) and into `TradeBuilder.tsx` as a live client-side
      preview, same pattern as `validateTrade`'s own preview. Both teams'
      identity/needs/personality now also show on the Trade Builder page
      itself (a scope addition the user asked for while testing 11b).
      **Safeguard verified**: a specific test throws one blatantly
      lopsided trade (bench player for a near-max-value young superstar)
      at all 7 personalities and asserts every single one rejects it -
      personality differences only ever show up on genuinely close-to-fair
      trades. Also backfilled: `LeaguePlayer.careerGamesMissedToInjury`
      (incremented alongside the existing INJURY transaction log) gives
      the value model a real injury-history signal, and a one-time script
      randomized `gmPersonality` across every existing real league (the
      new column defaulted all of them to `BALANCED`, which would have
      made every CPU team identical - the same backfill discipline
      established after 11a/10d's gap). All 10 e2e tests (including 5
      repeat runs of the trade-execution test, since GM personality is
      randomized per league) and 315 unit tests passing against a real
      production build.
- [x] **11d - Counter-Offers, Rejection Messaging & Guide** ✅ DONE
      (2026-07-21): the last piece of Phase 11. `tradeReasonMessages.ts`
      wraps `evaluateTradeOffer`'s structured reason codes in 2-3 varied
      plain-English sentences each (deterministically seeded per trade
      context, so a message doesn't flicker on re-render but does vary
      across different trades/teams) - closes #54 "AI Trade Explanations".
      `suggestCounterOffer.ts` closes #48/#55 "AI Trade Negotiations"/
      "Counteroffers" by reusing `evaluateTradeOffer` itself as the judge
      rather than a second hand-tuned heuristic: it simulates adding each
      of the proposing team's own remaining available players/picks one at
      a time and surfaces the cheapest one that actually flips the
      decision to ACCEPT, or - if the real blocker is a specific
      untouchable player - simulates dropping each outgoing player instead
      and suggests building the offer around someone else. Wired into
      `TradeBuilder.tsx` as a suggestion box with a one-click "Add it"/
      "Remove it" button that directly toggles the suggested asset's
      selection. New `#cpu-trade-decisions` section on `/guide/finances`
      covering team identity, roster needs, GM personality, the
      untouchable-player rule, and counter-offer suggestions, reusing the
      existing `TEAM_IDENTITY_DESCRIPTION`/`GM_PERSONALITY_DESCRIPTION`
      label maps rather than writing new copy. Also fixed an incidental,
      pre-existing layout bug surfaced while screenshotting: the "How does
      this work?" link and the "Execute trade" button crowded onto the
      same line, since Playwright's/the browser's default `inline-block`
      display for both elements let them share a line - the link is now
      `block w-fit` so it stacks cleanly above the button. All 9 new unit
      tests (325 total), `tsc`, `eslint`, a clean production build, and all
      10 e2e tests passing; visually verified end-to-end via a throwaway
      Playwright script (a deliberately lopsided offer correctly showed
      "Likely to reject" plus a "Try sweetening the deal with Neemias
      Queta" suggestion; clicking "Add it" applied it and the decision
      flipped to "Likely to accept" with fresh reason text). **Phase 11
      (AI Trade Evaluation & GM Personalities) is now fully complete.**

### Phase 12 — GM Career Mode

Not yet started; design captured here so it isn't lost, per the user's
own detailed brief (2026-07-21). Deliberately kept separate from 10d -
this is a full second pillar (persistent, cross-league identity), not
just "what happens when you're fired":

- **GM Reputation (0-100)** - persistent on the _user_, not a single
  league, since it's meant to follow a GM between jobs. Modifiers per the
  brief: championships, exceeding preseason expectations, efficient
  spending relative to payroll, successful trades, drafting stars,
  developing young players, missing the playoffs, spending heavily while
  losing, bad contracts/trades, repeatedly upsetting star players (this
  last one needs a player-morale mechanic that doesn't exist yet either -
  roadmap #31, unstarted).
- **Getting fired is a dramatic event, not a quiet status change**: a
  "YOU'VE BEEN FIRED" recap screen (final record, preseason expectation,
  luxury-tax spend, owner confidence, a new "fan approval" concept, tenure
  length, best playoff finish), then a choice:
  - **Enter the GM Job Market** (the main path) - other teams make offers
    based on current Reputation, each with its own situation/expectations/
    cap flexibility/job security (e.g. a rebuild with high patience vs. a
    win-now job with a short leash). A recently-fired elite GM can still
    land a good job off reputation; a serially bad one only gets
    rebuilding gigs.
  - **Retire** - a full career summary (seasons, career record, playoff
    appearances, championships, notable trades, career earnings, final
    Reputation) plus a career grade/title (e.g. "Hall of Fame Executive").
- **Open design questions for when this is actually scoped**: does
  Reputation aggregate across a user's _simultaneous_ multi-franchise
  saves (Phase 9) or only a single sequential "career," is a job offer a
  reskinned version of the existing `/leagues/new` team-picker constrained
  by reputation, and how much of the career-stat aggregation (best trade,
  worst trade, career earnings) is realistic to compute after the fact
  versus needing to be tracked incrementally as it happens.

### Not scheduled / deferred pending user

- **AI GM Assistant (#5, #49)** and the genuinely conversational/
  LLM-dependent cluster around it (#50 Natural-Language Player Search, #51
  AI Roster Analysis, #52 AI Offseason Plan, #53 AI Trade Suggestions) —
  explicitly paused by the user; do not resume without them bringing it
  back up. Note this is narrower than it used to look: #7/#14/#21/#22/#46–
  48/#54/#55 all turned out to be rule-based CPU decision logic, not
  chat/LLM features, and are now scheduled into Phase 11 instead of stuck
  behind the paused assistant.
- Expansion teams/draft (#77/#78), custom team creation (#79), what-if
  mode (#81), custom rosters (#82) — low priority, large lift, revisit
  only if the user asks.

## Status log

- **2026-07-18**: Initial audit completed against the live codebase.
  Phase 1 (Season Simulation & Standings) selected as the next
  implementation target and started.
- **2026-07-18**: Phase 1 completed. Added a `Game` model + migration,
  three new pure/unit-tested modules (`teamStrength.ts`, `simulateGame.ts`,
  `generateSchedule.ts`), a batch-limited `simulateGamesAction`, and the
  `/leagues/[id]/standings` page with live simulate controls. League
  bootstrap now generates a full 58-game round-robin schedule per league.
  119 unit tests (+17), 6 e2e tests (+1), all passing against a real
  production build (verified with screenshots and manual flow testing).
  Items #15, #16, #17 moved to ✅ Fully Implemented; #8 upgraded to
  reflect standings now working. Next recommended phase: **Phase 2
  (Playoffs & League-Wide Dashboard)**, per the plan above.
- **2026-07-19**: Phase 2 completed. Added `PlayoffSeries` model +
  `Game.type`/`seriesId` fields (two migrations), three new pure/unit-tested
  modules (`playoffSeeding.ts`, `playInTournament.ts`, `simulateSeries.ts`),
  and two server actions (`startPlayoffsAction`, `simulateRoundAction`)
  that seed + simulate the play-in tournament and advance a fixed
  single-elimination bracket (real 1v8/4v5/2v7/3v6 round-1 matchups,
  2-2-1-1-1 series home-court pattern, home-court by regular-season record
  in later rounds) through to a champion. New `/leagues/[id]/playoffs`
  bracket page; standings page gained a league-wide "Recent Results"
  section and a Playoffs link. Extracted a shared `computeLeagueTeamStrengths`
  helper (used by both regular-season and playoff simulation) and added a
  `type: REGULAR_SEASON` filter to `simulateGamesAction`'s unplayed-games
  query as a defensive fix now that play-in/playoff `Game` rows exist.
  18 new unit tests (137 total), 1 new e2e test (`playoffs.spec.ts`, using
  a `tsx`-script test helper to fast-forward the regular season rather
  than 18 slow UI-driven batches), all passing against a real production
  build. Item #18 moved to ✅ Fully Implemented;
  #94 upgraded to reflect the new league-wide results section. Next
  recommended phase: **Phase 3 (Player Development & Multi-Season
  Progression)**, per the plan above.
- **2026-07-20**: Phase 3 completed. Added `SeasonAward` model +
  `LeaguePlayer.retiredSeason` field (two migrations), four new
  pure/unit-tested modules (`developPlayerRating.ts`, `retirement.ts`,
  `seasonAwards.ts`, plus `getSeasonCapRules` extended to project cap
  growth past 2025), a shared season-parameterized `estimateAge`/
  `estimateExperience` module, and `advanceSeasonAction` - ages every
  active player, applies development/decline, resolves retirements,
  expires contracts (deleting the old `Contract` row, since
  `leaguePlayerId` is unique), computes MVP/ROY/Most Improved, resets
  standings, generates the next season's schedule, and rolls
  `currentSeason` forward. New `/leagues/[id]/offseason` page shows the
  completed season's awards and a retirements list, gated on a crowned
  playoff champion. 37 new unit tests (174 total), 1 new e2e test
  (`offseason.spec.ts`), all passing against a real production build.
  Items #8, #19, #20, #42 moved to ✅; #39 upgraded to 🟡 (MVP/ROY/MIP
  shipped, DPOY/Sixth Man/All-Defense deliberately skipped - no honest
  data source, see docs/ARCHITECTURE.md). #28 and #30 (depth chart,
  injuries) moved from Phase 3 to Phase 7 - roster micromanagement, not
  season progression, so they didn't need to block this phase.
  Also this session: (1) added team `logoUrl` and wired it into the
  team-selection page per user request - NBA.com's own logo CDN was
  tried first (URLs valid per `curl`) but reliably failed to load in any
  real browser, including the actual deployed Vercel site, so switched to
  Wikipedia's image host instead, verifying all 30 URLs render in a real
  browser before committing to it (see docs/ARCHITECTURE.md); (2) found
  and fixed a real data bug (two players' bios matched to an unrelated
  1976-drafted namesake, surfaced as "retired at age 69" once this phase
  started displaying computed ages - fixed by nulling the incorrect
  draft fields rather than asserting a still-uncertain identity); (3)
  found and fixed a latent ordering bug where the trade-partner list had
  no explicit `orderBy` and silently depended on Postgres's incidental
  row order - added deterministic ordering and fixed the one e2e test
  that (unknowingly) depended on the old incidental order; (4) found and
  fixed a locator ambiguity in two e2e tests (`playoffs.spec.ts`,
  `offseason.spec.ts`) that only surfaced when the test's own team
  actually won the championship (adding a "Your team is the League
  Champion!" status banner next to the existing "League Champion"
  label), since playoff/series simulation isn't seeded and outcomes vary
  run to run. Next recommended phase: **Phase 4 (Draft System)** - also
  what unblocks retirement no longer being a one-way drain on the talent
  pool.
- **2026-07-20**: Phase 4 completed. Added `DraftProspect` model +
  `DraftPick.overallPickNumber`/`selectedProspectId` (one migration),
  three new pure/unit-tested modules (`draftLottery.ts` - the real
  post-2019 lottery odds table, `draftOrder.ts` - full 60-pick order from
  standings + playoff bracket, `generateDraftClass.ts` - 60 fictional,
  slot-correlated prospects with real variance), and three server actions
  (`startDraftAction`, `advanceDraftAction` for CPU best-available
  auto-picks, `makeDraftPickAction` for the user's own picks). New
  interactive `/leagues/[id]/draft` page: lottery result, a live draft
  board, and a prospect-selection UI when it's the user's turn.
  `advanceSeasonAction` now also requires the draft to be fully resolved,
  not just a crowned champion. Rookie contracts reuse the existing
  `generateContract` engine (rating stands in for the usual stats-derived
  score). 19 new unit tests (193 total), 1 new e2e test (`draft.spec.ts`),
  all passing against a real production build - verified the entire
  60-pick flow (lottery, CPU auto-picks, user picks, gate unlocking the
  offseason afterward) both locally and via screenshot. Items #13, #66,
  #67 moved to ✅; #8 updated to include Phase 4. #14 (draft pick trading)
  explicitly deferred - the pick inventory this phase adds is a
  prerequisite for it, but trading picks needs `TradeBuilder` UI work
  that's out of scope here. Also fixed two pre-existing test-fragility
  issues surfaced while adding the draft e2e test: a locator ambiguity in
  `draft.spec.ts` itself (the same "two messages visible at once" pattern
  already fixed once for playoffs/offseason), and updated
  `offseason.spec.ts` to run the draft to completion too, since advancing
  the season now depends on it. Next recommended phase: **Phase 5
  (Transactions, News & League History)**, or continue deepening Phase 4
  with pick trading once `TradeBuilder` supports non-player assets.
- **2026-07-20 (later)**: Polish pass on the draft UI based on hands-on
  user feedback after trying Phase 4 themselves (per the new "hands-on
  testing per phase" process): (1) two-column layout (on-the-clock
  picker/controls next to a live draft board, not stacked); (2) the
  board now fills in pick-by-pick with a brief delay when fast-forwarding
  CPU picks, instead of jumping straight to the end state - required
  moving the board to client-managed state, with the server actions now
  returning the full ordered list of what they resolved; (3) a position
  filter on the prospect picker; (4) a new Scouting Board section listing
  every prospect in the class (drafted or not) with an expandable report
  - 5 derived sub-attributes (`scoutingProfile.ts`) plus computed
    strengths/weaknesses, seeded by prospect id, flavor-only (the sim still
    only uses overall/potential rating). 6 new unit tests (199 total).
    Verified all four changes work correctly via an automated Playwright
    pass (confirmed the animation is genuinely progressive - sampled pick
    counts mid-animation - and that the position filter and scouting
    expand both work, after first catching two false negatives that turned
    out to be test-script locator bugs, not real ones) plus visual
    screenshots. Same day, the user asked for **#85 Multiple Franchise
    Saves** (switch between several running franchises, e.g. Bulls GM and
    Lakers GM) to be picked up right after this draft polish - this is
    already tracked below in Phase 9 (currently unstarted); see that
    section for the row status.
- **2026-07-20 (later)**: #85 Multiple Franchise Saves completed, fast-
  tracked out of Phase 9's order per explicit user request. Removed
  `createLeagueAction`'s old "redirect to the existing league" behavior
  in favor of a soft cap (`MAX_LEAGUES_PER_USER = 5`, a DB-growth guard,
  not a real product limit); new `/leagues` hub page lists every
  franchise as a card with a live status (regular season/playoffs/draft
  pending/ready for next season, computed the same way each feature page
  already gates itself); the team picker now flags (not blocks) teams
  the user already runs elsewhere. This turned out to need very little
  architectural change - every league-scoped page already authorized by
  `league.id` in the URL, never by "the one league this user has." Found
  and fixed one real bug in the process: after creating a second league,
  `/leagues` briefly showed a stale "no franchises yet" snapshot - Next.js's
  client-side link-prefetch cache for the hub wasn't being invalidated,
  since `createLeagueAction` only called `redirect()` and never
  `revalidatePath("/leagues")`. Updated the NavBar ("My League" → "My
  Leagues", now points at the hub) and sign-in's post-auth redirect (now
  `/leagues`, not straight to the team picker - sign-up still goes to the
  team picker directly, since a brand new user always has zero
  franchises). 1 new e2e test (`multiple-leagues.spec.ts`); updated two
  existing e2e tests (`league-creation.spec.ts`, `season-simulation.spec.ts`)
  that had baked in the old one-league-per-user / "My League" nav
  assumptions.
- **2026-07-20 (later)**: Phase 5 completed. Added one `LeagueTransaction`
  model/migration and wired logging into `executeTradeAction`,
  `signFreeAgentAction`, and `advanceSeasonAction` (retirements), each
  writing a pre-rendered description via a new pure module
  (`src/lib/transactions/describeTransaction.ts` - `describeTrade`,
  `describeSigning`, `describeRetirement`; 9 new unit tests). Two new
  pages: `/leagues/[id]/transactions` (the trade/signing/retirement wire,
  doubling as the news feed - see `docs/ARCHITECTURE.md` for why this is
  one system, not two) and `/leagues/[id]/history` (past champions, season
  awards, and retirees, grouped season-by-season from data Phases 2-3
  already produce - `PlayoffSeries`, `SeasonAward`, `retiredSeason` - with
  no new logging needed for that page). Deliberately skipped logging
  individual CPU draft picks as transactions (60 near-identical entries
  per draft would just be noise; the draft board already serves as that
  event's own record). Items #36, #37, #43, #45 moved to ✅. 2 e2e tests
  extended (`free-agency.spec.ts`, `trade-execution.spec.ts` now assert the
  signing/trade shows up on the news feed; `offseason.spec.ts` now also
  asserts the completed season's champion/awards appear on `/history`) -
  all 10 e2e tests + 208 unit tests passing against a real production
  build. Also found and fixed one stale-state issue while testing: the
  local `npm run build && npm run start` server (used by Playwright's
  `webServer`) had been left running from earlier in the session and was
  serving a pre-Phase-5 production build, silently masking the new routes
  until it was killed and rebuilt - not a code bug, but worth noting since
  it can look exactly like one. Next recommended phase: **Phase 6
  (AI-Driven CPU Teams & Trade Depth)** - CPU teams currently accept any
  legal trade and never initiate one, which is the biggest remaining gap
  in franchise-mode believability.
- **2026-07-20 (later)**: "Living league" pass, fast-tracked out of order
  from Phase 6/7 at explicit user request after testing Phase 5 - the
  league previously only ever generated news from the user's own actions;
  the other 29 teams sat frozen all season. Added: (1) in-season injuries
  (`rollForTeamInjury`) with a **real mechanical effect** - injured players
  are now excluded from `computeLeagueTeamStrengths`, so a hurt rotation
  player genuinely weakens that team's simulated games, including the
  user's own team; (2) CPU-CPU trades (`rollForCpuTrade`), biased toward
  each team's lower-rated ~70% of roster and validated through the same
  `validateTrade` the user's own trades use - deliberately never involves
  the user's team, since trading their players without consent would break
  the "you're the GM" premise; (3) CPU free-agent signings
  (`rollForCpuSigning`), always a 1-year veteran-minimum deal. All three
  write into the same `LeagueTransaction` feed Phase 5 built. Frequency is
  driven by games-simulated count, not clicks or real time (`shouldTriggerEvent`),
  per the user's explicit request that "sim a few games, now some news; sim
  more, more news." New model field `LeaguePlayer.injuryReturnsAtGamesPlayed`
  - `TransactionType.INJURY`. New dashboard "Status" column (Healthy/Out)
    on the roster table. 15 new unit tests for the pure roll logic
    (`leagueEvents.test.ts`). Updated `scripts/e2e-fast-forward-season.ts` to
    process in real 50-game batches (was one giant batch) so it exercises
    this system the same way a real playthrough would, and extended
    `playoffs.spec.ts` to assert the news feed shows activity after a
    fast-forwarded season - safe/non-flaky since a full season gives the
    injury roll alone ~1,700 independent chances to fire. Found and fixed two
    real bugs during this work: (a) an injury rolled late in the season with
    a long recovery window could reference a games-played threshold beyond
    the ~58 games a season actually has, leaving a player stuck "out"
    forever - fixed by having `advanceSeasonAction` unconditionally reset
    every player to healthy at the season turnover, verified by direct query
    against all 27 previously-advanced leagues in the dev DB (zero stale
    injuries); (b) the locally-running dev server had a stale in-memory
    Prisma Client from before this session's schema migration was applied,
    surfacing as a confusing "Unknown argument `leagueTeamId`" error on
    `advanceSeasonAction` - fixed by restarting it (not a code bug, but the
    same "stale local server" trap as the previous entry's build/start
    issue, this time in dev mode after a mid-session `prisma generate`). All
    10 e2e tests + 223 unit tests passing. Items #30 moved to ✅; #46 moved
    to 🟡 (the random-but-legal version now exists; real team-direction-driven
    evaluation is still Phase 6's actual remaining scope). Next recommended
    phase: still **Phase 6 (AI-Driven CPU Teams & Trade Depth)** for the
    deeper "should this team want this trade" logic, or **Phase 7**'s
    remaining depth-chart/rotation item, which the injury system's roster
    exclusion now makes more relevant than before.
- **2026-07-21**: Playoffs bracket UI redesign, requested directly by the
  user ("bracket style look, East on left, West on right, updates all the
  way to the finals"). Replaced the old stacked-by-round grid-of-cards
  layout with a real visual bracket (`PlayoffBracket.tsx`) built on plain
  CSS Grid - round-N box row-start/span derived purely from `2 **
roundIndex`, so connector lines and box positions stay pixel-aligned
  without manual height math. Renders "TBD" placeholder boxes for rounds
  not yet reached, so the bracket's overall shape is visible and stable
  from the moment the playoffs start, filling in round by round as the
  user simulates. First pass used full team names and needed a horizontal
  scroll container to fit - user explicitly rejected that ("i dont want a
  scroll bracket") - revised to team abbreviations and compact fixed-width
  boxes so the entire bracket (East + Finals + West) fits on one screen at
  a normal viewport width with no scrolling. That revision initially
  dropped the per-round labels ("Round 1", "Conf. Semis", "Conf. Finals")
  that the old layout had, breaking `playoffs.spec.ts`'s assertion for
  them - a real UX regression, not just a test artifact, so added them
  back as compact column headers rather than just patching the test.
  Verified visually via Playwright screenshots at multiple bracket
  progress stages (round 1 just started, mid-bracket, champion crowned) -
  not just passing tests - since this was a pure layout/visual change.
  All 10 e2e tests + 223 unit tests passing against a real production
  build.
- **2026-07-21 (later)**: User reported the bracket still didn't look
  right (screenshot showed boxes not aligned between the pairs feeding
  them, and connector lines looking disconnected) and asked for a proper
  fix, not a patch - correctly diagnosed as a real bug, not a design
  taste issue: CSS Grid items span their assigned rows by default but
  don't center their _content_ within that span, so every box was
  rendering flush to the top of its row range instead of centered between
  its two feeders. Fixed by wrapping each box in `flex h-full
items-center`. Also rebuilt the connectors as proper elbows (a vertical
  spine between the two feeding boxes' own centers, with stubs into each
  child and the parent) instead of the previous single-midpoint-only
  line, and added a direct connector from each conference's Conference
  Finals box into the centered NBA Finals box so it no longer looks like
  an isolated floating box. Re-verified visually end-to-end by tracing an
  entire simulated bracket in a screenshot (Round 1 winners -> Conf Semis
  -> Conf Finals -> NBA Finals -> crowned champion) and confirming the
  visual connections matched the actual series results, not just that the
  page rendered without errors. All 10 e2e tests + 223 unit tests passing
  against a real production build; no changes to the underlying
  `playoffs.ts` simulation/bracket-advancement logic.
- **2026-07-21 (later)**: User asked for "a general dashboard... a
  homepage/starting point for the user to navigate through the different
  parts of the simulator," leaving the design open. Rather than adding a
  new route, extended the existing `/leagues` hub (already the sign-in
  landing page and the "My Leagues" nav destination) into a real
  dashboard: a personalized greeting, franchise cards with color-coded
  status badges (blue/orange/purple/green for regular season/playoffs/
  draft/ready-for-next-season), a new cross-league "Recent activity" feed
  (the first place anything queries `LeagueTransaction` across _all_ of a
  user's leagues at once, rather than one league at a time), and an
  "Explore" section linking to `/teams` and the engineering write-up.
  This isn't tracked against a specific numbered roadmap item - #9 (Team
  Dashboard) and #94 (Interactive League Dashboard) are both about a
  _single_ league's own dashboard/standings view, not this cross-account
  landing page. Updated 3 e2e tests (`league-creation.spec.ts`,
  `multiple-leagues.spec.ts`, `season-simulation.spec.ts`) whose
  assertions depended on the old literal "My Leagues" page heading, which
  the redesign replaced with a personalized greeting - a real, intentional
  copy change, not a bug. Verified visually via a Playwright screenshot
  with two franchises (one fast-forwarded to generate real cross-league
  activity) to confirm the aggregated feed actually attributes each entry
  to the right franchise. All 10 e2e tests + 223 unit tests passing
  against a real production build.
- **2026-07-21 (later)**: User clarified their "general dashboard" request
  from the previous entry actually meant `/leagues/[id]` (the per-team
  page a user lands on right after picking a team), not the `/leagues`
  hub just redesigned above - both are reasonable readings of "homepage/
  starting point," but this is the one they meant. Added a "Franchise
  overview" card row (conference rank, playoff picture, this-season draft
  picks, most recent league activity, all-time championship count, free
  agency) between the header and the existing cap-sheet stats, so the
  team page now surfaces a snapshot of every other section instead of
  just linking out to them. Closes a gap flagged since Phase 4 (draft
  picks existed in the data model but were never shown on the team
  dashboard itself). Item #9 (Team Dashboard) moved from 🟡 to ✅.
  New card labels initially duplicated nav link text closely enough
  ("Standings," "Playoffs," "Latest news") to break 3 e2e tests via
  Playwright's default substring/case-insensitive text matching -
  renamed cards to be clearly distinct from nav labels, and scoped
  `trade-execution.spec.ts`'s post-trade player-name assertions to the
  roster table specifically (a trade's description text naming both
  players is unavoidably going to share names with the roster table on
  the same page - not something a label rename can fix). All 10 e2e
  tests + 223 unit tests passing against a real production build.
- **2026-07-21 (later)**: User gave a large, detailed design brief for a
  simplified financial system ("realistic consequences without
  complicated rules") plus an entirely new Owner Confidence/GM Job
  Security/firing meta-system - one of the biggest single asks this
  session. Rather than attempt it all at once, split it into sub-phases
  (documented as Phase 10 above) and completed only 10a this pass: four
  new pure modules (`playerValueTier.ts`, `capStatusLabel.ts`,
  `describeTradeFeasibility.ts`, `describeSigningFeasibility.ts`, 15 new
  unit tests) that translate the existing real CBA engine's output into
  plain language, without changing how legality is actually decided.
  Wired into the team dashboard (financial status + a new "Value Tier"
  roster column), the trade builder (`describeTradeFeasibility` replaces
  the raw violation-message list with a "Trade Financial Check:
  Valid/Invalid" + one-line plain-English explanation, matching the
  brief's example wording almost verbatim), the free-agency offer form
  (both MLE variants now show as one "Signing Exception" concept), and
  the free-agent board (a "Value Tier" column). Verified visually via
  Playwright screenshots of the dashboard, trade builder (mid-selection,
  showing the real "$X more needed" shortfall message), and the sign-offer
  form. Updated `trade-execution.spec.ts` for the new valid-trade copy.
  All 10 e2e tests + 238 unit tests passing against a real production
  build. Explicitly did NOT build in this pass (queued as 10b/10c/10d):
  Re-Signing Rights (doesn't exist as a mechanic at all yet), cumulative
  Signing Exception tracking, multi-year cap projections, the Financial
  Flexibility Grade, and the whole Owner Confidence/directives/firing
  system - all flagged to the user up front before starting, given the
  scope.
- **2026-07-21 (later)**: Phase 10b completed. Added
  `LeaguePlayer.reSigningTeamId` (migration, backfilled to match existing
  rostered players' current team) - the simplified Re-Signing Rights
  mechanic requested in 10a's brief but not actually built yet. Wired
  into every path that changes who a player is signed to: user and CPU
  free-agent signings, user and CPU trades (rights transfer to the
  acquiring team, matching how real Bird rights travel), draft rookie
  assignment, and league bootstrap - deliberately _not_ cleared on
  contract expiration, so it still points at the player's last team while
  they're a free agent. `validateSigning` gained a `reSigningRights`
  input (checked before the normal cap-space/exception paths) and a
  `signingExceptionUsedCents` input so exception offers are checked
  against remaining room, not the full per-season ceiling - both
  extended with new unit tests (17 across `validateSigning.test.ts` +
  `reSigningRights.test.ts`, 246 total). `getSigningExceptionUsage`
  derives cumulative usage from existing `Contract.signedUsing` rows
  rather than a new tracked counter. UI: a "Re-Signing Rights" badge on
  the free-agent list and offer page, and a Total/Used/Remaining Signing
  Exception breakdown on the offer form. Verified visually end-to-end by
  fast-forwarding a full season through the offseason (so a real expired
  contract existed to test against) and confirming the badge, the
  exception math, and the rejection of an over-the-line offer all
  render correctly - not just that the unit tests pass. All 10 e2e tests
  and all 246 unit tests passing against a real production build. Next
  up: **10c (multi-year cap projections + Financial Flexibility Grade)**.
- **2026-07-21 (later)**: User asked for an in-app guide explaining the
  Trade Financial Check (asked a few turns earlier, deferred to "after
  10d" at the time) plus one for 10b's new mechanics, rather than waiting
  - reasonable, since users hitting Re-Signing Rights/Signing Exception
    right now shouldn't have to wait for a future phase to understand them.
    Added one consolidated, extensible reference page (`/guide/finances`)
    covering Financial Status, Player Value Tiers, the Trade Financial
    Check, Re-Signing Rights, and the Signing Exception, each in its own
    anchored section - built so a 10c section can be appended the same way
    later, rather than a new page per phase. Linked contextually (not from
    the nav) from exactly where confusion would actually happen: the team
    dashboard's financial-status line, the trade builder's feasibility
    result (deep-links straight to `#trades`), and the sign-offer form
    (deep-links to whichever of `#re-signing-rights`/`#signing-exception`
    is actually relevant to that specific offer). The trade
    builder/sign-offer links open in a new tab on purpose, since both are
    client-side forms with in-progress selections a same-tab navigation
    would discard. Verified all three links render and point at the
    correct anchors via a Playwright script. All 10 e2e tests and 246 unit
    tests still passing (no new logic, so no new unit tests needed) against
    a real production build.
- **2026-07-21 (later)**: Phase 10c completed. Two new pure modules:
  `computeMultiYearProjection` (sums each future season's already-committed
  payroll from `ContractYear` rows, no assumed future moves) and
  `computeFinancialFlexibilityGrade` (an A-F letter from current Financial
  Status + the 4-season projection + a check for single large long-term
  contracts, 10 new unit tests combined). Added a "Future Financial
  Flexibility" card to the team dashboard between the cap stats and the
  roster table: the grade badge, a one-line plain-English summary, and 4
  season cards showing committed payroll tapering off as contracts expire
  - verified visually that a real roster's numbers taper correctly (e.g.
    $125.2M -> $70.6M -> $0 -> $0 as shorter deals fell off). Extended
    `/guide/finances` with a matching `#financial-flexibility` section and
    a dashboard link into it. All 10 e2e tests and 256 unit tests passing
    against a real production build. Phase 10's remaining piece is **10d
    (Owner Confidence, expectations, directives & firing)** - the big new
    GM-accountability system, deliberately saved for last since it builds
    on the tier/status/grade concepts from 10a-10c.
- **2026-07-21 (later)**: Phase 10d completed - the last piece of Phase 10. Five new pure modules under `src/lib/gm/` (`payrollTier`,
  `expectationLevel`, `seasonEvaluation`, `jobSecurity`,
  `ownershipMessages`; 26 new unit tests) plus a `League.ownerConfidence`/
  `payrollReductionTargetCents`/`payrollDirectiveSeason` schema addition and
  a new `SeasonExpectation` model (one row per league+season, locked in at
  the start of that season so evaluation always compares against what was
  actually expected at the time, not a standard re-derived from a roster
  that's since changed via trades). `createLeagueAction` sets season 1's
  expectation directly so `advanceSeasonAction` can always assume a prior
  row exists - no special-cased bootstrap branch. `advanceSeasonAction` now:
  evaluates the just-completed season (actual playoff outcome vs. locked-in
  expectation → verdict → confidence delta, scaled by that season's payroll
  tier captured _before_ the existing expired-contract cleanup deletes the
  `ContractYear` rows it depends on), resolves any directive targeting that
  season, sets the new season's expectation from the post-rollover roster,
  and - if confidence is low and payroll is still heavy - issues a fresh
  directive. All of it logs plain-English `OWNERSHIP_MESSAGE` transactions
  into the existing news feed rather than a new messaging system. UI: a
  "GM Job Security" card on the team dashboard (confidence bucketed into
  six levels, Very Secure through Critical - Critical is this phase's
  firing _trigger_; the actual firing event is Phase 12's job), an
  "Ownership" section on the offseason page showing that advance's
  messages, `OWNERSHIP_MESSAGE` added to both transaction-feed type-label
  maps, and a new `#owner-confidence` section on `/guide/finances`.
  Verified end-to-end with a throwaway Playwright script that played a full
  season through the real UI (playoffs → draft → advance) and confirmed
  the evaluation message, new expectation, updated Job Security badge, and
  the news-feed entries all rendered correctly with real data - not just
  that the unit tests passed. All 10 e2e tests and all 282 unit tests
  passing against a real production build. Phase 10 (Simplified Financial
  System & GM Accountability) is now fully complete; Phase 12 (GM Career
  Mode - persistent reputation, job market, firing consequences,
  retirement) remains unstarted by design.
- **2026-07-21 (later)**: User asked for a full overhaul of trade AI so
  CPU teams behave like real front offices (identity, needs, personality,
  a genuine accept/reject/counter decision) instead of auto-accepting any
  financially-legal trade. Scoped into **Phase 11**, four sub-phases
  (11a-11d) - only 11a done this pass. Planning surfaced a real
  prerequisite gap: draft picks weren't tradeable at all (no future-pick
  inventory existed; `TradeBuilder` was player-only), so the user directed
  building that first. **11a (Future Draft Pick Inventory & Pick Trading)
  completed**: `buildFuturePickRows` (`src/lib/draft/futurePicks.ts`)
  generates a rolling 5-season-ahead window of both rounds' own picks per
  team, seeded at league creation and extended by one season every
  `advanceSeasonAction`; `overallPickNumber` stays null until that
  season's own `startDraftAction` runs, which now _updates_ the
  pre-existing placeholder row (keyed by `round`+`originalTeamId`) instead
  of creating a fresh one - critical, since creating fresh rows would
  silently revert any pre-draft pick trade back to the original owner.
  Pre-generating placeholders broke the implicit "row exists = draft
  started" assumption baked into 8 call sites across
  `draft.ts`/`offseason.ts`/3 page components - all fixed to check
  `overallPickNumber: { not: null }` instead. `TradeBuilder.tsx` and
  `executeTradeAction` both extended to handle `DRAFT_PICK` assets
  alongside players, reusing `validateTrade`'s existing (previously
  unexercised) Stepien-rule support now that `ownedFutureFirstRoundPickSeasons`
  is populated with real data instead of `[]`. `describeTransaction.ts`'s
  `TradeSide.sentPlayerNames` renamed to `sentAssetNames` since it now
  carries pick labels too.
  - **Notable incident during verification**: e2e runs intermittently
    failed in ways that looked like flaky tests but traced back to the
    Neon Postgres database hitting its 512MB free-tier storage cap - 370
    disposable `@example.com` test accounts (from many e2e runs across
    this and the prior session) had accumulated 386 leagues' worth of
    data, and 11a's extra per-league rows tipped it over. Cleaned up via
    a script deleting all `@example.com` users (cascades through
    everything they own) - surfaced that `Contract`/`DraftPick`/
    `TradeException`/`TradeAsset`'s foreign keys into `LeagueTeam` are
    `RESTRICT`, not cascade, requiring those four tables to be cleared
    explicitly before the user delete, in dependency order. A `DELETE`
    alone doesn't shrink Postgres's on-disk file size (MVCC dead tuples
    need `VACUUM` to reclaim), so a `VACUUM FULL` pass followed the
    cleanup: 490MB → 16MB. Only the 3 real (non-test) users' 5 leagues
    were preserved throughout. Separately, `advanceSeasonAction`'s
    cumulative round-trip count (already large from Phase 10d, one more
    added by 11a) was shown to occasionally exceed e2e's assertion
    timeouts under full-suite sequential load - fixed by parallelizing
    two pairs of independently-fetchable queries that were needlessly
    sequential (net zero new round trips vs. pre-11a) and giving the
    e2e assertion realistic headroom (30s → 60s) to match what the
    heaviest action in the app actually costs. A second, unrelated e2e
    flake (`free-agency.spec.ts`) traced to a `getByText` locator
    resolving against thousands of matching ancestor elements plus a
    tight default 5s assertion timeout on a real page navigation - fixed
    with a more specific `getByRole("link", ...)` locator and a 15s
    timeout, matching the file's own precedent elsewhere.
  - Verified end-to-end with a throwaway Playwright script: built a trade
    including a future pick from each side, confirmed the Trade Financial
    Check validates it, executed it, and confirmed both the news feed
    description ("...traded Jayson Tatum and 2023 1st Round Pick...for
    Julius Randle and 2028 2nd Round Pick") and pick ownership were
    correct. All 10 e2e tests and all 285 unit tests (3 new, for
    `buildFuturePickRows`) passing against a real production build, run
    clean multiple times in a row after the DB cleanup and timing fixes.
    Next up: **11b (Team Identity & Team Needs)**.
  - **Important gap found right after shipping**: the user tested 11a on
    their own existing (real, pre-dating-this-phase) league and saw no
    "Draft picks" section at all - the future-pick inventory generation
    was only wired into `createLeagueAction`, so leagues created before
    today never got it. The same root cause turned out to also apply to
    Phase 10d's `SeasonExpectation`: `advanceSeasonAction` only ever
    _continues_ an existing chain, it never bootstraps a missing one, so
    old leagues silently never got GM Job Security data either. Fixed
    with a one-time backfill script across every real (non-test) league.
    **Standing rule going forward**: any new schema-backed feature must
    be backfilled onto existing leagues as part of finishing that phase,
    not left for the user to discover missing in their own save (11b
    itself needed no backfill, since identity/needs are computed on
    demand from data every league already has - only features that
    _persist_ new state, like 11a's `DraftPick` rows or 10d's
    `SeasonExpectation` rows, are at risk of this).
- **2026-07-21 (later)**: Phase 11b completed. `computeTeamIdentity`
  (`src/lib/gm/teamIdentity.ts`) and `computeTeamNeeds`
  (`src/lib/gm/teamNeeds.ts`), 10 new unit tests. Both pure, computed on
  demand - no schema change, no backfill risk. Identity uses actual win%
  once 20+ games are played this season, team strength (`computeLeagueTeamStrengths`,
  already existed for game simulation) before that, ranked against all 30
  teams via percentile; needs are positional-count + quality-threshold
  based, reusing `playerValueTier.ts`'s own STARTER/ROTATION cutoffs
  rather than inventing new ones. Deliberately dropped "Shooting" from the
  brief's original need list - no shot-profile stat exists anywhere in
  this data model to detect it from. Surfaced as a new "Team identity"
  card on the team dashboard (identity headline + needs summary),
  reusing the existing `OverviewCard` component. Verified visually against
  a genuinely bad team (Detroit Pistons, preseason): correctly classified
  "Tanking" with "Star scorer, Starting-caliber point guard" needs, and
  confirmed a strong center (Jalen Duren, 66) correctly did _not_ trigger
  a false rim-protector need - judged by a position's best player, not its
  average. All 10 e2e tests and all 295 unit tests passing against a real
  production build. Next up: **11c (Trade Value Engine + GM Personality +
  Acceptance Score)** - the core evaluation logic everything so far has
  been building toward.
- **2026-07-21 (later)**: Phase 11c completed - the core of the whole
  trade-AI overhaul. `computePlayerTradeValue`/`computeDraftPickTradeValue`
  (`src/lib/gm/`) give every player/pick an objective cents-denominated
  trade value; `GmPersonality` (7 values, `LeagueTeam.gmPersonality`, new
  migration, randomized per team at bootstrap) reweights how much a team
  leans toward certain factors via bounded 0.7-1.3 multipliers;
  `evaluateTradeOffer` (`src/lib/trade/`) combines identity + needs +
  personality + an untouchable-player gate into an Accept/Reject/Counter
  decision, wired into `executeTradeAction` as the real gate and into
  `TradeBuilder.tsx` as a live preview showing both sides' identity/needs/
  personality (a scope addition made while testing 11b). **Fairness
  safeguard verified**: a test throws one blatantly lopsided trade at all
  7 personalities and confirms every one rejects it. Backfilled existing
  leagues' `gmPersonality` (the new column would have otherwise defaulted
  all 30 teams on every existing save to identical "Balanced" front
  offices) and added `LeaguePlayer.careerGamesMissedToInjury` as a real
  injury-history signal. All 10 e2e tests (including 5 repeat runs of
  `trade-execution.spec.ts`, since personality is randomized per league)
  and 315 unit tests passing against a real production build.
  - **Follow-up polish, same day**: the user tested a real trade (OG
    Anunoby + Paul George for Joel Embiid + Kyle Lowry) and flagged it as
    unrealistic - Embiid shouldn't be that easy to acquire. Root cause:
    the untouchable-player gate only protected a "young (≤25) superstar"
    or a "top-2 rated player on a currently Contender/Playoff-Team
    identity," so an older superstar (Embiid-age) on a team that wasn't
    currently a Contender/Playoff Team by record fell through both
    branches entirely. Fixed: any player at `SUPERSTAR` tier
    (`getPlayerValueTier`) is now untouchable regardless of age or team
    identity - real front offices don't casually move a top-tier talent
    just because they're rebuilding. Added a test for exactly this case
    (an older superstar on a Rebuilding team). All 316 unit tests passing.
- **2026-07-21 (later)**: Player ratings recalibrated to a 60-99
  NBA-2K-style scale (was ~0-100, real players landing 25-88). The user -
  who plays real 2K - flagged Jayson Tatum showing as 72 and bench players
  dipping to 25-30 as unrealistic. Looked up real 2K24 ratings as anchor
  points (Jokić 98; Giannis/LeBron/Embiid/Durant/Curry 96; Dončić/Tatum/
  Butler 95; real starters ~77-78; deep bench ~60-71). Rather than bolt on
  a second rescaling function, shifted `computePerformanceScore`'s own
  baseline (`50`→`72`) and clamp (`[0,100]`→`[60,99]`) - the per-stat
  weights didn't need to change, only the anchor/ceiling/floor. Verified
  against the real anchors using the formula's own math before touching
  any code (Embiid's old raw score ~88 → 99 clamped; Tatum's old ~72 → 94
  - both close to their real 2K ratings). Every other rating-scale
    constant across the app moved in lockstep - `scoreToCapFraction`'s
    midpoint/steepness (re-derived, not carried over, so contract-dollar
    generation still produces sensible salaries against the new scale),
    `playerValueTier.ts`'s five tier boundaries, `generateDraftClass.ts`'s
    pick-1/pick-60 anchors, `developPlayerRating.ts`'s clamps,
    `retirement.ts`'s rating-risk cutoffs, `expectationLevel.ts`'s/
    `teamNeeds.ts`'s/`evaluateTradeOffer.ts`'s thresholds (all already
    mirrored `playerValueTier.ts`, kept mirroring it), and
    `FREE_AGENT_RATING_CUTOFF` - see `docs/ARCHITECTURE.md`'s new "Player
    rating scale" section for the full list. None of the trade-AI weight
    ratios needed to change, only absolute rating numbers. Backfilled every
    existing real league's `LeaguePlayer.overallRating`/`potentialRating`
    with the same linear transform (`+22`, reclamped) rather than
    recomputing from scratch, which would have erased in-league development
    progress and can't work for fictional draft-generated prospects anyway.
    Surfaced (and fixed) one real regression along the way: recalibrated
    contracts shifted a test team's cap status, exposing a pre-existing
    `getByText("Free agents")` nav-link collision with the Under-the-Cap
    description text ("...can freely sign available free agents.") -
    same class of issue as the Phase 5 dashboard-card collision, fixed the
    same way (a more specific `getByRole("link", ...)` locator). All 10
    e2e tests and all 316 unit tests passing against a real production
    build; visually confirmed Tatum at 94 and Embiid clamped to 99 on a
    real roster.
- **2026-07-21 (later)**: Added a delete-league action - the user hit the
  `MAX_LEAGUES_PER_USER` (5) cap with no way to remove old franchises.
  Standalone utility feature, not part of the numbered Phase 11 roadmap.
  `deleteLeagueAction` (`src/lib/actions/league.ts`) checks league
  ownership, then deletes in dependency order ahead of the `League` row
  itself: `TradeAsset` → `Contract` → `DraftPick` → `TradeException`,
  since those four have a `RESTRICT` (not cascade) FK into `LeagueTeam` -
  the exact ordering learned earlier this session cleaning up accumulated
  e2e test data. Everything else cascades cleanly. `DeleteLeagueButton`
  (new client component) renders a hover-revealed trash icon on each
  `/leagues` card that expands into an inline "Delete {franchise}? [Yes,
  delete] [Cancel]" confirmation rather than a native `window.confirm()`,
  matching the app's existing custom-UI language. Required restructuring
  each league card from "whole card is a `<Link>`" to an outer
  `group relative` `<div>` with the delete button as an absolutely
  positioned sibling and the original clickable content wrapped in an
  inner `<Link>` (a `<button>` can't nest inside an `<a>`). All 316 unit
  tests, `tsc`, `eslint`, a clean production build, and all 10 e2e tests
  passing; visually verified via a throwaway Playwright script (create a
  league, hover to reveal the delete button, confirm, verify it
  disappears from the hub) - screenshots checked then the script deleted.
- **2026-07-21 (later)**: Phase 11d completed - the last piece of the
  trade-AI overhaul. `tradeReasonMessages.ts` (2-3 deterministically-varied
  plain-English messages per `evaluateTradeOffer` reason code) closes #54
  "AI Trade Explanations"; `suggestCounterOffer.ts` closes #48/#55 "AI
  Trade Negotiations"/"AI Counteroffers" by reusing `evaluateTradeOffer`
  itself as the judge - simulating each of the proposing team's own
  remaining available assets one at a time to find the cheapest real
  addition that flips a decision to ACCEPT, or (when the actual blocker is
  a specific untouchable player) simulating dropping each outgoing player
  to find which one clears the block. Wired into `TradeBuilder.tsx` as a
  suggestion box with a one-click "Add it"/"Remove it" button. New
  `#cpu-trade-decisions` section on `/guide/finances` explaining team
  identity, roster needs, GM personality, the untouchable-player rule, and
  counter-offer suggestions - reusing existing label/description maps
  rather than new copy. Also fixed an incidental pre-existing layout bug
  (the "How does this work?" link and "Execute trade" button crowding
  onto one line due to both defaulting to `inline-block`) found while
  screenshotting. 9 new unit tests (325 total), all passing along with
  `tsc`, `eslint`, a clean production build, and all 10 e2e tests;
  visually verified end-to-end via a throwaway Playwright script (a
  lopsided offer correctly read "Likely to reject" with a "Try sweetening
  the deal with Neemias Queta" suggestion; clicking "Add it" applied it
  and the decision flipped to "Likely to accept" with fresh reason text).
  **Phase 11 (AI Trade Evaluation & GM Personalities) is now fully
  complete** - all four sub-phases (11a-11d) shipped. Phase 12 (GM Career
  Mode) remains unstarted by design; no other phase is currently in
  progress.
- **2026-07-21 (later)**: Fixed a real data bug found by the user starting
  a new Jazz franchise and seeing only 6 rostered players. Root cause:
  `scripts/import-players.ts` preferred balldontlie's _current_ (real-world,
  as-of-import-time) team over the season-stats fixture's own team field
  when building `players.json`'s `teamAbbreviation` - fine for a bio
  display, but this field is exactly what `createLeagueAction`/`seed.ts`
  use to decide which team a new league starts a player on. Several
  players traded in real life since the 2023-24 season (e.g. Luka Dončić
  to the Lakers) were showing up on their current team instead of their
  actual 2023-24 team, scrambling roster composition league-wide - some
  teams (Jazz, Miami) ended up thin because half their real 2023-24 roster
  got misattributed elsewhere while players who were never really on that
  2023-24 team got attributed to it instead. Fixed by preferring the stats
  fixture's season-accurate team; re-ran the (already-cached, no new API
  calls needed) balldontlie checkpoint to regenerate `players.json` (still
  497/497 matched, 0 skipped on reseed) and updated
  `prisma/data/players.test.ts`'s Dončić case, which had encoded the buggy
  behavior as an intentional design decision. Only affects the _reference_
  `Player` table (shared, not per-league state), so one reseed fixes every
  future new league automatically - no per-league backfill needed or
  attempted; an already-created league (like the user's original Jazz
  franchise) keeps whatever roster it was created with, and can simply be
  deleted and recreated (using the delete-league feature from earlier this
  session) to pick up the fix. All 334 unit tests, `tsc`, `eslint` passing.
  Separately noted but explicitly deferred at the user's own direction:
  even with correct team assignment, a meaningful fraction of a real
  team's roster (e.g. Jazz 8/17, Miami 9/16) still starts as free agents
  at league creation because of `FREE_AGENT_RATING_CUTOFF` (65) - worth a
  closer look as a possible future follow-up, but out of scope for this fix.
- **2026-07-22**: Fixed the actual root cause of the thin-roster complaint
  above - `computePerformanceScore` was double-penalizing low-minutes
  bench players (raw per-game stats compared against a 24-minute
  baseline, _plus_ a standalone minutes penalty term), crushing 41.6% of
  all 497 real players to the exact rating floor (60), not the intended
  "bottom ~15%". Fixed via partial per-36-minutes normalization
  (`MINUTES_NORMALIZATION_BLEND = 0.7`) with confidence-shrinkage toward a
  `REPLACEMENT_LEVEL_SCORE` (65) for players under `CONFIDENCE_MINUTES`
  (16) - see `docs/ARCHITECTURE.md`'s "Player rating scale" section for
  the full writeup, including why a naive full per-36 conversion
  overcorrected (it under-rated scoring wings like Tatum/Curry relative to
  shot-blocking bigs like Jokić/Embiid, an imbalance the old formula also
  had but hid behind ceiling-clamping) and how weights were re-tuned
  against a broader real-anchor set spanning archetypes rather than just
  top scorers. Floor-pileup dropped to 13.1%; a fresh Jazz franchise now
  rosters 14 real players (was 6) with a realistic 66-92 rating spread
  across all five tiers - verified visually via a throwaway Playwright
  script (screenshot, then deleted). No downstream threshold actually
  needed to change (tier boundaries, `FREE_AGENT_RATING_CUTOFF`, cap-value
  curve, trade-AI thresholds were all re-checked against the new
  distribution and found still correct) - unlike the original NBA-2K
  rescale, this fix only changed the _input mapping_, not the output
  scale. Existing leagues backfilled per-player-delta (not a flat shift):
  for every real `LeaguePlayer`, recomputed their stat-derived rating
  under both the old and new formula and applied the _difference_ to
  their current (possibly already-developed) rating, preserving in-league
  progression - `scripts/backfill-rating-formula-fix.ts`, run once then
  deleted. Two e2e tests broke as a direct, expected consequence of real
  roster/salary data actually being correct now: `free-agency.spec.ts`'s
  "$2,000,000 is always legal" assumption only ever worked because a
  wrongly-thin Boston Celtics roster happened to have free cap space -
  fixed to use the real always-legal minimum-contract threshold
  ($1,157,000, `emptyRosterChargeCents` for season 2023) instead;
  `trade-execution.spec.ts`'s Tatum-for-Julius-Randle trade (Randle was
  never really on the Nets - the same team-misattribution bug fixed
  above) needed a new pairing, which turned out to require checking both
  real salary-matching AND the Phase 11c/11d trade-AI's acceptance
  verdict across multiple randomly-assigned GM personalities (probed live
  via a throwaway script across several fresh random leagues before
  settling on Payton Pritchard for Lonnie Walker IV, verified to pass 5/5
  repeat runs). Also fixed an unrelated flake during verification: a
  stray `npm run dev` process left running from manual data-probing was
  being reused by Playwright's `reuseExistingServer` webServer config
  instead of a clean production build, causing a real (but
  environment-specific) navigation-timing failure - killing it and
  re-running against a fresh production build resolved it immediately.
  All 342 unit tests, `tsc`, `eslint`, a clean production build, and all
  10 e2e tests passing. **Separately found during verification, and
  explicitly deferred at the user's own direction (not fixed this pass)**:
  ~11,344 `LeaguePlayer` rows (about half of all real-league data, all
  fictional draft-generated prospects from draft year 2024 specifically,
  across all 6 real leagues) are stuck at a broken flat 50/50 rating,
  including actual top-5 picks - other draft years look correctly rated.
  Root cause not yet investigated; likely the original NBA-2K rescale's
  backfill missed fictional draft-generated players. Flagged as a known
  follow-up task, not silently dropped. **Update, same day**: this turned
  out to be the exact same bug fixed below (`createLeagueAction`'s
  unfiltered player pool) - draft year 2024 was disproportionately
  represented because it was most real/test leagues' first-ever draft
  class. No longer deferred; confirmed zero sub-60-rated rows remain in
  any real league after that fix's cleanup.
- **2026-07-22 (later)**: Phase 13a completed (real player headshots +
  `PlayerAvatar` component) - see `docs/ARCHITECTURE.md`'s "Data sourcing"
  section for the full ESPN headshot-resolution pipeline writeup
  (`espnPlayerPhoto.ts`, `resolve-player-photos.ts`, 468/497 real players
  resolved). `PlayerAvatar.tsx` renders the photo with a graceful
  `onError` fallback to an initials-on-gradient placeholder (team-tinted
  when a team color is available), wired into every current player-display
  surface: the team dashboard roster, free-agent board and signing page,
  `TradeBuilder`'s roster columns, offseason awards/retirements, league
  history awards/retirees, team-browse rosters, and the player detail
  page header. Found and fixed a real gap in the test setup while writing
  `PlayerAvatar.test.tsx` (this app's first component test): `vitest.config.ts`
  doesn't set `test.globals: true`, so React Testing Library's own
  auto-cleanup (which looks for a global `afterEach`) never registered -
  every test's render was leaking into the next, corrupting later
  assertions. Fixed once, project-wide, in `vitest.setup.ts` rather than
  per-test. 6 new `PlayerAvatar` tests (348 total - the resolver's own 9
  tests were already counted in the 342 baseline from the rating-formula
  fix above, written earlier in this same pass). All `tsc`, `eslint`, a clean
  production build (including the statically-generated `/teams/[abbreviation]`
  pages), and all 10 e2e tests passing; visually verified real ESPN
  headshots actually decode in a live browser (not just curl) across the
  dashboard roster, free-agent board, and team-browse page.
- **2026-07-22 (later)**: Found and fixed a serious, actively-worsening
  bug while doing Phase 13a's visual verification - a fresh league's
  free-agent board showed "6387 unsigned players" instead of a plausible
  ~100-250. Root cause: `createLeagueAction` bootstrapped a new league
  from `prisma.player.findMany()` with **no filter at all** - every
  fictional draft-generated prospect ever created by _any_ league
  (`draftProspectsToTeams` creates a real, permanent `Player` row for
  every generated rookie, with no per-league scoping and no cleanup when
  a league is later deleted) leaked into every subsequent new league's
  free-agent pool, each showing a broken flat 50 rating (no real stats to
  compute one from). This wasn't just a test-data artifact - direct
  inspection of the user's own 5 real leagues showed the pollution
  monotonically worsening over time (Boston Celtics, the oldest, was
  clean at 497 total players; the newest, Brooklyn Nets, had 6,649,
  6,267 of them broken free agents). Fixed with a one-line
  `externalId: { not: null }` filter (`src/lib/actions/league.ts`) so
  bootstrap only ever pulls the real 497-player pool; fictional prospects
  still enter a league normally, just through that league's own draft.
  Cleaned up the existing damage: deleted 85,948 already-polluted
  `LeaguePlayer` rows across all 16 leagues in the database (real and
  leftover test) and 6,075 fully-orphaned fictional `Player` rows (zero
  remaining references anywhere, safe to remove), followed by
  `VACUUM FULL`. All 5 real leagues now show sane free-agent counts
  (77-251). All 348 unit tests, `tsc`, `eslint`, a clean production
  build, and all 10 e2e tests passing; visually re-verified a fresh
  league now shows a plausible free-agent count (115) with real
  headshots still rendering correctly.
- **2026-07-22 (later)**: Phase 13b completed - the clickable player
  profile drawer. `PlayerProfileProvider` (mounted once in the root
  layout) holds which player is open and renders a slide-out drawer via
  `createPortal`, overlaying whatever page is mounted without ever
  unmounting it - a profile can open mid-trade-build without losing any
  in-progress selection, with no Next.js parallel/intercepting routes
  needed. `PlayerChip` (avatar + name, replacing the plain `PlayerAvatar`
  from 13a) is the one reusable clickable element, wired into all 5
  read-only display surfaces (dashboard roster, free-agent board,
  offseason awards/retirements, league history awards/retirees,
  team-browse). `src/lib/players/profileData.ts`'s two loaders
  (`loadLeaguePlayerProfile`/`loadReferencePlayerProfile`) produce one
  shared `PlayerProfileData` shape regardless of identity, rendered by a
  single tabbed `PlayerProfileContent` (Overview/Ratings/Stats/Contract/
  Career/Awards/Injuries, reusing `DraftExperience`'s pill-tab visual
  language). `/players/[id]` was rebuilt on the exact same loader/content
  as a plain fallback for direct links - nothing in the app links to it
  anymore, since every in-app click now opens the drawer instead.
  `getPlayerProfileAction` never redirects on failure (unlike most actions
  here), since it's called from an overlay that might sit on top of
  in-progress work. Found and fixed a real `react-hooks/set-state-in-effect`
  lint violation while building the data-fetching effect (synchronous
  `setState` calls at the top of an effect on identity change) - fixed by
  keying an inner `PlayerProfileDrawerBody` on the player identity so a
  fresh mount naturally starts at `loading`, rather than manually
  resetting state inside the effect. Updated `teams-navigation.spec.ts`
  for the new drawer-based interaction (clicking a player no longer
  navigates to a new page - a real, intentional UX change, not a test
  artifact). All 348 unit tests, `tsc`, `eslint`, a clean production
  build, and all 10 e2e tests passing; visually verified the drawer opens
  identically from 3 different origin pages (dashboard roster, free
  agents, team-browse) with real data, tab-switching works, and all three
  close mechanisms (Escape, backdrop click, X button) work. Next up:
  **13c (TradeBuilder integration, draft-board avatar polish, docs)** -
  the last piece of Phase 13.
- **2026-07-22 (later still)**: Phase 13c completed - the last piece of
  Phase 13. `PlayerChip` is now wired into `TradeBuilder`'s roster rows,
  which required a real interaction fix rather than just dropping the
  component in: the row's `<label>` previously forwarded any click
  (including on the player's name) to the selection checkbox, so a naive
  swap would have made clicking a name both open the profile drawer and
  toggle trade selection at once. Fixed by replacing the `<label>` with a
  plain row `div` whose own `onClick` toggles selection, with
  `e.stopPropagation()` on the checkbox and the `PlayerChip` wrapper so
  each consumes its own click first - clicking the avatar/name opens the
  profile only, clicking anywhere else on the row (or the checkbox)
  toggles selection only. `teams-navigation.spec.ts`'s sibling,
  `trade-execution.spec.ts`, was updated to select players via the
  checkbox's new `aria-label` (`Select {name} for this trade`) instead of
  clicking the name text, since the name now opens the profile instead.
  `DraftExperience`'s picker, live draft board, and scouting board all
  gained a `PlayerAvatar` next to every prospect's name (always
  `photoUrl={null}`, since `DraftProspect` is a fictional record with no
  real photo) for visual consistency - deliberately cosmetic only, not a
  profile link, since fictional prospects have no real-world identity for
  a profile to describe. All 348 unit tests, `tsc`, `eslint`, a clean
  production build, and all 10 e2e tests passing (including the updated
  `trade-execution.spec.ts`); visually verified via a throwaway script
  that opening a player's profile mid-trade-build leaves every current
  checkbox selection untouched underneath, and that closing the drawer
  (Escape) returns to the exact same trade in progress. Phase 13 (reusable
  player component, profile drawer, consistent access everywhere) is now
  fully complete.
- **2026-07-22 (Phase 14a)**: Player box-score simulation engine - a new
  foundation, not a news feature. Added `PlayerGameStat` (new Prisma
  model) and `src/lib/simulation/boxScore.ts`, generating a lightweight
  (not possession-by-possession) individual stat line for every player in
  every simulated regular-season game: minutes allocation (starting five
  by position with positionless backfill, ranked bench capped at 12,
  blowout-aware garbage-time minute shifts), per-36 rate priors (real
  players scaled by how far their current rating has drifted from what
  `deriveOverallRating` would compute fresh from their frozen real stat
  line today; fictional players from a hand-authored per-position
  archetype table anchored at the same rating-72 point `playerValue.ts`
  uses), asymmetric hot/cold variance (hits shot volume harder than
  efficiency), and reconciliation of every player's points to the team's
  already-decided final score (attempts floored during rescale so the
  residual is almost always solvable via free throws alone). Explicit,
  documented boundaries for this phase: no fatigue/back-to-back modeling
  (the schedule has no real calendar concept to hang it on), box scores
  don't yet feed back into rating/development, and play-in/playoff games
  don't generate box scores yet (only `simulateGamesAction`'s regular-
  season pipeline does). `computeLeagueTeamStrengths` was extended to
  fetch full roster detail in the same query it already ran, avoiding a
  second round trip; the two other call sites (`competitiveness.ts`,
  `playoffs.ts`) and a test-fixture script (`e2e-fast-forward-season.ts`)
  were updated for the new return shape. First visible surface: the
  player profile drawer's Stats tab now shows a live "This league"
  season average and recent-game log from real simulated games, sitting
  above the existing frozen real-2023-24 baseline. All 359 unit tests
  (11 new for the box-score engine: determinism, exact point
  reconciliation, no impossible stat lines, believable team rebound/
  assist bands, minutes summing to exactly 240, a high-rated player
  clearly outproducing deep bench), `tsc`, `eslint`, a clean production
  build, and all 10 e2e tests passing (exercising the real engine live,
  not mocked); visually verified by actually simulating games in a real
  league and opening both a star's and a bench player's profile - real,
  differentiated stat lines tied to rating, realistic minutes, a
  real-world-baseline comparison sitting right below. Next up: **14b**
  (season aggregation, league leaders, milestone/record detection), then
  **14c** (real award races - DPOY/6MOY/COY-adjacent categories that were
  previously excluded for lacking exactly this data), then **14d**
  (incremental news-system migration onto real events) and **14e** (News
  page filtering/search redesign) - see the approved Phase 14 plan for
  the full roadmap.
- **2026-07-22 (Phase 14b)**: Season aggregation, league leaders, and
  milestone detection - all built directly on Phase 14a's real box-score
  data, no separate approximation system. Added `PlayerGameStat.leagueId`
  (denormalized from `Game`, migrated in with a join-backfill through
  `LeaguePlayer` for the ~11k rows Phase 14a had already generated) once
  it was clear every league-scoped stats query needs it directly rather
  than a subquery through `LeaguePlayer`. `src/lib/stats/leagueLeaders.ts`
  computes every category (PPG/RPG/APG/SPG/BPG/FG%/3P%) from a single
  `groupBy` query, with a minimum-games threshold for per-game categories
  and a minimum-attempts threshold for percentage categories, so small
  samples can't fluke their way to the top - surfaced at a new
  `/leagues/[id]/leaders` page, added to the dashboard's nav row.
  `src/lib/stats/milestones.ts` adds pure, unit-tested detection
  functions (`isDoubleDouble`/`isTripleDouble`, `scoringMilestone` for
  40/50/60-point games, `computeCareerHighs`) decoupled from Prisma's
  shape, deliberately reusable by the news system later rather than
  display-only helpers. Surfaced today in the player profile drawer: a
  "Career highs (this league)" box, and a triple-double/scoring-milestone
  badge inline on any recent game that earned one. All 368 unit tests (9
  new for milestone detection), `tsc`, `eslint`, a clean production
  build, and all 10 e2e tests passing; visually verified by simulating a
  real batch of games and confirming the leaders page shows real,
  differentiated players per category with real photos, and that a
  league's actual scoring leader's profile showed a real 45-point game
  correctly flagged with a "40-point game" badge and reflected in their
  career highs. Next up: **14c** (real award races, unblocked now that
  DPOY/6MOY have the box-score/bench-usage data they were previously
  missing), then **14d** (news) and **14e** (News page redesign).
- **2026-07-22 (Phase 14c)**: Defensive Player of the Year and Sixth Man
  of the Year become real, computed awards - `seasonAwards.ts` used to
  exclude both outright for lacking individual defensive/bench-usage
  data; that's no longer true now that Phase 14a/14b's box scores exist.
  MVP/ROY/MIP are untouched. `computeDefensivePlayerOfTheYear` uses
  per-36 steals/blocks/rebounds (the only defensive stats this engine
  tracks - an honestly narrow slice, not a full defensive rating), gated
  by a games-played minimum. `computeSixthManOfTheYear` reuses
  `computePerformanceScore` (the same tested composite the valuation
  model already uses) fed real simulated season averages, gated by games
  played and an average-minutes ceiling standing in for a starter/bench
  flag the engine doesn't persist. Wired into `advanceSeasonAction` via
  one `groupBy` over `PlayerGameStat`, including a real true-shooting%
  calculation from actual season sums (not an approximation). Also added
  a live "Award race - if the season ended today" section
  (`src/lib/stats/awardRace.ts`) to the leaders page - the same award
  functions, fed in-progress aggregates instead of final ones; MIP is
  deliberately left out of the live race since rating only changes at a
  season transition in this engine, so there's no meaningful in-season
  signal to show. Found and fixed a real, unrelated e2e fragility along
  the way: `free-agency.spec.ts` extracted a signed player's name via
  `.textContent()` on a table cell that's contained a `PlayerChip` since
  Phase 13b - when that player has no real photo, the avatar's initials
  fallback and the name concatenate (e.g. "DNDaishen Nix"); fixed by
  targeting the name's own `<span>`, same pattern already used elsewhere.
  All 376 unit tests (8 new, for the two new award functions), `tsc`,
  `eslint`, a clean production build, and all 10 e2e tests passing;
  visually verified
  the live award race mid-season (real, differentiated leaders per
  category, appropriately empty for DPOY/6MOY on a still-small sample)
  and a real completed season's award panel (MVP/ROY/MIP rendering
  correctly; DPOY/6MOY correctly absent rather than faked, since this
  particular test league's real box-score-tracked games - as opposed to
  the DB-speed-fast-forwarded remainder - never gave any player the 10
  games these awards require, exactly the guard working as intended).
  Next up: **14d** (news system, migrated onto real events incrementally)
  and **14e** (News page filtering/search redesign).
- **2026-07-22 (Phase 14d)**: News system grown onto real simulated
  events, extending `LeagueTransaction` per explicit direction rather
  than replacing it - every category still corresponds to something that
  actually happened, never invented; coaching/extensions/waivers/buyouts
  stay entirely out of scope since those mechanics don't exist yet. Added
  `NewsImportance` (MINOR/STANDARD/MAJOR/BREAKING), reusing
  `getPlayerValueTier`'s existing rating boundaries
  (`src/lib/transactions/newsImportance.ts`) rather than a second
  threshold system, and retrofitted it onto every existing category
  (trades by the highest-tier player involved, signings/retirements by
  rating, injuries by duration - the only real severity signal that roll
  produces) - not just the new ones. Three new real categories
  (`src/lib/transactions/describeGameEvents.ts`, pure and unit-tested):
  `GAME_MILESTONE` reuses Phase 14b's own triple-double/scoring-milestone
  detectors directly; `WIN_STREAK` reads a new `LeagueTeam.currentStreak`
  counter and fires only on the exact game a threshold (5, 10, every 5
  beyond) is first crossed; `GAME_RESULT` covers upsets/blowouts,
  calibrated against `simulateGame.ts`'s own real 3-22 margin range. Found
  and fixed a real problem only visible by actually running it: the first
  version generated a story for every game clearing a threshold, which
  flooded the feed once tested against a real multi-batch season (a large
  share of games naturally clear a "notable" bar at real-data scale) -
  fixed by ranking each batch's candidates by how extreme they were and
  keeping only the most notable few, scaling with batch size, the same
  principle real sports coverage follows. News page gained badges for the
  3 new categories plus a colored left border for MAJOR/BREAKING stories.
  Also found and fixed a real, unrelated e2e fragility along the way
  (`free-agency.spec.ts`'s player-name extraction colliding with a
  `PlayerChip` avatar's initials fallback). All 397 unit tests (21 new:
  5 for `newsImportance`, 16 for `describeGameEvents`), `tsc`, `eslint`, a
  clean production build, and all 10 e2e tests passing; visually verified
  across two passes - the first surfaced the flooding problem directly
  (an 11,595px-tall feed from one multi-batch season), the second (after
  the capping fix) showed a proportionate, varied, real feed: injuries,
  retirements, milestone games with badges, win streaks, and game results,
  each with correct importance-based styling. Last step of Phase 14:
  **14e** (News page filtering/search redesign - category/team/search UI
  on top of the real feed this phase built).
- **2026-07-22 (Phase 14e)**: News page filtering/search - the last piece
  of the original ask. Added `LeagueTransaction.teamIds` (a Postgres
  `String[]`, populated at every write site across `trade.ts`,
  `freeagency.ts`, `leagueEvents.ts`, `offseason.ts`, `simulation.ts` -
  existing rows default to empty, same forward-only backfill precedent as
  the rest of Phase 14), which is what makes a real "My Team" filter
  possible for the first time - team association previously only existed
  as unstructured text inside `description`. Added a real `AWARD`
  category: `advanceSeasonAction` now announces each season-end award
  (MVP/ROY/MIP/DPOY/6MOY) as a `LeagueTransaction`, built from the exact
  `awardRows` already computed and persisted in Phase 14c - not a new
  computation. New `NewsFeed` client component
  (`src/components/news/NewsFeed.tsx`) filters the server-fetched,
  already-capped list entirely in memory - category pills (All, My Team,
  Trades, Free Agency, Retirements, Injuries, Awards, Milestones,
  Streaks, Games, Ownership), all combined with AND logic, same
  "filter a preloaded list" convention `DraftExperience` already
  established. The category set deliberately reflects only what has real
  backing - Coaching, Contracts-as-a-mechanic, Rumors, Draft, and
  Standings/Records-as-distinct-story-types stay absent, consistent with
  the "no fictional events" instruction this whole Phase 14 arc has
  followed. All 397 unit tests (unchanged - this phase is UI/wiring, no
  new pure logic requiring its own tests beyond what 14b-14d already
  covers), `tsc`, `eslint`, a clean production build, and all 10 e2e tests
  passing; visually verified category filtering (pill active-state
  toggling confirmed via direct class assertion, not just eyeballing
  screenshots, after an early throwaway script gave a misleading result
  from its own locator mistake), "My Team" correctly isolating only
  Celtics-involving stories, and live text search correctly narrowing to
  matching descriptions. **Phase 14 (the full "living league" arc - real
  player box scores, league leaders, real award races, and a real,
  filterable news feed) is now complete.**
- **2026-07-22 (Phase 15a)**: Staff management foundation - not a
  `FEATURE_ROADMAP.md`-tracked item, a fresh user request for a coaching/
  front-office staff system. Preceded by a full architecture-overlap
  review (per the user's new standing review protocol) that scoped a
  10+-role, real-world-data, multi-decade request down to three roles for
  this phase - Head Coach, Player Development Coach, Medical Staff - with
  algorithmic (not real-world) generation and no hireable GM role, since
  the user already occupies that seat (see `jobSecurity.ts`). New
  `Staff`/`StaffContract` models and `StaffRole`/`CoachStyle` enums;
  `src/lib/staff/generateStaff.ts` for seeded algorithmic generation
  (reusing `generateProspectName`); three real mechanical hooks (Head
  Coach → win-probability bonus + box-score style/bench-trust modifiers,
  Player Development Coach → `developPlayerRating`'s growth/decline rates,
  Medical Staff → injury frequency/duration), each neutral at quality 72 or
  when unhired so an existing league's simulation is unaffected until the
  user actually hires someone; full season progression (aging, retirement,
  contract expiry, Head Coach reputation drift off team win%, CPU
  auto-backfill of vacancies) wired into `advanceSeasonAction` on its own
  seeded RNG stream; `hireStaffAction`/`fireStaffAction` re-validating
  against current DB state and a minimum-acceptable-offer floor; a new
  `/leagues/[id]/staff` page (three role sections, current-hire cards with
  Fire, vacant-slot candidate browsing with Hire); two new `STAFF_HIRE`/
  `STAFF_FIRE` news types, which also required adding a `STAFF` filter
  category to `NewsFeed` (the one category mapping to two
  `TransactionType`s, not one) - a real polish gap caught during hands-on
  verification, not part of the original plan. All 428 unit tests (31
  new), `tsc`, `eslint`, a clean production build, and all 10 e2e tests
  passing. Visually verified across two throwaway scripts: hiring, firing,
  and re-hiring on a fresh league (all three roles start staffed;
  firing/hiring correctly moved candidates between the roster card and the
  browsable pool); and a full season advance (Head Coach aged and its
  reputation drifted with team win%, a CPU team's vacancy was
  auto-backfilled, and the resulting `STAFF_HIRE` story showed up under
  the new Staff filter with a proper badge). **Known cosmetic limitation**:
  staff names are drawn from the same finite prospect-name pool players
  use, so two unrelated staff members can coincidentally share a full name
  within one league - surfaced once during verification, harmless (still
  distinct rows) but not visually ideal. **Deliberately deferred**: Scouts,
  Analytics Staff, and a Salary Cap Specialist (needs a design decision
  against `GmPersonality` first), a Coach of the Year award, real-world
  coach/executive names, and CPU-vs-CPU competitive bidding for a specific
  candidate.
- **2026-07-22 (Phase 15b)**: Coach of the Year award - the one item from
  Phase 15a's deferred list picked up immediately after, per a short
  overlap check: `SeasonAward.leaguePlayerId` is a required, non-nullable
  FK to `LeaguePlayer`, so a coach winner can't be represented there
  without turning every existing award query/render/news site into a
  "check which FK is set" branch. Added a separate `StaffAward` model/
  `StaffAwardCategory` enum instead - the same separate-model precedent
  Phase 15a set for `Staff`/`StaffContract` vs. `LeaguePlayer`/`Contract`.
  New `src/lib/staff/coachOfTheYear.ts` (`computeCoachOfTheYear`, a pure
  function mirroring `computeMVP`'s shape) determines the winner from
  team win% (ties broken by coach quality) - the only universal,
  all-30-teams signal available, since `SeasonExpectation` is
  user-team-only. Wired into `advanceSeasonAction` reusing the
  already-computed `teamWinPctById` and already-fetched `allStaff` (no new
  queries); persisted via `prisma.staffAward.create` and announced through
  the existing generic `AWARD` transaction type (not a new `STAFF_`-
  prefixed one, since this is thematically an award, not a roster move).
  Displayed on both the Offseason page and League History alongside the
  player awards, using `PlayerAvatar` with `photoUrl={null}` instead of
  `PlayerChip` since coaches aren't `LeaguePlayer`s. All 431 unit tests (3
  new), `tsc`, `eslint`, a clean production build, and all 10 e2e tests
  passing.
- **2026-07-22 (Fan Engagement)**: Not a `FEATURE_ROADMAP.md`-tracked item
  - a fresh, extensive user request (full text preserved in
    `docs/FEATURE_REQUESTS.md`). Preceded by an architecture-overlap review
    the user explicitly agreed with: built as a consumer of existing
    simulation events, not a second event-generation system. New
    `LeagueTeam.fanHappiness` (0-100, own model, reuses `evaluateSeason`'s
    verdict for the user's team / plain win% for CPU teams - same split as
    Head Coach reputation drift - so a rebuilding fanbase reads a modest
    record as patient while a contender's identical record reads as a
    letdown, for free, via the existing `ExpectationLevel` system); new
    `Team.marketSize` (real, sourced classification, all 30 teams); new
    `FanHappinessSnapshot` (one row per team per season, powers a multi-
    season trend graph - first use of the already-installed `recharts`
    dependency for a line chart, following `RosterScatterChart.tsx`'s
    client-component/literal-hex-color conventions). Fan reactions
    (`src/lib/fans/transactionSentiment.ts`, `src/lib/fans/fanReactions.ts`)
    read the exact same `LeagueTransaction` rows `NewsFeed` already
    surfaces - no new event capture; reaction commentary is deliberately
    conservative tone-based templates (POSITIVE/NEUTRAL/NEGATIVE), not
    persistent fan personas, per the user's own explicit scoping. Per the
    user's instruction that presentational metrics should still exist for
    immersion without being fabricated: `franchisePopularity`/
    `attendancePct` are the only two derived numbers actually stored;
    Merchandise Popularity/Season Ticket Demand/Social Media Buzz are UI-
    side tier labels off the same underlying number, not independently
    tracked state. Added an optional `fanHappiness` parameter to
    `computeConfidenceDelta` (`src/lib/gm/seasonEvaluation.ts`) - a small
    nudge to owner confidence, not a cap-space mechanic, since real NBA cap
    rules are uniform league-wide regardless of team revenue. New
    `/leagues/[id]/fans` Fan Hub page. All 457 unit tests (27 new), `tsc`,
    `eslint` passing.
- **2026-07-22 (Phase 16, item #40 All-Star Weekend)**: A fresh, extensive
  user request (full text preserved in `docs/FEATURE_REQUESTS.md`),
  explicitly invoking the architecture-overlap-review protocol. Agreed
  overlap findings: a new parallel `AllStarSelection`/
  `AllStarEventParticipant`/`AllStarGame`/`AllStarGameStat` model set
  rather than retrofitting `SeasonAward` (one-winner-per-category) or
  `Game`/`PlayerGameStat` (require real `LeagueTeam` FKs); a genuine new
  mid-season checkpoint inside `simulateGamesAction`'s chunk loop (nothing
  like it existed); no persisted "dunk ability" attribute (none exists,
  none invented). Selection (`src/lib/allstar/selection.ts`) is driven by
  real simulated season performance via the same `computePerformanceScore`
  the valuation model uses, with `overallRating` blended in only as a
  small reputation nudge - so an elite player's poor season can miss out
  while a breakout player's great one gets in. Rising Stars, the
  Three-Point Contest, and the Slam Dunk Contest each got their own pure
  module under `src/lib/allstar/`; the Dunk Contest explicitly uses a
  synthetic, non-persisted "dunk appeal" composite rather than fabricating
  a real attribute. The All-Star Game and Rising Stars game both reuse the
  existing `simulateGame`/`generateBoxScore` engine via a synthetic
  "exhibition" `CoachModifier` - the same hook Head Coach effects already
  added - not a second basketball simulation. Per the user's explicit
  instruction, `simulateGamesAction` now genuinely stops (even mid-batch)
  once the user's team reaches 41 games played, generates the whole
  weekend synchronously, and stays blocked until
  `resolveAllStarWeekendAction` is called from the new
  `/leagues/[id]/all-star` page. News (roster reveals/first-timers/snubs/
  contest results/ASG MVP), fan engagement sentiment/reactions, player
  profile career honors, and League History all consume the same real
  generated data rather than detecting events independently. All 491 unit
  tests (32 new), `tsc`, `eslint` passing.
- **2026-07-23 (Phase 17, items #28/#29 Depth Chart + Rotation Management,
  #33 Player Roles as a byproduct)**: A fresh, extensive user request (full
  text preserved in `docs/FEATURE_REQUESTS.md`), explicitly invoking the
  architecture-overlap-review protocol before any implementation. Key
  finding: `boxScore.ts` already had a fully-automatic rotation engine
  (`buildRotation`/`allocateMinutes`) - the right move was letting a
  user's depth chart override that engine's own ranking/weights, not
  building a second one. Two nullable fields added directly to
  `LeaguePlayer` (`rotationSlot`, `targetMinutesPerGame`) rather than a new
  model, mirroring the `injuryStatus` precedent - `null` on both is
  exactly today's behavior, so every existing save and every CPU team
  (which never gets custom values) keeps working unchanged forever. New
  `src/lib/rotation/` holds the pure resolution logic
  (`resolveRotation.ts`, byte-identical to the old automatic behavior
  when nothing is customized - verified by a dedicated equivalence test)
  and a new `computeRotationAdjustedStrength` used only inside
  `computeLeagueTeamStrengths` (the one function feeding real per-game win
  probability and opponent-strength adjustment) - explicitly kept separate
  from `computeTeamStrength`, which stays untouched everywhere it already
  evaluates roster _talent_ (`SeasonExpectation` seeding, All-Star
  Weekend's exhibition squads), per the user's own instruction not to let
  a shared function change unrelated mechanics. A real, hard-caught bug
  during implementation: a user's absolute `targetMinutesPerGame` was
  initially fed into the same weight-normalization pool as the engine's
  own small relative rank weights, letting one custom player's raw minute
  count overwhelm everyone else's share - fixed with an explicit
  weight-per-minute conversion constant derived from the existing weight
  curve. Player development (`developPlayerRating`) now takes real
  per-season minutes as an optional modest nudge, same neutral-anchor
  pattern as the existing dev-coach-quality bonus. Rotation changes that
  cross the starter/bench boundary generate a `ROTATION_CHANGE` news story
  (not every minutes tweak), wired into fan engagement sentiment the same
  way every other transaction type already is. New `/leagues/[id]/rotation`
  page with `@dnd-kit` drag-and-drop reordering (a new dependency - none
  existed before), a running minutes total with a clear proportional-
  scaling warning when unbalanced, and an "Auto-balance minutes" action
  the user specifically asked for during plan review. Hands-on
  verification confirmed the full pipeline works end-to-end: promoting a
  bench player via drag-and-drop and assigning them real minutes visibly
  and dramatically changed their actual simulated box-score production
  over real games. All 512 unit tests (24 new), `tsc`, `eslint`, a clean
  production build, and all 10 e2e tests passing.
