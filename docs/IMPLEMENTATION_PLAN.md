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

| #   | Feature                               | Status | Priority | Phase  | Depends on   | Notes                                                                                             |
| --- | ------------------------------------- | ------ | -------- | ------ | ------------ | ------------------------------------------------------------------------------------------------- |
| 1   | NBA Trade Machine                     | ✅     | P0       | done   | —            | `/leagues/[id]/trades/new`, 2-team only, players only (no picks)                                  |
| 2   | Realistic Salary Cap Engine           | ✅     | P0       | done   | —            | `src/lib/cap/*`, 39 unit tests, real 2023 CBA aprons/MLE                                          |
| 3   | Full Roster Management                | 🟡     | P0       | done*  | —            | View is complete; no waive/release/lineup management yet                                          |
| 4   | Real NBA Teams and Players            | ✅     | P0       | done   | —            | 30 real teams, 497 real players + 2023-24 stats                                                   |
| 5   | AI GM Assistant                       | ⬜     | P1       | paused | —            | Started, then user explicitly said skip for now — **do not resume unprompted**                    |
| 6   | Player Valuation Model                | ✅     | P0       | done   | —            | `src/lib/valuation/*`, rating + age curve + market value + surplus                                |
| 7   | AI Trade Evaluation                   | ⬜     | P1       | 6      | 21, 22       | Any legal trade currently auto-succeeds regardless of counterparty benefit                        |
| 8   | Franchise / GM Mode                   | 🟡     | P0       | 1,2    | —            | Cap/roster/standings all work now; still no multi-season progression (Phase 3)                    |
| 9   | Team Dashboard                        | 🟡     | P0       | done*  | —            | Cap sheet + roster shown; no transactions/draft picks on it yet                                   |
| 10  | Save and Load Franchises              | ✅     | P0       | done   | —            | Continuous DB persistence; "load" = sign back in                                                  |
| 11  | Free Agency                           | ✅     | P0       | done   | —            | `/leagues/[id]/free-agents`, real signing-mechanism validation                                    |
| 12  | Contract Negotiations                 | 🟡     | P2       | —      | 31           | User sets terms + system validates; no back-and-forth or player preference                        |
| 13  | NBA Draft                             | ⬜     | P1       | 4      | 66,67        | —                                                                                                 |
| 14  | Draft Pick Trading                    | ⬜     | P2       | 4      | 62           | Stepien-lite check exists in `validateTrade` unused - no pick inventory                           |
| 15  | Season Simulation                     | ✅     | P0       | 1      | —            | Batch-simulate 1/10/50 games from `/leagues/[id]/standings`                                       |
| 16  | Game Simulation Engine                | ✅     | P0       | 1      | —            | `src/lib/simulation/simulateGame.ts` — strength-based, not possession-level (documented)          |
| 17  | League Standings                      | ✅     | P0       | 1      | —            | `/leagues/[id]/standings`, conference-sorted, live games-back                                     |
| 18  | NBA Playoffs                          | ✅     | P1       | 2      | 15,16,17     | Play-in + fixed single-elim bracket, `/leagues/[id]/playoffs`, real 2-2-1-1-1 home pattern        |
| 19  | Player Development                    | ⬜     | P1       | 3      | 15           | Ratings are static post-bootstrap today                                                           |
| 20  | Dynamic Player Ratings                | ⬜     | P1       | 3      | 19           | Same root cause as #19                                                                            |
| 21  | Team Direction System                 | ⬜     | P1       | 6      | —            | —                                                                                                 |
| 22  | Team Needs System                     | ⬜     | P1       | 6      | —            | —                                                                                                 |
| 23  | Trade Finder                          | ⬜     | P2       | 6      | 6,21,22      | —                                                                                                 |
| 24  | Three/Multi-Team Trades               | 🟡     | P2       | —      | —            | `validateTrade` supports N teams (tested); `TradeBuilder` UI is 2-team only                       |
| 25  | Trade Grades                          | ⬜     | P2       | 6      | 6            | Legality validation exists; a quality "grade" doesn't                                             |
| 26  | Advanced Player Statistics            | 🟡     | P2       | —      | —            | PPG/RPG/APG/TS%/FG% shown; PER/BPM/usage columns exist but unpopulated (no source)                |
| 27  | Player Comparison Tool                | ⬜     | P1       | 7      | —            | —                                                                                                 |
| 28  | Depth Chart Management                | ⬜     | P2       | 3      | —            | Best paired with sim engine so lineups matter                                                     |
| 29  | Rotation Management                   | ⬜     | P2       | 3      | 28           | —                                                                                                 |
| 30  | Injury System                         | ⬜     | P2       | 3      | 15,16        | `InjuryStatus` enum exists on schema, unused                                                      |
| 31  | Player Morale                         | ⬜     | P2       | 6      | —            | —                                                                                                 |
| 32  | Trade Requests                        | ⬜     | P3       | —      | 31           | —                                                                                                 |
| 33  | Player Roles                          | ⬜     | P3       | —      | —            | —                                                                                                 |
| 34  | Player Potential                      | 🟡     | P1       | 3      | —            | `potentialRating` computed + shown; doesn't drive development yet (see #19)                       |
| 35  | Scouting Reports                      | ⬜     | P3       | —      | —            | —                                                                                                 |
| 36  | League News Feed                      | ⬜     | P2       | 5      | 37           | —                                                                                                 |
| 37  | Transaction History                   | 🟡     | P1       | 5      | —            | `Trade`/`TradeAsset` rows persisted on execution; no viewing UI; signings aren't logged at all    |
| 38  | Player Career History                 | 🔒     | P2       | —      | multi-season | Only one season (2023-24) of stats exists per player                                              |
| 39  | NBA Awards                            | ⬜     | P2       | 3      | 15,19        | —                                                                                                 |
| 40  | All-Star Weekend                      | ⬜     | P3       | —      | 15           | —                                                                                                 |
| 41  | Hall of Fame                          | ⬜     | P3       | —      | 42           | —                                                                                                 |
| 42  | Player Retirement                     | ⬜     | P3       | 3      | 19           | —                                                                                                 |
| 43  | League History                        | ⬜     | P2       | 5      | 15,18,39     | —                                                                                                 |
| 44  | League Records                        | ⬜     | P3       | —      | 43           | —                                                                                                 |
| 45  | Championship History                  | ⬜     | P2       | 5      | 18           | —                                                                                                 |
| 46  | AI General Managers                   | ⬜     | P1       | 6      | 21,22        | —                                                                                                 |
| 47  | GM Personalities                      | ⬜     | P2       | 6      | 46           | —                                                                                                 |
| 48  | AI Trade Negotiations                 | ⬜     | P2       | —      | 46           | —                                                                                                 |
| 49  | AI GM Chat                            | ⬜     | P1       | paused | —            | The explicitly-paused conversational assistant                                                    |
| 50  | Natural-Language Player Search        | ⬜     | P2       | —      | 86           | LLM-flavored - hold pending user re-opening the AI thread                                         |
| 51  | AI Roster Analysis                    | ⬜     | P2       | —      | 6,49         | —                                                                                                 |
| 52  | AI Offseason Plan                     | ⬜     | P3       | —      | 49           | —                                                                                                 |
| 53  | AI Trade Suggestions                  | ⬜     | P2       | —      | 6,49         | —                                                                                                 |
| 54  | AI Trade Explanations                 | ⬜     | P2       | —      | 49           | —                                                                                                 |
| 55  | AI Counteroffers                      | ⬜     | P3       | —      | 48           | —                                                                                                 |
| 56  | Trade Value Visualization             | ⬜     | P2       | 7      | 6            | Values shown as numbers/tables today, no chart                                                    |
| 57  | Championship Probability              | ⬜     | P3       | —      | 15,16        | —                                                                                                 |
| 58  | Playoff Probability                   | ⬜     | P2       | —      | 15,16,17     | —                                                                                                 |
| 59  | Team Power Rankings                   | ⬜     | P2       | 2      | 17           | Natural add-on once standings exist                                                               |
| 60  | Salary Cap Visualization              | ⬜     | P1       | 7      | —            | Cap sheet is text stat cards today, not a chart                                                   |
| 61  | Contract Timeline                     | 🟡     | P2       | 7      | —            | Current-season salary + end year shown; no multi-year visual                                      |
| 62  | Draft Pick Inventory                  | ⬜     | P1       | 4      | —            | Prerequisite for #14, #71, #72, #73                                                               |
| 63  | Roster Strength Analysis              | ⬜     | P2       | 7      | 6            | —                                                                                                 |
| 64  | Player Performance Trends             | 🔒     | P3       | —      | multi-season | Only one season of data exists                                                                    |
| 65  | Team Performance Trends               | 🔒     | P2       | —      | 15,16,17     | Needs games actually being simulated over time                                                    |
| 66  | Draft Lottery                         | ⬜     | P1       | 4      | 17           | Needs standings (worst record = best odds)                                                        |
| 67  | Generated Draft Classes               | ⬜     | P1       | 4      | —            | —                                                                                                 |
| 68  | Prospect Scouting                     | ⬜     | P2       | 4      | 67           | —                                                                                                 |
| 69  | Mock Drafts                           | ⬜     | P2       | 4      | 67, 21/22    | —                                                                                                 |
| 70  | Draft Combine                         | ⬜     | P3       | —      | 67           | —                                                                                                 |
| 71  | Draft-Day Trades                      | ⬜     | P2       | 4      | 1, 62        | —                                                                                                 |
| 72  | Pick Protections                      | ⬜     | P2       | 4      | 62           | `protectionNote` field already exists on `DraftPick`, unused                                      |
| 73  | Pick Swaps                            | ⬜     | P3       | —      | 62           | —                                                                                                 |
| 74  | Multi-Season Simulation               | ⬜     | P1       | 3      | 15,19        | "Advance to next season" mechanic                                                                 |
| 75  | Salary Cap Growth                     | 🟡     | P1       | 3      | 74           | `SEASON_CAP_RULES` has real multi-season figures; nothing advances `currentSeason` yet            |
| 76  | League Evolution                      | ⬜     | P3       | —      | 74           | —                                                                                                 |
| 77  | Expansion Teams                       | ⬜     | P3       | —      | —            | —                                                                                                 |
| 78  | Expansion Draft                       | ⬜     | P3       | —      | 77           | —                                                                                                 |
| 79  | Custom Team Creation                  | ⬜     | P3       | —      | —            | —                                                                                                 |
| 80  | Historical Seasons                    | 🟡     | P3       | —      | —            | Fixed to 2023-24 only; not selectable                                                             |
| 81  | What-If Mode                          | ⬜     | P3       | —      | 79/82        | —                                                                                                 |
| 82  | Custom Rosters                        | ⬜     | P3       | —      | —            | —                                                                                                 |
| 83  | League Settings                       | ⬜     | P2       | 9      | —            | —                                                                                                 |
| 84  | User Authentication                   | ✅     | P0       | done   | —            | Auth.js v5, Credentials, ownership-scoped                                                         |
| 85  | Multiple Franchise Saves              | ⬜     | P1       | 9      | —            | Currently hard-capped to one league per user                                                      |
| 86  | Global Player Search                  | ⬜     | P1       | 8      | —            | —                                                                                                 |
| 87  | Global Team Search                    | ⬜     | P2       | 8      | —            | `/teams` browse exists; no search box                                                             |
| 88  | Advanced Filters                      | ⬜     | P2       | 8      | 86           | —                                                                                                 |
| 89  | Command Palette                       | ⬜     | P2       | 8      | 86,87        | —                                                                                                 |
| 90  | Shareable Trades                      | ⬜     | P3       | —      | 1            | —                                                                                                 |
| 91  | Trade Card Generator                  | ⬜     | P3       | —      | 90           | —                                                                                                 |
| 92  | Beautiful Player Profile Pages        | 🟡     | P2       | 7      | —            | Bio+stats+valuation exist; no photo (field unpopulated), no career history section                |
| 93  | Detailed Team Pages                   | 🟡     | P2       | 7      | —            | Roster+colors+division shown; no payroll chart, draft assets, or transaction history              |
| 94  | Interactive League Dashboard          | 🟡     | P2       | 2      | 17           | Standings page now has recent league-wide results + a playoffs link; still no news/power rankings |
| 95  | Responsive Design                     | 🟡     | P2       | 7      | —            | Some Tailwind responsive classes used; not comprehensively verified across breakpoints            |
| 96  | Dark and Light Mode                   | 🟡     | P3       | —      | —            | Dark theme only, no toggle                                                                        |
| 97  | Interactive Charts and Visualizations | 🟡     | P1       | 7      | —            | One recharts scatter chart exists; cap/trend visualizations don't                                 |
| 98  | Onboarding Tutorial                   | ⬜     | P3       | —      | —            | —                                                                                                 |
| 99  | Achievements                          | ⬜     | P3       | 9      | 100          | —                                                                                                 |
| 100 | GM Career Score                       | ⬜     | P2       | 9      | 6,37         | —                                                                                                 |

