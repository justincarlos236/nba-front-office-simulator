# 03 — The Cap & Trade Code (real functions)

Everything here is pure (no DB). Files: `src/lib/cap/*` and `src/lib/trade/*`.

## `cap/constants.ts` — the numbers + the accessor

The data structure is a `SeasonCapRules` object per season:

```ts
interface SeasonCapRules {
  season: number;
  salaryCapCents: bigint;
  luxuryTaxCents: bigint;
  firstApronCents: bigint;
  secondApronCents: bigint;
  nonTaxpayerMLECents;
  taxpayerMLECents;
  roomMLECents;
  biAnnualExceptionCents;
  emptyRosterChargeCents: bigint;
  tradeMatchLowerBreakpointCents: bigint;
  tradeMatchUpperBreakpointCents: bigint;
}
```

`SEASON_CAP_RULES` is a hardcoded array for 2023–2025 (real reported figures).

**`getSeasonCapRules(season)`** is the _only_ way anyone reads these numbers:

```ts
export function getSeasonCapRules(season): SeasonCapRules {
  const exact = SEASON_CAP_RULES.find((r) => r.season === season);
  if (exact) return exact;
  // Past the table: project forward at +5%/yr so a long save keeps growing.
  // Before the table: fall back to the nearest known season (don't throw).
}
```

- **Input:** a season year. **Output:** always a valid rule set.
- **Why a function, not a raw lookup:** callers can ask for _any_ season (a save can
  run decades) and always get a sensible answer. The projection uses
  `scaleCents(cents, factor)` with a compound `(1.05)^(season - latest)`.

## `cap/apron.ts` — the five spending tiers

```ts
enum ApronLevel {
  UNDER_CAP,
  BETWEEN_CAP_AND_TAX,
  TAXPAYER,
  FIRST_APRON,
  SECOND_APRON,
}

function getApronLevel(totalSalaryCents, rules): ApronLevel {
  if (total >= rules.secondApronCents) return SECOND_APRON;
  if (total >= rules.firstApronCents) return FIRST_APRON;
  if (total >= rules.luxuryTaxCents) return TAXPAYER;
  if (total >= rules.salaryCapCents) return BETWEEN_CAP_AND_TAX;
  return UNDER_CAP;
}
```

A simple descending threshold check — one number in, one label out. That single
label then drives _privileges_ elsewhere:

```ts
eligibleMidLevelException(level): "ROOM" | "NON_TAXPAYER" | "TAXPAYER" | null
// UNDER_CAP → ROOM, TAXPAYER/BETWEEN → NON_TAXPAYER, FIRST_APRON → TAXPAYER,
// SECOND_APRON → null (hard-capped out of every mid-level exception)
canUseBiAnnualException(level): boolean   // false only at SECOND_APRON
```

**Design point:** the CBA's "the more you spend, the fewer tools you get" is
expressed as a level → privilege mapping, so free agency and trades just ask "what
level is this team?" and get their answer.

## `cap/capSheet.ts` — `computeCapSheet(input)`

```ts
computeCapSheet({ season, contracts:[{playerId, salaryCents}], deadMoneyCents?, retainedSalaryCents? }) → CapSheet
```

Steps (all `BigInt` math):

1. `committedSalaryCents` = sum of the contracts' salaries.
2. `emptyRosterChargeCents` = `rules.emptyRosterChargeCents × max(0, 12 − contracts.length)` — the CBA charges a minimum for each empty roster spot below 12, so a
   near-empty team can't fake infinite cap space.
3. `totalSalaryCents` = committed + dead money + retained + empty-roster charges.
4. `apronLevel` = `getApronLevel(totalSalaryCents, rules)`.
5. `capSpaceCents` = `cap − total` if under the cap, else `0n`.
6. distances to each apron = `apronCents − total` (negative once you're past it).

**Returns** a `CapSheet` with all of the above. Pure, so `capSheet.test.ts` checks
dozens of scenarios with plain arrays.

## `trade/salaryMatching.ts` — the matching helpers

Three small pure helpers the validator composes:

- **`isUnderCapSpace(apronLevel)`** → is this team operating with cap _space_ (as
  opposed to being over the cap)? A team with room just needs the incoming salary to
  fit `capSpace + outgoing`.
- **`maxIncomingSalaryCents(outgoingSalaryCents, apronLevel, rules)`** → for an
  over-the-cap team, the most salary it may take back, computed with the CBA's
  **tiered** formula against the season's `tradeMatch*Breakpoint` figures (small
  outgoing salaries can take back proportionally more; large ones ~125%).
- **`canAggregateSalaries(apronLevel)`** → may this team combine several outgoing
  contracts into one bigger incoming one? **False at the second apron.**

## `trade/validateTrade.ts` — `validateTrade(input)` (the centerpiece)

```ts
validateTrade({ season, assets: TradeAssetInput[], teamCapStates: Record<teamId, TradeTeamCapState> })
  → { isValid: boolean, violations: TradeViolation[] }
```

`TradeAssetInput` is a **discriminated union** (`PLAYER | DRAFT_PICK | CASH`), each
tagged with `fromTeamId`/`toTeamId`. `TradeViolation.rule` is one of six named
codes, so callers get _specific_ reasons, not a boolean.

It collects violations in order:

1. **Structural:** at least two teams (`INVALID_STRUCTURE`); every team has a cap
   state (`MISSING_TEAM_CAP_STATE`) — bail early if not.
2. **No-trade clauses:** any player with `noTradeClause` set → `NO_TRADE_CLAUSE`.
3. **Per-team salary matching** (the core loop): for each team, sum outgoing vs.
   incoming player salary. If the team `isUnderCapSpace`, incoming must fit
   `capSpace + outgoing`. Otherwise incoming must be ≤
   `maxIncomingSalaryCents(outgoing, apronLevel, rules)` → else `SALARY_MATCHING`.
4. **Second-apron aggregation:** a second-apron team sending multiple players for
   fewer → `NO_AGGREGATION_AT_SECOND_APRON`.
5. **Stepien rule:** a "lite" version — for each first-round pick a team trades away,
   check it still owns a first-rounder in the year before _or_ after; if not →
   `STEPIEN_RULE` (you can't be pick-less in back-to-back future drafts).

Notice the neat use of **type-guard filters** to narrow the union:

```ts
input.assets.filter(
  (a): a is Extract<TradeAssetInput, { type: "PLAYER" }> =>
    a.type === "PLAYER" && a.fromTeamId === teamId,
);
```

The `a is Extract<...>` return type tells TypeScript the filtered array is
player-assets only, so `.salaryCents` is available without casts.

**Why entirely pure (no Prisma):** the exact same function powers (a) the server
action's authoritative check, (b) the trade-builder's live preview in the browser,
and (c) the AI assistant's tools — none of which should need database access to ask
"is this legal?" One implementation, three consumers, zero drift.

## How the cap code composes (the dependency chain)

```
constants.getSeasonCapRules ──► capSheet.computeCapSheet ──► apron.getApronLevel
                                        │                            │
        trade action's loadCapState ────┘                            ▼
                                              validateTrade uses apronLevel + capSpace
                                              + salaryMatching helpers + constants
```

## Interview-ready one-liners for this code

- "The CBA numbers live in one table behind `getSeasonCapRules`, which also projects
  future seasons, so nothing else hardcodes a dollar figure."
- "`computeCapSheet` is pure `BigInt` math returning a team's full standing; the
  apron level it produces is what gates every spending privilege."
- "`validateTrade` is a pure function returning _named_ violations, reused by the
  server, the UI preview, and the AI — so legality can never disagree across them."
