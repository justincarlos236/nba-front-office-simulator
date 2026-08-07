# `gm/playerTradeValue.ts` — putting one number on a player's trade value

**What this whole file is about:** to judge a trade, the computer needs a single "how much is this
player worth?" number — one that can be compared and added up against other players and draft picks.
This file produces that number (in dollars/cents), combining five things: current production, age,
untapped potential, whether the contract is a bargain, and injury risk.

Open the real file: `src/lib/gm/playerTradeValue.ts`. It builds directly on the `valuation/` files, so
if `scoreToCapFraction` and `ageValueMultiplier` are fuzzy, peek back at `valuation/playerValue.md` and
`valuation/ageCurve.md`.

---

## Part 1 — imports and the input shape

```ts
import { getSeasonCapRules } from "../cap/constants";
import { scoreToCapFraction } from "../valuation/playerValue";
import { ageValueMultiplier } from "../valuation/ageCurve";

export interface PlayerTradeValueInput {
  season: number;
  overallRating: number;
  potentialRating: number;
  age: number;
  currentSalaryCents: bigint;
  injuryStatus: "HEALTHY" | "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
  careerGamesMissedToInjury: number;
}
```

- The three imports are old friends: season dollar figures, the "score → fraction of the cap" S-curve,
  and the age multiplier.
- `PlayerTradeValueInput` — everything the value calculation needs about a player: their rating,
  potential, age, actual salary, current injury status, and how many games they've missed to injury over
  their career.

---

## Part 2 — the weighting settings

```ts
export const UPSIDE_WEIGHT = 0.4;
const CONTRACT_SURPLUS_WEIGHT = 0.5;

const INJURY_STATUS_MULTIPLIER: Record<PlayerTradeValueInput["injuryStatus"], number> = {
  HEALTHY: 1,
  DAY_TO_DAY: 0.97,
  OUT: 0.85,
  SEASON_ENDING: 0.6,
};

const CAREER_INJURY_DISCOUNT_PER_GAME = 0.002;
const MAX_CAREER_INJURY_DISCOUNT = 0.3;
```

- `UPSIDE_WEIGHT = 0.4` — how much a player's _untapped potential_ counts. It's under 1 on purpose:
  potential matters, but **proven** production matters more (a young player _might_ reach a rating; a
  veteran already _has_). This is `export`ed because the draft-value file reuses it.
- `CONTRACT_SURPLUS_WEIGHT = 0.5` — how much a bargain (or overpay) swings value. Half-weighted so a
  slight overpay doesn't erase a superstar's value.
- `INJURY_STATUS_MULTIPLIER` — a lookup table: a healthy player's value is unchanged (`1`), a
  day-to-day player barely dinged (`0.97`), an out player more (`0.85`), a season-ending injury a big
  cut (`0.6`).
- The two `CAREER_INJURY_*` numbers: each career game missed shaves 0.2% off value
  (`0.002`), capped at a 30% total discount — so an injury-prone player is worth a bit less even while
  currently healthy, but a long history can't zero them out entirely.

---

## Part 3 — the calculation

```ts
export function computePlayerTradeValue(input: PlayerTradeValueInput): bigint {
  const rules = getSeasonCapRules(input.season);

  const ageAdjustedScore = Math.min(100, input.overallRating * ageValueMultiplier(input.age));
  const upsideGap = Math.max(0, input.potentialRating - input.overallRating);
  const grossScore = Math.min(100, ageAdjustedScore + upsideGap * UPSIDE_WEIGHT);
  const grossValueCents = BigInt(
    Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(grossScore)),
  );

  const fairValueTodayCents = BigInt(
    Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(ageAdjustedScore)),
  );
  const surplusCents = fairValueTodayCents - input.currentSalaryCents;

  const totalValueCents =
    grossValueCents + BigInt(Math.round(Number(surplusCents) * CONTRACT_SURPLUS_WEIGHT));

  const careerInjuryDiscount = Math.min(
    MAX_CAREER_INJURY_DISCOUNT,
    input.careerGamesMissedToInjury * CAREER_INJURY_DISCOUNT_PER_GAME,
  );
  const totalMultiplier = INJURY_STATUS_MULTIPLIER[input.injuryStatus] * (1 - careerInjuryDiscount);

  const finalValueCents = BigInt(Math.round(Number(totalValueCents) * totalMultiplier));
  return finalValueCents > 0n ? finalValueCents : 0n;
}
```

Let's walk the five factors:

**1 & 2 — production + age (the "gross score"):**

- `const ageAdjustedScore = Math.min(100, input.overallRating * ageValueMultiplier(input.age));` — take
  the rating and multiply by the age factor (young → boosted, old → discounted). `Math.min(100, ...)`
  caps it at 100.
- `const upsideGap = Math.max(0, input.potentialRating - input.overallRating);` — how much room a player
  has to grow (potential minus current). `Math.max(0, ...)` keeps it from going negative (a player past
  their potential has 0 upside, not negative).

**3 — add the upside:**

- `const grossScore = Math.min(100, ageAdjustedScore + upsideGap * UPSIDE_WEIGHT);` — add 40% of the
  upside gap to the age-adjusted score. So a young player with lots of potential gets a real bump, but
  it doesn't overwhelm their proven ability. Capped at 100.
- `grossValueCents` — turn that score into dollars via the S-curve (`scoreToCapFraction`) × the cap.

**4 — the contract bargain/overpay:**

- `fairValueTodayCents` — the player's value based on their **current** production only (no upside bonus)
  — i.e., what the market would pay them _today._
- `surplusCents = fairValueTodayCents - input.currentSalaryCents;` — market value minus their actual
  salary. Positive = a bargain (paid less than worth); negative = an overpay.
- `totalValueCents = grossValueCents + BigInt(Math.round(Number(surplusCents) * 0.5));` — add half the
  surplus to the value. A player on a great cheap contract is _more_ tradeable; one badly overpaid is
  _less._

**5 — injury risk:**

- `careerInjuryDiscount` — the capped career-injury shave (up to 30%).
- `totalMultiplier = INJURY_STATUS_MULTIPLIER[input.injuryStatus] * (1 - careerInjuryDiscount);` —
  combine the current-injury multiplier with the career discount. A currently-injured, injury-prone
  player gets hit on both counts.
- `finalValueCents = ... * totalMultiplier` — apply it. `return finalValueCents > 0n ? finalValueCents :
0n;` — never return a negative value (a player is worth at least 0).

---

## Zooming out

This is the "objective" trade value — deliberately _without_ any team's opinion baked in. (Remember from
`trade/evaluateTradeOffer.md`: the personality/needs adjustments happen one layer up, on top of this base
number.) Keeping the objective value separate means every team starts from the same honest baseline, then
colors it with its own preferences. And it's expressed in the same cents unit as a draft pick's value
(next file), so a trade becomes one clean "sum of what I get vs. sum of what I give" comparison.

**Next file:** `gm/draftPickTradeValue.md` — the same idea, but for a draft pick.
