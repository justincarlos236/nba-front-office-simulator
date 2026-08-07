# 02 — The Database (Data Model)

The schema lives in one file: `prisma/schema.prisma`. There are ~40 tables. You
don't need to memorize all of them — you need to understand the **three groups**
they fall into and **why** the split exists, plus a handful of key tables.

## The big idea: reference data vs. per-save state

The single most important schema decision is the separation between:

1. **Reference data** — the real NBA world, shared by everyone: the 30 teams, the
   ~537 real players, their real season stats. There's **one copy** in the whole
   database.
2. **Per-save (league) state** — everything specific to one player's game: their
   league, their version of each player (with a rating that changes over time),
   contracts, games played, trades, standings, etc.

**Why:** when you start a new league, the app **copies** the relevant reference
players into per-save `LeaguePlayer` rows. After that, your league evolves on its
own — a player you develop gets better _in your save_ without affecting the real
reference data or anyone else's league. This is the "**seed/sim boundary**": real
data seeds the initial state, then the simulation owns it.

```
Reference (shared, 1 copy)          Per-save (one set per league)
────────────────────────           ─────────────────────────────
Team                                League
Player            ──copied at──►    LeaguePlayer  (evolving rating)
PlayerSeasonStat    league start    Contract → ContractYear
                                    Game, PlayoffSeries, Trade, DraftPick, …
```

## Group 1 — Authentication & account

| Table                                     | Responsibility                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `User`                                    | A person's account: `email`, `name`, `passwordHash` (bcrypt), and their cross-league **`gmReputation`**.                    |
| `Account`, `Session`, `VerificationToken` | Standard Auth.js tables (the adapter manages these).                                                                        |
| `CareerRecord`                            | A permanent snapshot of a finished GM tenure (hired→fired/retired), so your career survives even after a league is deleted. |

**Why `gmReputation` is on `User`, not `League`:** reputation is meant to persist
_across_ leagues (it gates which teams will hire you in a new save). It's a
property of the person, not any single save.

## Group 2 — Reference data (the real NBA)

| Table              | Responsibility                                                                                                                              | Notes                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Team`             | The 30 real franchises: city, conference, division, colors, `marketSize`.                                                                   | Hardcoded fixture — this data never really changes.                                                                             |
| `Player`           | A real player's bio: name, position, height/weight, photo, `currentTeamId`, and the imported **`seedOverallRating`/`seedPotentialRating`**. | `seedOverallRating` is set _only_ for the current dataset — it marks "this row belongs to the roster we seed new leagues from." |
| `PlayerSeasonStat` | A real per-season stat line (points, rebounds, TS%, etc.).                                                                                  | Feeds both the display and the rating model. Unique on `(playerId, season, team)`.                                              |

**Why the `seed*` columns live on `Player`:** they encode the seed/sim boundary
in the schema itself. The bootstrap selects `where seedOverallRating is not null`
to grab exactly the current dataset, and copies that number into the new
`LeaguePlayer`. It's never read again after league creation.

## Group 3 — Per-save league state (the biggest group)

**The spine:**

| Table          | Responsibility                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `League`       | One save. Owner, `currentSeason`, which team the user controls, `ownerConfidence` (job-security meter), active ownership directives/mandates, and `endedAt` (set when fired/retired → league becomes read-only). |
| `LeagueTeam`   | One team _within_ a league. Holds the per-save team state: `fanHappiness`, cash/`franchiseValueCents`, investment/ticket levers, GM personality, `totalPayrollPaidCents`.                                        |
| `LeaguePlayer` | One player _within_ a league. The **evolving** `overallRating`/`potentialRating`, injury status, morale, which `leagueTeamId` they're on (null = free agent), tenure fields.                                     |

**Contracts:**

| Table          | Responsibility                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `Contract`     | A signed deal linking a `LeaguePlayer` to a `LeagueTeam`, with start/end seasons and option types. |
| `ContractYear` | One season of a contract: `salaryCents`, `guaranteedCents`. A contract _has many_ years.           |

**Why contracts are split into `Contract` + `ContractYear`:** NBA salaries differ
_per year_ (raises, declining deals, partial guarantees). Modeling each year as
its own row is what makes the cap engine able to ask "what does this team owe in
2027?" cleanly. This is classic relational normalization — one-to-many instead of
stuffing an array into one column.

**Money is stored as `BigInt` cents.** Every dollar amount (`salaryCents`,
`cashReserveCents`, `franchiseValueCents`…) is an integer number of cents, not a
floating-point dollar value. **Why:** floats can't represent money exactly
(0.1 + 0.2 ≠ 0.3), and cap math must be exact to the dollar. `BigInt` because NBA
salaries in cents exceed the safe integer range of a normal JS number.

**Simulation & competition:**

| Table               | Responsibility                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Game`              | A scheduled/played game: home/away league teams, day index, scores, type (regular/playoff).                      |
| `PlayerGameStat`    | A per-player line for a simulated game (generated approximately from team results).                              |
| `PlayoffSeries`     | A best-of-7 series with its bracket slot and results.                                                            |
| `SeasonAward`       | MVP, DPOY, etc., recorded per season.                                                                            |
| `SeasonExpectation` | What ownership expected this season (drives the job-security evaluation).                                        |
| `LeagueTransaction` | The news feed: every notable event (trade, signing, milestone, financial report) as a typed, describable record. |

