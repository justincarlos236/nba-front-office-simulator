# 06 — Patterns & Idioms (the real "deep knowledge")

These techniques appear _everywhere_. Once you recognize them, you understand the
codebase's "accent" — how it says things. This is the most valuable doc for truly
knowing the code.

## 1. Pure core / imperative shell

Already covered, but the tell is in the **imports**: a pure file imports only other
`lib/` domains; a shell imports `prisma`/`auth`. Everything in `cap/`, `simulation/`,
`valuation/`, etc. is pure and unit-tested; everything in `actions/` is the shell.

## 2. Injected randomness + a seeded PRNG

Pure functions take `rng: () => number`. For _reproducible_ output (contracts,
datasets) the seed is a string hashed into a small fast PRNG:

```ts
// contracts/seededRandom.ts
function hashStringToUint32(seed) {
  /* FNV-1a hash */
}
function createSeededRandom(seed: string): () => number {
  /* mulberry32 */
}
```

- **Why:** re-running the seed script must produce the _same_ contracts, not new
  random ones each time. Passing a player's id as the seed makes each player's
  contract deterministic. Tests pass their own fake `rng` to force exact outcomes.
- **Recognize it:** a `seed: string` param → deterministic; an `rng` param → testable.

## 3. `BigInt` cents, with `Number()` bridges

Money is `BigInt`. But some math (a 5% raise, a cap fraction) is easier in floats, so
you'll constantly see this bridge:

```ts
const salaryCents = BigInt(Math.round(Number(firstYearSalaryCents) * (1 + 0.05 * i)));
```

`Number(x)` to compute, `BigInt(Math.round(...))` to store. **Why the dance:** exact
integer money in the database, convenient float math in between, with an explicit
round at the boundary so no fractional cents sneak in.

## 4. Load-many-in-parallel with `Promise.all`

Independent reads run concurrently:

```ts
const [players, picks, capSheet, teams] = await Promise.all([q1, q2, q3, q4]);
```

If you see sequential `await`s that don't depend on each other, that's a smell the
codebase avoids. This is the main latency win in the actions layer.

## 5. The "id-remap via Map" bootstrap pattern

When you bulk-create rows and then need to reference the new ids, the code builds a
`Map` from old id → new id:

```ts
const leagueTeams = await prisma.leagueTeam.createManyAndReturn({ data: [...] });
const teamIdToLeagueTeamId = new Map(leagueTeams.map(lt => [lt.teamId, lt.id]));
// ...later...
leagueTeamId: teamIdToLeagueTeamId.get(player.currentTeamId)
```

`createManyAndReturn` inserts many rows in one query _and_ returns them (with their
new ids). The `Map` then lets subsequent creates wire up foreign keys with O(1)
lookups instead of re-querying. You'll see the same shape with
`playerIdToLeaguePlayerId`, `leaguePlayerIdToContractId`, etc. — it's how the whole
league is assembled in a handful of bulk writes.

## 6. `where` clauses double as authorization

Look at how trade loads the user's players:

```ts
prisma.leaguePlayer.findMany({
  where: { id: { in: input.myPlayerIds }, leagueTeamId: input.fromTeamId },
});
```

The `leagueTeamId: input.fromTeamId` isn't just a filter — it **enforces** that every
requested player is actually on your team. A forged id for another team's player
returns zero rows, and the later length-check throws. Security is baked into the
query, not bolted on after.

## 7. `$transaction` for all-or-nothing writes

When several rows must change together (execute a trade, end a career), the writes go
in `prisma.$transaction([...])` so they either all commit or all roll back — the DB
can never be left half-updated (half-traded, half-fired).

## 8. Discriminated unions + type-guard filters

Heterogeneous things (trade assets) are modeled as a union tagged by `type`, and
narrowed with a type-guard predicate:

```ts
type TradeAssetInput = { type:"PLAYER"; ... } | { type:"DRAFT_PICK"; ... } | { type:"CASH"; ... };

assets.filter((a): a is Extract<TradeAssetInput,{type:"PLAYER"}> => a.type === "PLAYER")
```

The `a is Extract<...>` return annotation makes TypeScript treat the filtered array
as player-assets only, so their fields are accessible without casts. This is how the
code stays type-safe while handling mixed lists.

## 9. Results as _named reasons_, not booleans

Validators return structured results, not `true/false`:

```ts
{ isValid: boolean, violations: { rule: "SALARY_MATCHING" | "STEPIEN_RULE" | ...; message: string }[] }
```

`validateTrade` and `validateDataset` both do this. **Why:** the caller can show the
user _exactly_ why something failed, and tests can assert the specific rule fired.

## 10. The `describe*` → news pipeline

Raw events become the news feed through pure `describe*` functions plus an importance
ranker:

```ts
describeTrade(...) → text;  importanceForRating(...) / highestImportance(...) → NewsImportance
```

Actions write a `LeagueTransaction` row with the described text + importance; the
feed sorts by importance. Turning data into human-readable, ranked stories is its own
pure layer (`transactions/`), separate from the actions that trigger it.

## 11. Snapshot tables for cheap history

`FinancialSnapshot` / `FanHappinessSnapshot` store one row per season so trend charts
are a `SELECT`, not a recomputation. Pattern: _when you need history, persist a
snapshot at the season boundary rather than replaying the past on read._

## 12. Backfill scripts for existing saves

When a feature adds columns, a `scripts/backfill-*.ts` seeds sensible values into
leagues created _before_ the feature existed, so old saves aren't broken. (There's a
project rule: new features must work on existing saves, not only new ones.)

## 13. Single source of truth + shared helpers to prevent drift

Recurring, deliberate: one function/table owns a fact, and everyone calls it.

- `getSeasonCapRules` — the only CBA-numbers accessor.
- `computeStrengthDiff` — shared by the batch sim _and_ the live playoff sim so they
  can't diverge.
- `selectTopPerTeam` (roster trim) — shared by the league bootstrap _and_ the dataset
  validator, so validation reflects exactly what's built.
- `computePerformanceScore` — one rating formula for valuation everywhere.
  When you're tempted to copy a rule, the codebase's answer is "extract and share it."

## 14. Colocated tests as executable docs

Every `foo.ts` has `foo.test.ts` next to it. To learn what a function _actually_
does, read its test — it's a set of concrete input→output examples. Ratings tuning
even encodes "anchor" players (a known star should beat a known bench guy by N),
which is how the fuzzy models are pinned down.

## 15. The closure-narrowing gotcha (a real bug class here)

TypeScript's non-null narrowing (e.g. "we checked `league` isn't null") is **lost
inside a nested function declaration**. The fix used in the code is to capture a
`const` before the nested function:

```ts
const tradeSeason = league.currentSeason; // capture while narrowed
function iconLoss(players) {
  /* use tradeSeason, not league.currentSeason */
}
```

Worth knowing because it bit the code more than once — a good "subtle TypeScript
thing I learned" story.

---

### If you only remember five

1. Pure core vs. `"use server"` shell (check the imports).
2. Randomness is injected; seeds make it reproducible.
3. Money is `BigInt` cents with explicit `Number()`/`BigInt()` bridges.
4. Bulk-create then remap ids via a `Map`; multi-row writes go in `$transaction`.
5. One source of truth per rule — shared helpers instead of copies.