\* "done" for #3/#9 means "done to the extent scoped for the MVP" — both
are marked 🟡 above and will deepen further in later phases (roster
management gets waive/depth-chart tools in Phase 3; the dashboard gets a
transaction feed in Phase 5).

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

### Phase 3 — Player Development & Multi-Season Progression

The other big unlock: advancing `League.currentSeason`, applying the
existing age curve to evolve ratings, expiring contracts, and letting the
cap grow season-to-season using the already-defined `SEASON_CAP_RULES`.

- [ ] "Advance to next season" flow (age players, apply development/decline
      using existing `ageValueMultiplier`, expire contracts, roll `currentSeason`)
- [ ] Dynamic ratings that actually change year over year
- [ ] Retirement (age/rating-based)
- [ ] Awards (MVP/DPOY/ROY/etc., computed from that season's stats/results)
- [ ] Depth chart + rotations (minutes distribution feeding team strength)
- [ ] Injuries (using the existing `InjuryStatus` enum)

### Phase 4 — Draft System

Independent cluster; can run in parallel with Phase 2/3 in a future
session if desired.

- [ ] `DraftPick` inventory generation at league bootstrap (currently zero
      picks exist anywhere)
- [ ] Generated draft class (fictional prospects, since a real future draft
      class doesn't exist yet)
- [ ] Draft lottery (needs Phase 1 standings for odds)
- [ ] Draft-day flow (user picks, CPU picks)
- [ ] Pick protections/swaps, draft pick trading (extends `validateTrade`'s
      already-built but unused Stepien-lite check)

### Phase 5 — Transactions, News & League History

Needs Phase 1-4 activity to have real content to show.

- [ ] Transaction history UI (surfacing the `Trade`/`TradeAsset` rows
      already being created, plus logging free-agent signings the same way)
- [ ] League news feed generated from transactions/results
- [ ] Championship/league history once playoffs (Phase 2) produce results

### Phase 6 — AI-Driven CPU Teams & Trade Depth

Note: this is about **CPU team decision-making logic** (should the AI
accept this trade, what does it need), not the conversational assistant —
that one stays paused per the user's explicit instruction until they
reopen it.

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

### Phase 8 — Search & Discovery

- [ ] Global player search
- [ ] Global team search
- [ ] Advanced filters
- [ ] Command palette

### Phase 9 — Multi-Save, Settings & Meta Features

- [ ] Multiple franchise saves per user
- [ ] League settings/configuration
- [ ] GM career score, achievements

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
