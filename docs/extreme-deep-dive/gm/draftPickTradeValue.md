# `gm/draftPickTradeValue.ts` — putting a number on a draft pick's value

**What this whole file is about:** just like players, draft picks need a single trade-value number so a
trade with picks in it can be judged. This file produces that, in the **same cents unit** as a player's
value, so picks and players can be summed and compared directly. It has to handle the wrinkle that a
future pick's slot isn't known yet, and that picks further away are worth less.

Open the real file: `src/lib/gm/draftPickTradeValue.ts`. It reuses the value math from `valuation/` and
the draft-curve numbers from `draft/generateDraftClass`.

---

## Part 1 — imports, input, and settings

```ts
import { getSeasonCapRules } from "../cap/constants";
import { scoreToCapFraction } from "../valuation/playerValue";
import { ageValueMultiplier } from "../valuation/ageCurve";
import {
  CLASS_SIZE,
  expectedRatingForPick,
  OVERALL_AT_PICK_1,
  OVERALL_AT_PICK_60,
  POTENTIAL_AT_PICK_1,
  POTENTIAL_AT_PICK_60,
} from "../draft/generateDraftClass";
import { UPSIDE_WEIGHT } from "./playerTradeValue";

export interface DraftPickTradeValueInput {
  currentSeason: number;
  pickSeason: number;
  round: 1 | 2;
  overallPickNumber: number | null;
  originalTeamCompetitivenessPercentile: number;
}

const ASSUMED_ROOKIE_AGE = 20;
const ROUND_2_VALUE_MULTIPLIER = 0.4;
const YEARS_AWAY_DISCOUNT_PER_YEAR = 0.85;
```

- The imports reuse: the season figures, the value S-curve, the age multiplier, the draft "rating curve"
  numbers (how good a prospect at pick 1 vs. pick 60 is expected to be), and — nicely — the exact
  `UPSIDE_WEIGHT` from the _player_ value file, so picks and players weight upside the same way.
- `DraftPickTradeValueInput` — what we need: the current season, which season's draft the pick is for,
  the round (1 or 2), the `overallPickNumber` (which is `number | null` — `null` if the pick's slot
  isn't decided yet), and the original team's "competitiveness percentile" (0 = league's worst, 1 =
  league's best).
- The three settings: assume a drafted rookie is 20; second-round picks are worth only 40% of what their
  "expected talent" suggests (real second-rounders are far less valuable — cheap, easily-cut contracts);
  and a pick loses value the further out it is (`0.85` per year — more below).

---

## Part 2 — guessing where a future pick will land

```ts
function projectedPickNumber(round: 1 | 2, competitivenessPercentile: number): number {
  const roundSize = CLASS_SIZE / 2;
  return round === 1
    ? Math.round(1 + competitivenessPercentile * (roundSize - 1))
    : Math.round(roundSize + 1 + competitivenessPercentile * (roundSize - 1));
}
```

If a pick's exact slot isn't known yet, we estimate it from **how good the pick's original team is** — a
bad team's pick will likely be early (valuable), a good team's pick late.

- `roundSize = CLASS_SIZE / 2` — 30 picks per round (a 60-pick draft).
- For round 1: `1 + competitivenessPercentile * 29`. A team at percentile 0 (the worst) projects to pick
  **1**; a team at percentile 1 (the best) projects to pick **30**. So the worse the team, the earlier
  (better) the projected pick.
- For round 2: the same, shifted to the 31–60 range.
- (This is a simplification — it ignores the lottery's randomness — but it's fine for a rough value
  estimate.)

---

## Part 3 — the value calculation

```ts
export function computeDraftPickTradeValue(input: DraftPickTradeValueInput): bigint {
  const rules = getSeasonCapRules(input.pickSeason);

  const pickNumber =
    input.overallPickNumber ??
    projectedPickNumber(input.round, input.originalTeamCompetitivenessPercentile);

  const expectedOverall = expectedRatingForPick(pickNumber, OVERALL_AT_PICK_1, OVERALL_AT_PICK_60);
  const expectedPotential = expectedRatingForPick(
    pickNumber,
    POTENTIAL_AT_PICK_1,
    POTENTIAL_AT_PICK_60,
  );

  const ageAdjustedScore = Math.min(100, expectedOverall * ageValueMultiplier(ASSUMED_ROOKIE_AGE));
  const upsideGap = Math.max(0, expectedPotential - expectedOverall);
  const grossScore = Math.min(100, ageAdjustedScore + upsideGap * UPSIDE_WEIGHT);

  let valueCents = BigInt(
    Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(grossScore)),
  );

  if (input.round === 2) {
    valueCents = BigInt(Math.round(Number(valueCents) * ROUND_2_VALUE_MULTIPLIER));
  }

  const yearsAway = Math.max(0, input.pickSeason - input.currentSeason);
  const yearsAwayMultiplier = YEARS_AWAY_DISCOUNT_PER_YEAR ** yearsAway;
  valueCents = BigInt(Math.round(Number(valueCents) * yearsAwayMultiplier));

  return valueCents > 0n ? valueCents : 0n;
}
```

- `const pickNumber = input.overallPickNumber ?? projectedPickNumber(...);` — use the real pick number if
  it's known, **or** (`??`) fall back to the projection if it's `null`.
- `expectedRatingForPick(pickNumber, ...)` — look up the expected rating and potential for a prospect at
  that slot, using the same draft curve the actual draft class uses (pick 1 is expected to be much better
  than pick 60).
- The next three lines are **exactly the player-value logic**: age-adjust (using the assumed rookie age
  of 20), find the upside gap, and combine into a `grossScore`. Then turn that into dollars via the
  S-curve × the cap. So a pick is valued as "the average player you'd expect to get at that slot."
- `if (input.round === 2) valueCents = ... * 0.4;` — chop a second-round pick to 40% of that value.
- **The "years away" discount:**
  - `yearsAway = Math.max(0, input.pickSeason - input.currentSeason)` — how many years in the future this
    pick is.
  - `yearsAwayMultiplier = 0.85 ** yearsAway` — `0.85` **raised to the power of** the years away (`**` is
    "to the power of"). So a pick this year is `0.85^0 = 1` (full value); one year out is `0.85` (85%);
    two years out is `0.85 × 0.85 ≈ 0.72`; and so on. Value _compounds_ down the further out the pick is —
    matching how real teams discount far-future picks for uncertainty.
- `return valueCents > 0n ? valueCents : 0n;` — never negative.

---

## Zooming out

This mirrors the player-value file deliberately: same S-curve, same `UPSIDE_WEIGHT`, same cents unit — so
a pick and a player sit on one common scale and a trade is a single sum-vs-sum comparison. The pick-
specific twists are three: estimate the slot from the original team's quality, halve second-rounders, and
compound-discount future picks. Together with `playerTradeValue.md`, this is the foundation the whole
trade AI (`evaluateTradeOffer`) stands on.

**Next file:** `gm/gmPersonality.md` — the "front-office philosophy" dials that color a team's decisions.
