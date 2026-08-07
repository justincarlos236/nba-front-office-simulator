# Deep Dive 09 — The Database Schema (table by table)

File: `prisma/schema.prisma` (~1,300 lines, ~40 models). This documents every table:
its purpose, key fields, relationships, and the design decision behind it. The **three
tiers** are the organizing idea (handbook 02 has the conceptual version; this is the
field-level one).

The generator + datasource header:

```prisma
generator client { provider = "prisma-client"; output = "../src/generated/prisma" }
datasource db    { provider = "postgresql" }
```

That `output` path is why the app imports from `@/generated/prisma/client`, not
`@prisma/client`.

---

# Tier 1 — Auth & account

### `User`

```prisma
model User {
  id String @id @default(cuid())
  email String? @unique
  passwordHash String?           // bcrypt hash, never plaintext
  gmReputation Int @default(50)  // GM Career Mode: persists ACROSS every league
  accounts Account[]; sessions Session[]; leagues League[]; careerRecords CareerRecord[]
}
```

The account. `gmReputation` lives here (not on a league) precisely because it's meant to
carry across saves. Starts neutral at 50.

### `CareerRecord`

A **permanent snapshot of one ended GM tenure** (fired/retired), written once when a
league ends. Key fields: `seasons`, `wins/losses`, `championships`, `playoffAppearances`,
`bestPlayoffFinish`, `careerEarningsCents` (BigInt), `endReason`, `reputationDelta`.
**Why it exists:** deleting a league is a hard cascading delete, so this is the _only_
durable record of a franchise's history afterward — note `leagueId` is nullable with
`onDelete: SetNull`, so deleting the league later drops the back-link but never destroys
the record.

### `Account`, `Session`, `VerificationToken`

Standard Auth.js adapter tables (OAuth tokens, sessions, email-verification). Managed by
`@auth/prisma-adapter`; you rarely touch them directly.

---

# Tier 2 — Reference data (the real NBA, one shared copy)

The header comment says it plainly: _"a real-world NBA snapshot, seeded once and shared by
every league. Leagues never mutate these rows directly."_

### `Team`

The 30 franchises: `abbreviation @unique`, `city`, `conference`, `division`, colors,
`logoUrl`, `marketSize` (LARGE/MID/SMALL — drives finances/fans). Hardcoded fixture.

### `Player`

A real player's bio: `externalId @unique` (the provider id), `fullName`, `position`,
`birthDate`, `heightInches/weightLbs`, `draft*`, `photoUrl`, `currentTeamId`, and the
imported **`seedOverallRating`/`seedPotentialRating`**. Those two `seed*` columns are the
seed/sim boundary in the schema — set only for the current dataset, read once at league
creation, never again.

### `PlayerSeasonStat`

A real per-season stat line, `@@unique([playerId, season, team])`. Per-game counting
stats + shooting %s + TS% + nullable advanced fields. Feeds both display and the rating
model.

---

# Tier 3 — Per-save league state (the biggest tier)

### `League`

One save. `ownerId`, `userControlledTeamId`, `currentSeason`, `salaryCapOverrideCents?`,
`ownerConfidence Int @default(65)` (the job-security meter), the active ownership
directives (`payrollReductionTargetCents`/`payrollDirectiveSeason`,
`financialMandateSeason`), and `endedAt`/`endReason` (set when fired/retired → the league
becomes permanent read-only). Owns almost everything below via cascade.

### `LeagueTeam` — a team within one save

Holds all the mutable per-save team state:

```prisma
wins/losses Int; currentStreak Int; gmPersonality GmPersonality
fanHappiness Int @default(65)
totalPayrollPaidCents BigInt          // running career earnings, incremented before contracts expire
cashReserveCents BigInt               // can go NEGATIVE (debt); never blocks a legal move
franchiseValueCents BigInt
ticketPricingPosture / facilitiesInvestment / medicalInvestment   // the business levers
@@unique([leagueId, teamId])
```

Its relation block is huge — it's the hub every per-save entity points back to (players,
contracts, games, picks, trades, snapshots, staff). `totalPayrollPaidCents` is tracked
_incrementally_ because once expired `ContractYear` rows are deleted, career earnings
can't be reconstructed (unlike wins/losses, which are reconstructable from `Game` rows).

### `LeaguePlayer` — a player within one save (the mutable copy)

