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
| 1   | NBA Trade Machine                     | ✅     | P0       | done    | —            | `/leagues/[id]/trades/new`, 2-team only, players only (no picks)                                                                                                                |
| 2   | Realistic Salary Cap Engine           | ✅     | P0       | done    | —            | `src/lib/cap/*`, 39 unit tests, real 2023 CBA aprons/MLE                                                                                                                        |
| 3   | Full Roster Management                | 🟡     | P0       | done*   | —            | View is complete; no waive/release/lineup management yet                                                                                                                        |
| 4   | Real NBA Teams and Players            | ✅     | P0       | done    | —            | 30 real teams, 497 real players + 2023-24 stats                                                                                                                                 |
| 5   | AI GM Assistant                       | ⬜     | P1       | paused  | —            | Started, then user explicitly said skip for now — **do not resume unprompted**                                                                                                  |
| 6   | Player Valuation Model                | ✅     | P0       | done    | —            | `src/lib/valuation/*`, rating + age curve + market value + surplus                                                                                                              |
| 7   | AI Trade Evaluation                   | ⬜     | P1       | 6       | 21, 22       | Any legal trade currently auto-succeeds regardless of counterparty benefit                                                                                                      |
| 8   | Franchise / GM Mode                   | ✅     | P0       | 1,2,3,4 | —            | Cap/roster/standings/playoffs/draft/multi-season progression (aging, retirement, awards) all work now                                                                           |
| 9   | Team Dashboard                        | ✅     | P0       | done    | —            | Cap sheet + roster + a "Franchise overview" card row (conference rank, playoff status, draft picks, recent activity, all-time record, free agency)                              |
| 10  | Save and Load Franchises              | ✅     | P0       | done    | —            | Continuous DB persistence; "load" = sign back in                                                                                                                                |
| 11  | Free Agency                           | ✅     | P0       | done    | —            | `/leagues/[id]/free-agents`, real signing-mechanism validation                                                                                                                  |
| 12  | Contract Negotiations                 | 🟡     | P2       | —       | 31           | User sets terms + system validates; no back-and-forth or player preference                                                                                                      |
| 13  | NBA Draft                             | ✅     | P1       | 4       | 66,67        | Interactive `/leagues/[id]/draft` - lottery, 60-pick order, generated class, real rookie contracts                                                                              |
| 14  | Draft Pick Trading                    | ⬜     | P2       | 4       | 62           | Deliberately deferred - pick inventory now exists (Phase 4), but trading it needs `TradeBuilder` UI work not yet done                                                           |
| 15  | Season Simulation                     | ✅     | P0       | 1       | —            | Batch-simulate 1/10/50 games from `/leagues/[id]/standings`                                                                                                                     |
| 16  | Game Simulation Engine                | ✅     | P0       | 1       | —            | `src/lib/simulation/simulateGame.ts` — strength-based, not possession-level (documented)                                                                                        |
| 17  | League Standings                      | ✅     | P0       | 1       | —            | `/leagues/[id]/standings`, conference-sorted, live games-back                                                                                                                   |
| 18  | NBA Playoffs                          | ✅     | P1       | 2       | 15,16,17     | Play-in + fixed single-elim bracket, `/leagues/[id]/playoffs` (real visual bracket, East/West/Finals), real 2-2-1-1-1 home pattern                                              |
| 19  | Player Development                    | ✅     | P1       | 3       | 15           | `developPlayerRating.ts` - age-based growth/decline, applied by `advanceSeasonAction`                                                                                           |
| 20  | Dynamic Player Ratings                | ✅     | P1       | 3       | 19           | Ratings now actually change season-over-season (see #19)                                                                                                                        |
| 21  | Team Direction System                 | ⬜     | P1       | 6       | —            | —                                                                                                                                                                               |
| 22  | Team Needs System                     | ⬜     | P1       | 6       | —            | —                                                                                                                                                                               |
| 23  | Trade Finder                          | ⬜     | P2       | 6       | 6,21,22      | —                                                                                                                                                                               |
| 24  | Three/Multi-Team Trades               | 🟡     | P2       | —       | —            | `validateTrade` supports N teams (tested); `TradeBuilder` UI is 2-team only                                                                                                     |
| 25  | Trade Grades                          | ⬜     | P2       | 6       | 6            | Legality validation exists; a quality "grade" doesn't                                                                                                                           |
| 26  | Advanced Player Statistics            | 🟡     | P2       | —       | —            | PPG/RPG/APG/TS%/FG% shown; PER/BPM/usage columns exist but unpopulated (no source)                                                                                              |
| 27  | Player Comparison Tool                | ⬜     | P1       | 7       | —            | —                                                                                                                                                                               |
| 28  | Depth Chart Management                | ⬜     | P2       | 7       | —            | Deliberately deferred out of Phase 3 - roster micromanagement, not season progression                                                                                           |
| 29  | Rotation Management                   | ⬜     | P2       | 3       | 28           | —                                                                                                                                                                               |
| 30  | Injury System                         | ✅     | P2       | 7       | 15,16        | Fast-tracked out of order: in-season injuries roll as games are simulated, with a real mechanical effect (`InjuryStatus`/strength calc) - see `src/lib/actions/leagueEvents.ts` |
| 31  | Player Morale                         | ⬜     | P2       | 6       | —            | —                                                                                                                                                                               |
| 32  | Trade Requests                        | ⬜     | P3       | —       | 31           | —                                                                                                                                                                               |
| 33  | Player Roles                          | ⬜     | P3       | —       | —            | —                                                                                                                                                                               |
| 34  | Player Potential                      | 🟡     | P1       | 3       | —            | `potentialRating` computed + shown; doesn't drive development yet (see #19)                                                                                                     |
| 35  | Scouting Reports                      | ⬜     | P3       | —       | —            | —                                                                                                                                                                               |
| 36  | League News Feed                      | ✅     | P2       | 5       | 37           | Same `LeagueTransaction` feed as #37, framed as a news wire - `/leagues/[id]/transactions`                                                                                      |
| 37  | Transaction History                   | ✅     | P1       | 5       | —            | `LeagueTransaction` log created on every trade, signing, and retirement; viewable at `/leagues/[id]/transactions`                                                               |
| 38  | Player Career History                 | 🔒     | P2       | —       | multi-season | Only one season (2023-24) of stats exists per player                                                                                                                            |
| 39  | NBA Awards                            | 🟡     | P2       | 3       | 15,19        | MVP/ROY/Most Improved computed and shown; DPOY/Sixth Man/All-Defense deliberately skipped (no defensive stats or depth chart to base them on honestly)                          |
| 40  | All-Star Weekend                      | ⬜     | P3       | —       | 15           | —                                                                                                                                                                               |
| 41  | Hall of Fame                          | ⬜     | P3       | —       | 42           | —                                                                                                                                                                               |
| 42  | Player Retirement                     | ✅     | P3       | 3       | 19           | `retirement.ts` - age/rating-based probability, forced at 41; shown on the offseason recap page                                                                                 |
| 43  | League History                        | ✅     | P2       | 5       | 15,18,39     | `/leagues/[id]/history` - season-by-season champions, awards, retirees                                                                                                          |
| 44  | League Records                        | ⬜     | P3       | —       | 43           | —                                                                                                                                                                               |
| 45  | Championship History                  | ✅     | P2       | 5       | 18           | Past champions shown per-season on `/leagues/[id]/history`                                                                                                                      |
| 46  | AI General Managers                   | 🟡     | P1       | 6       | 21,22        | CPU teams now trade with each other and sign free agents (random-but-cap-legal, fast-tracked - see #30's note); real evaluation logic (#21/#22/#7) still unstarted              |
| 47  | GM Personalities                      | ⬜     | P2       | 6       | 46           | —                                                                                                                                                                               |
| 48  | AI Trade Negotiations                 | ⬜     | P2       | —       | 46           | —                                                                                                                                                                               |
| 49  | AI GM Chat                            | ⬜     | P1       | paused  | —            | The explicitly-paused conversational assistant                                                                                                                                  |
| 50  | Natural-Language Player Search        | ⬜     | P2       | —       | 86           | LLM-flavored - hold pending user re-opening the AI thread                                                                                                                       |
| 51  | AI Roster Analysis                    | ⬜     | P2       | —       | 6,49         | —                                                                                                                                                                               |
| 52  | AI Offseason Plan                     | ⬜     | P3       | —       | 49           | —                                                                                                                                                                               |
| 53  | AI Trade Suggestions                  | ⬜     | P2       | —       | 6,49         | —                                                                                                                                                                               |
| 54  | AI Trade Explanations                 | ⬜     | P2       | —       | 49           | —                                                                                                                                                                               |
| 55  | AI Counteroffers                      | ⬜     | P3       | —       | 48           | —                                                                                                                                                                               |
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
- [ ] **10c - Multi-year cap projections + Financial Flexibility Grade**:
      a future-committed-payroll table (next several seasons) and an A-F
      grade summarizing it.
- [ ] **10d - Owner Confidence, expectations, directives & firing**: the
      big new GM-accountability meta-system - preseason expectations set
      from payroll tier + roster quality, end-of-season evaluation,
      confidence/job-security tracking, ownership directives, and a
      firing _trigger_. Scoped deliberately narrow - what actually
      happens to the save once fired is Phase 11's job.

### Phase 11 — GM Career Mode

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

- **AI GM Assistant (#5, #49)** and the rest of the LLM-flavored cluster
  (#7 is CPU logic, not chat, and stays in Phase 6; #46–48, #50–55 are
  conversational/LLM-dependent and stay deferred) — explicitly paused by
  the user; do not resume without them bringing it back up.
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
  - 246 unit tests passing against a real production build. Next up:
    **10c (multi-year cap projections + Financial Flexibility Grade)**.
