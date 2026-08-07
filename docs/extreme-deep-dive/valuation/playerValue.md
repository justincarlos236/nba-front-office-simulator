# `valuation/playerValue.ts` — turning a player's stats into a rating (and a dollar value)

**What this whole file is about:** almost everything in the sim keys off a player's **rating** (a
number from 60 to 99). This file is where that rating comes from — it takes a player's real
per-game statistics and boils them into one score. It also converts a score into a **dollar value**
(what the market would pay them) and measures whether a contract is a bargain or an overpay.

Open the real file: `src/lib/valuation/playerValue.ts`. It's one of the most important files in the
whole project, and it teaches weighted formulas, "clamping" a number into a range, and an S-curve.

---

## Part 1 — the input and output shapes

```ts
import { getSeasonCapRules } from "../cap/constants";
import { ageValueMultiplier } from "./ageCurve";

export interface PlayerValuationStats {
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  minutesPerGame: number;
  trueShootingPct: number; // league average is roughly 0.56-0.58
}
```

- Imports: the season-rules function (for the dollar figures) and `ageValueMultiplier` from the
  next-door `ageCurve.ts` (which adjusts value by age — its own doc).
- `PlayerValuationStats` — the shape of a player's stat line: their per-game points, rebounds,
  assists, steals, blocks, turnovers, minutes, and **true shooting percentage** (a single number
  summarizing shooting efficiency, where ~0.56–0.58 is average). These eight numbers are all the
  formula needs.

```ts
export interface PlayerValuationInput {
  season: number;
  age: number;
  stats: PlayerValuationStats;
  actualSalaryCents: bigint;
}

export interface PlayerValuationResult {
  performanceScore: number;
  ageAdjustedScore: number;
  estimatedMarketValueCents: bigint;
  surplusValueCents: bigint;
  surplusValuePct: number;
}
```

- `PlayerValuationInput` — everything needed for the full "is this a good contract?" evaluation: the
  season, the player's age, their stats, and their **actual salary** (what they're really paid).
- `PlayerValuationResult` — the full answer: the raw performance score, the age-adjusted score, the
  estimated market value in dollars, and how much "surplus value" (bargain) the contract has, both in
  cents and as a percentage.

---

## Part 2 — three tuning constants and a helper

```ts
const MINUTES_NORMALIZATION_BLEND = 0.7;
const CONFIDENCE_MINUTES = 16;
const REPLACEMENT_LEVEL_SCORE = 65;

function normalizedRate(perGame: number, minutesPerGame: number): number {
  const per36 = perGame * (36 / Math.max(minutesPerGame, 1));
  return perGame + MINUTES_NORMALIZATION_BLEND * (per36 - perGame);
}
```

`normalizedRate` fixes a subtle unfairness. Imagine two players: one plays 36 minutes and scores 18
points; another plays 18 minutes and scores 10. The bench player _looks_ worse, but he might be just
as productive _per minute_ — he just plays less. If we judged raw per-game numbers, we'd penalize
bench players twice (fewer minutes _and_ the lower totals that come from fewer minutes).

- `const per36 = perGame * (36 / Math.max(minutesPerGame, 1));` — convert the stat to a **"per 36
  minutes"** rate (36 is roughly a starter's minutes). We scale the per-game number up by `36 ÷