**Business & people systems:**

| Table                                       | Responsibility                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `FanHappinessSnapshot`, `FinancialSnapshot` | Per-season history rows so trends can be charted without recomputing.        |
| `PlayerPersonalityProfile`                  | A player's persistent personality (affects morale).                          |
| `Staff`, `StaffContract`, `StaffAward`      | Head coach / development coach / medical staff, their contracts, and awards. |

**Draft:**

| Table                                                     | Responsibility                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DraftPick`                                               | A pick a team owns — _including future picks_, so picks can be traded years in advance. `overallPickNumber` stays null until that draft actually runs. |
| `LotteryResult`, `DraftProspect`, `DraftProspectBookmark` | The lottery outcome, the (currently generated) prospect pool, and the user's saved draft board.                                                        |

**Why future picks are rows from day one:** a huge part of NBA GM strategy is
trading picks 1–7 years out. Creating the pick rows immediately (with a null pick
number) means a traded 2029 first-rounder is just a change of `currentOwnerId` on
an existing row — no special "promise to create a pick later" logic.

**Trades:**

| Table            | Responsibility                                                                        |
| ---------------- | ------------------------------------------------------------------------------------- |
| `Trade`          | A proposed/executed deal, its status, and who proposed it.                            |
| `TradeAsset`     | One thing in a trade (a player or a pick) and which direction it moves.               |
| `TradeException` | A "traded player exception" — a real CBA mechanic letting a team absorb salary later. |

## Relationships in one picture

```
User ─1:N─ League ─1:N─ LeagueTeam ─1:N─ LeaguePlayer ─1:1─ Contract ─1:N─ ContractYear
                    │                         │
                    ├─1:N─ Game               └─(references)─ Player (reference data)
                    ├─1:N─ DraftPick
                    ├─1:N─ Trade ─1:N─ TradeAsset
                    └─1:N─ LeagueTransaction (the news feed)

Team ─1:N─ Player ─1:N─ PlayerSeasonStat        (shared reference world)
```

## Design decisions to be ready to defend

- **Why copy players into `LeaguePlayer` instead of pointing leagues at the shared
  `Player`?** Because ratings and rosters must **diverge per save**. If two leagues
  shared one `Player.overallRating`, developing a player in one save would change
  him in the other. Copying at creation gives each save an independent timeline.
- **Why `BigInt` cents for money?** Exactness — see above.
- **Why snapshots (`FinancialSnapshot`, `FanHappinessSnapshot`) instead of
  recomputing history?** So a multi-season trend chart is a cheap `SELECT`, not a
  replay of every past season.
- **Indexes:** foreign keys used in filters (e.g. `LeaguePlayer.leagueTeamId`,
  `Game`'s day index, `PlayerSeasonStat.playerId`) are indexed so the common
  "load this team's roster / this league's schedule" queries stay fast as data
  grows. Unique constraints (e.g. `User.email`, `PlayerSeasonStat(playerId,
season, team)`) enforce integrity at the database level, not just in code.
- **Cascade deletes:** deleting a league cascades to most children automatically;
  a few (`Contract`, `DraftPick`, `TradeException`, `TradeAsset`) use `RESTRICT`
  and are deleted in explicit dependency order, because a stray cascade there
  could silently destroy trade history mid-operation.