```prisma
overallRating Int; potentialRating Int   // DRIFT over time, independently per league
leagueTeamId String?                       // null = free agent
injuryStatus; injuryReturnsAtGamesPlayed?; careerGamesMissedToInjury
isActive Boolean; retiredSeason?
reSigningTeamId?                           // simplified Bird rights; NOT cleared on contract expiry
rotationSlot? / targetMinutesPerGame?      // the depth chart; reset to null on trade
morale Int @default(70); tradeRequestActive; tradeRequestSince?
joinedTeamSeason?; homegrown Boolean       // franchise-icon inputs (set at draft/trade/bootstrap)
@@unique([leagueId, playerId])
```

This is the model trades/aging/development actually mutate. **Why a copy of `Player`
instead of a pointer:** ratings must diverge per save — developing a player in one league
can't affect him in another.

### `PlayerPersonalityProfile`

The four **immutable** morale axes (`competitiveness`, `roleSensitivity`, `loyalty`,
`financialMotivation`), `leaguePlayerId @unique`. Separate from `LeaguePlayer` for the
same reason `Contract` is — an immutable-once-set trait set vs. mutable per-season state.

### `Contract` + `ContractYear`

```prisma
Contract { leaguePlayerId @unique; leagueTeamId; signedSeason/startSeason/endSeason; noTradeClause; signedUsing ExceptionUsed; years ContractYear[] }
ContractYear { contractId; season; salaryCents BigInt; guaranteedCents BigInt; optionType; @@unique([contractId, season]) }
```

**The key normalization:** one row _per season_ of a deal, because NBA salaries vary
year to year (raises, declines, partial guarantees, options). This is what lets the cap
engine ask "what does this team owe in 2027?" cleanly. `ExceptionUsed` records _how_ a
contract was signed (max, the various MLEs, Bird rights, rookie scale, minimum).

### `Game` + `PlayerGameStat` + `PlayoffSeries`

- `Game` — one scheduled/played game: `season`, `gameNumber`, `dayIndex?` (a
  sequence index, not a real date), `type` (REGULAR_SEASON/PLAY_IN/PLAYOFF),
  `seriesId?`, home/away teams, `homeScore?/awayScore?` (null until simulated).
- `PlayerGameStat` — a per-player line, `@@unique([gameId, leaguePlayerId])`. Note the
  **denormalized** `leagueId/season/gameType/leagueTeamId` copied from `Game` so
  league-wide leader/record queries need no join, and the team is pinned so a later trade
  doesn't rewrite history. No stored `fgPct`/`plusMinus` (percentages derive cheaply;
  plus-minus needs possession data the engine doesn't produce). A DNP gets _no row_ (keeps
  "games played" denominators clean).
- `PlayoffSeries` — round (0 play-in … 4 Finals), `bracketSlot` (fixed single-elim
  bracket: round N+1 slot k = winner of slot 2k vs 2k+1), `winsNeeded @default(4)`, the
  seed teams, running win counts, `winnerTeamId?`.

### Snapshots — `FanHappinessSnapshot`, `FinancialSnapshot`

One row per league+team+season (`@@unique([leagueId, leagueTeamId, season])`). Persist
history so a trend chart is a cheap `SELECT`, not a replay. `FinancialSnapshot` stores the
coarse P&L (five revenue buckets incl. Phase-1 `otherIncomeCents`, six expense buckets
incl. `otherExpenseCents`, three rollups) as BigInt cents — "not a general ledger."

### Finances as a Gameplay Pillar (Phase 1) — `BusinessDecision`, `BusinessLedgerEntry`