minutes`. (`Math.max(minutesPerGame, 1)` guards against dividing by zero — it uses at least 1.) So
  the 18-minute scorer's 10 points becomes ~20 per 36.
- `return perGame + 0.7 * (per36 - perGame);` — but we don't go _all the way_ to per-36, because a
  star who _actually_ plays 36 heavy minutes deserves credit for that (a coach trusting you with big
  minutes is itself a sign of quality). So we blend **70% of the way** from the raw per-game number
  toward the per-36 number. `MINUTES_NORMALIZATION_BLEND = 0.7` is that 70%.

The result: bench players aren't unfairly crushed, but heavy-minutes stars keep their edge. This is
the helper I flagged earlier as "compressed" in the faster docs — now you see exactly what it does.

---

## Part 3 — the rating formula itself

```ts
export function computePerformanceScore(stats: PlayerValuationStats): number {
  const pts = normalizedRate(stats.pointsPerGame, stats.minutesPerGame);
  const reb = normalizedRate(stats.reboundsPerGame, stats.minutesPerGame);
  const ast = normalizedRate(stats.assistsPerGame, stats.minutesPerGame);
  const stl = normalizedRate(stats.stealsPerGame, stats.minutesPerGame);
  const blk = normalizedRate(stats.blocksPerGame, stats.minutesPerGame);
  const tov = normalizedRate(stats.turnoversPerGame, stats.minutesPerGame);

  const raw =
    72 +
    (pts - 15) * 0.85 +
    (reb - 5) * 0.8 +
    (ast - 3) * 1.1 +
    (stl - 1) * 2.2 +
    (blk - 0.5) * 2.2 +
    (tov - 1.5) * -1.6 +
    (stats.trueShootingPct - 0.56) * 140;

  const sampleWeight = Math.min(1, stats.minutesPerGame / CONFIDENCE_MINUTES);
  const blended = sampleWeight * raw + (1 - sampleWeight) * REPLACEMENT_LEVEL_SCORE;

  return Math.min(99, Math.max(60, blended));
}
```

**Step 1 — normalize each counting stat** using the helper above, so bench players are treated
fairly. Now `pts`, `reb`, etc. are the blended rates.

**Step 2 — the weighted formula (`raw`).** This is the core. Read it as: "start at **72** (an average
starter), then add or subtract points based on how each stat compares to a baseline."

- `72 +` — the anchor. A perfectly average starter scores about 72.
- `(pts - 15) * 0.85` — points above/below 15 (an average starter's scoring), each worth 0.85 rating
  points. Score 25 and this adds `(25-15)*0.85 = +8.5`.
- `(reb - 5) * 0.8`, `(ast - 3) * 1.1` — same idea for rebounds (baseline 5) and assists (baseline 3),
  with their own weights.
- `(stl - 1) * 2.2 + (blk - 0.5) * 2.2` — steals and blocks are _rarer_, so each one above baseline is
  worth more (2.2 points).
- `(tov - 1.5) * -1.6` — turnovers are **bad**, so the weight is **negative** (`-1.6`): more turnovers
  _subtract_ from your score.
- `(stats.trueShootingPct - 0.56) * 140` — shooting efficiency above/below the 0.56 average, scaled up
  a lot (×140) because a percentage difference like 0.04 is small in raw numbers but a big deal in
  reality.
- The specific weights aren't from a scientific formula — they're **hand-tuned** by checking the
  results against real, known players (a superstar should land ~98, a bench guy ~63) and adjusting
  until it feels right.

**Step 3 — the "small sample" safety blend.**

```ts
const sampleWeight = Math.min(1, stats.minutesPerGame / CONFIDENCE_MINUTES);
const blended = sampleWeight * raw + (1 - sampleWeight) * REPLACEMENT_LEVEL_SCORE;
```

- A player with very few minutes has _unreliable_ stats (a couple of hot games can look amazing). So
  we don't fully trust the `raw` score for low-minute players.
- `sampleWeight` = `minutesPerGame / 16`, capped at 1 by `Math.min(1, ...)`. A player at 16+ minutes
  gets a `sampleWeight` of 1 (fully trusted); a 4-minute player gets `4/16 = 0.25` (barely trusted).
- `blended` = mix the `raw` score (weighted by trust) with a fallback `REPLACEMENT_LEVEL_SCORE = 65`
  (weighted by `1 - trust`). So a barely-played player is pulled toward 65 ("we don't have enough
  evidence you're better than a fringe player") instead of trusting a flukey `raw`.

**Step 4 — clamp to the 60–99 range.**

```ts
return Math.min(99, Math.max(60, blended));
```

- **"Clamping"** means forcing a number to stay within limits. `Math.max(60, blended)` stops it going
  below 60; `Math.min(99, ...)` stops it exceeding 99. So every rating lands in the official 60–99
  band, no matter how extreme the stats.

---

## Part 4 — score → dollars (an S-curve)

```ts
export function scoreToCapFraction(score: number): number {
  const MAX_CAP_FRACTION = 0.35; // roughly a supermax-caliber player
  const MIDPOINT = 80;
  const STEEPNESS = 0.17;
  return MAX_CAP_FRACTION / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)));
}
```

This turns a rating into "what fraction of the salary cap is this player worth?"

- The formula `MAX / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)))` is a **logistic curve** (an
  "S-curve"). `Math.exp(x)` is the mathematical _e_ raised to the power `x` — the standard building
  block for smooth S-shaped curves.
- In plain terms, it produces a smooth curve where: a very low rating is worth almost nothing, value
  rises steeply through the middle, and a very high rating tops out near `MAX_CAP_FRACTION = 0.35`
  (about a maximum-salary player, ~35% of the cap). `MIDPOINT = 80` is the rating where value is
  halfway up.
- Why a curve instead of a straight line? Because value isn't linear in real life — the difference
  between a 90 and a 95 player is worth _far_ more in dollars than the difference between a 70 and a 75. The S-curve captures that.

---

## Part 5 — the full "is this contract good?" evaluation

```ts
export function evaluatePlayer(input: PlayerValuationInput): PlayerValuationResult {
  const rules = getSeasonCapRules(input.season);

  const performanceScore = computePerformanceScore(input.stats);
  const ageAdjustedScore = Math.min(99, performanceScore * ageValueMultiplier(input.age));

  const capFraction = scoreToCapFraction(ageAdjustedScore);
  const estimatedMarketValueCents = BigInt(Math.round(Number(rules.salaryCapCents) * capFraction));

  const surplusValueCents = estimatedMarketValueCents - input.actualSalaryCents;
  const surplusValuePct =
    input.actualSalaryCents > 0n ? Number(surplusValueCents) / Number(input.actualSalaryCents) : 0;

  return {
    performanceScore,
    ageAdjustedScore,
    estimatedMarketValueCents,
    surplusValueCents,
    surplusValuePct,
  };
}
```

This ties the pieces together to judge a contract:

- `performanceScore` — the raw rating from the formula above.
- `ageAdjustedScore` — multiply by the age factor (`ageValueMultiplier`, next doc): a young player's
  value is boosted for their upside, an old player's is discounted for decline risk. Capped at 99.
- `capFraction` — turn that adjusted score into a fraction of the cap via the S-curve.
- `estimatedMarketValueCents` — multiply the season's cap by that fraction to get the player's fair
  **dollar value** (using the usual to-number-and-back dance for the money math).
- `surplusValueCents` — **market value minus actual salary.** If it's positive, the team is getting
  the player for _less_ than they're worth — a bargain. Negative means an overpay.
- `surplusValuePct` — that surplus as a percentage of the salary, so bargains of _any_ size can be
  ranked fairly (a $2M surplus on a $4M deal is huge; on a $40M deal it's small). The `... > 0n ? ...
: 0` guards against dividing by a zero salary.

---

## Zooming out

This one file quietly powers a huge amount of the sim. `computePerformanceScore` gives the **rating**
that drives team strength, the trade AI, expectations, and more. `scoreToCapFraction` gives the
**dollar value** that drives contract generation and "is this a bargain?" judgments. It's the bridge
between a player's _stats_ and their _worth_ — both on the court and on the payroll. And it's all pure
arithmetic on plain numbers, so it's easy to test against known real players and trust.

**Next file:** `valuation/ageCurve.md` — the age adjustment this file just used.