`BusinessDecision` is the Front Office Inbox: one row per generated card, with
`options` stored as **`Json`** (an array of `BusinessDecisionOption`) rather than a
normalized options table — the content is frozen at generation time from
`src/lib/finances/businessDecisions.ts`'s catalog, so a later catalog edit never rewrites
a decision a save already saw or resolved. `severity` reuses the existing
`NewsImportance` enum instead of a parallel scale (consume, don't duplicate) —
`BREAKING` severity is what halts `simulateGamesAction`. `status` is `PENDING` →
`RESOLVED` (user picked an option) or `EXPIRED` (deadline passed, the card's own
`defaultOptionId` applied automatically). `BusinessLedgerEntry` is the itemized
in-season accrual that lets a resolved decision's cash effect show up in the P&L
before the season boundary: `amountCents` is always a positive magnitude, `category`
(`EVENT_INCOME`/`EVENT_EXPENSE`) carries the direction — the same "buckets are always
positive, direction comes from which bucket" convention `FinancialSnapshot` already
uses. Rows are permanent history, summed per league+team+season into
`FinancialSnapshot.other{Income,Expense}Cents` at the season boundary, never deleted.

### Awards — `SeasonAward`, `StaffAward`

`SeasonAward` — MVP/ROY/MIP/DPOY/6MOY, `@@unique([leagueId, season, category])`, with a
`value` (the stat it was decided on, kept for the "why"). `StaffAward` — Coach of the
Year. **Why separate models** (not one nullable table): `SeasonAward.leaguePlayerId` is
required with no discriminator, and every call site assumes a player winner.

### Staff — `Staff`, `StaffContract`

`Staff` — HEAD_COACH / PLAYER_DEVELOPMENT_COACH / MEDICAL_STAFF (the three roles with a
real sim effect), `leagueTeamId?` (null = on the market), `quality` (60–99 skill),
`reputation` (drifts with results), `style?` (head coach only). `StaffContract` — a
deliberately _flat_ one-salary deal (no per-year structure; staff salaries don't count
against the player cap). Note: **no hireable "GM" role** — the user _is_ the GM.

### All-Star — `AllStarWeekend`, `AllStarSelection`, `AllStarEventParticipant`, `AllStarGame`, `AllStarGameStat`

`AllStarWeekend` (`@@unique([leagueId, season])`, its `status` is the mid-season checkpoint
that gates further sim). Selections (24+ players — why it's separate from single-winner
awards), the three contests share one `AllStarEventParticipant` model, and the exhibition
`AllStarGame` is deliberately **not** a `Game` row (its "sides" are captain-drafted, not
real `LeagueTeam`s) — it reuses the sim's _pure functions_, not its persistence shape.

### Draft — `DraftPick`, `LotteryResult`, `DraftProspect`, `DraftProspectBookmark`

- `DraftPick` — `round` (1/2), `originalTeamId` + `currentOwnerId` (the ownership split —
  a pick only diverges from its original team once traded), `overallPickNumber?` (null
  until the lottery runs — row existence ≠ draft started), `selectedProspectId? @unique`.
  Exists years ahead for future-pick trading.
- `LotteryResult` — the browsable lottery history (odds + movement), captured before/after
  the draw.
- `DraftProspect` — a (currently generated) prospect: rating/potential + the richer
  scouting bio (height/weight/college/comparison), `leagueId`-scoped.
- `DraftProspectBookmark` — the user's personal draft board.

### Trades — `Trade`, `TradeAsset`, `TradeException`

`Trade` (status + proposer), `TradeAsset` (one thing moving + direction — a player or a
pick), `TradeException` (a real "traded player exception"). `TradeAsset` uses
`RESTRICT` FKs into `LeagueTeam`, which is why `deleteLeagueAction` clears these in explicit
dependency order.

### AI assistant — `AssistantThread`, `AssistantMessage`

Chat threads/messages for the (currently paused) AI GM assistant.

---

## Cross-cutting schema decisions (the interview answers)

- **Reference vs. per-save split** — real data seeded once, copied into `LeagueTeam`/
  `LeaguePlayer`/`Contract` at league creation so saves diverge independently.
- **`BigInt` cents for money** — exactness; every `*Cents` field is integer cents.
- **One-to-many for anything that varies** — `Contract`→`ContractYear` (per-year salary),
  not an array column.
- **Snapshots over recompute** — per-season history rows make trends cheap.
- **Deliberate denormalization** — `PlayerGameStat` copies `leagueId/season/gameType/team`
  to avoid joins on hot leaderboard queries and to pin history against later trades.
- **Separate models over nullable/generalized ones** — Staff/StaffContract,
  StaffAward, All-Star tables are their own models rather than nullable variants of the
  player equivalents, because the player versions assume a required, non-null player.
- **Cascade vs. RESTRICT vs. SetNull** — most children cascade on league delete; a few
  (Contract, DraftPick, TradeException, TradeAsset) are RESTRICT and cleared in order;
  `CareerRecord.leagueId` is SetNull so career history outlives its league.
- **Indexes** — every hot filter (`LeaguePlayer(leagueId, leagueTeamId)`, `Game(leagueId,
season)`, `PlayerGameStat(leaguePlayerId, season)`, `DraftPick(leagueId, season,
overallPickNumber)`) is indexed; unique constraints enforce integrity at the DB level.

## Interview one-liners

- "The schema splits into shared reference data and per-save state; a new league copies the
  reference players into its own mutable `LeaguePlayer`/`Contract` rows so every save has an
  independent timeline."
- "Contracts are normalized one row per season because NBA salaries vary year to year —
  that's what makes exact cap math for any future season possible."
- "Money is BigInt cents everywhere; per-season snapshots make trend charts a cheap select;
  and I denormalize a few fields onto `PlayerGameStat` specifically to keep leaderboard
  queries join-free and trade-proof."
