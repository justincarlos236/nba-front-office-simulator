# `simulation/simulateLiveGame.ts` — the quarter-by-quarter "watch it live" game

**What this whole file is about:** for _your own_ playoff games, the sim offers a dramatic
"watch it happen" experience where the score builds up **quarter by quarter**, instead of just
appearing at the end. This file plays a game one period at a time — 4 quarters, plus overtime if it's
tied — and the winner _emerges_ from summing the periods. (Regular-season games still use the quick
`simulateGame` from before; this is the special live version.)

Open the real file: `src/lib/simulation/simulateLiveGame.ts`.

---

## Part 1 — the settings (and one carefully-tuned number)

```ts
const AVERAGE_QUARTER_SCORE = 28; // 112 / 4
const QUARTER_SCORE_RANDOMNESS = 9;
const MIN_QUARTER_SCORE = 12;

const OT_AVERAGE_SCORE = 11;
const OT_SCORE_RANDOMNESS = 5;
const MIN_OT_SCORE = 4;

const QUARTER_STRENGTH_SENSITIVITY = 0.35;
```

- `AVERAGE_QUARTER_SCORE = 28` — an average team scores ~112 in a game, so ~28 per quarter.
- The `OT_*` constants are the same idea for a 5-minute overtime period (shorter, so smaller scores).
- `QUARTER_STRENGTH_SENSITIVITY = 0.35` — how much a team's strength edge tilts each quarter's score.
  Re-calibrated from 0.11 when `simulateGame` moved to a margin-first model: a live playoff game must
  not run a different win model from the one every probability display reports.
  This number is special: it was **carefully calibrated** (by running tens of thousands of test games)
  so that summing 4 independent quarters produces the _same_ overall win rate as the quick `simulateGame`
  model. Why the care? Because adding up 4 separate random quarters would naturally exaggerate a strength
  edge more than a single roll — this smaller number corrects for that, so the live experience agrees
  with the odds shown elsewhere in the game. (You don't need the details — just know it's tuned, not
  guessed, and there's a test guarding it.)

There's the familiar `triangular(rng, spread)` helper again (a random nudge centered on 0).

---

## Part 2 — simulating one period

```ts
export interface PeriodScore {
  home: number;
  away: number;
}

function simulatePeriod(meanMargin, averageScore, randomness, minScore, rng): PeriodScore {
  const away = Math.max(minScore, Math.round(averageScore + triangular(rng, randomness)));
  const home = Math.max(
    minScore,
    Math.round(averageScore + meanMargin + triangular(rng, randomness)),
  );
  return { home, away };
}
```

- `PeriodScore` — one period's scoreline: the `home` and `away` points that period.
- `simulatePeriod` — generate one period's scores. Each team scores around the `averageScore` with a
  random `triangular` nudge. The **home** team also gets `meanMargin` added — that's the strength-edge
  tilt (positive if the home team is favored). `Math.max(minScore, ...)` makes sure no period score dips
  below a floor. Each side gets its _own_ random nudge, so the pace of a quarter varies too, not just who
  it favors.

```ts
export function simulateQuarter(
  homeStrength,
  awayStrength,
  homeCoachBonus = 0,
  awayCoachBonus = 0,
  rng = Math.random,
): PeriodScore {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  const meanMargin = diff * QUARTER_STRENGTH_SENSITIVITY;
  return simulatePeriod(
    meanMargin,
    AVERAGE_QUARTER_SCORE,
    QUARTER_SCORE_RANDOMNESS,
    MIN_QUARTER_SCORE,
    rng,
  );
}
```

- `simulateQuarter` — plays one regulation quarter. It reuses `computeStrengthDiff` (from `simulateGame.md`
  — the same "how much stronger is home?" number, so the two models stay consistent), multiplies it by
  the tuned sensitivity to get this quarter's `meanMargin`, and calls `simulatePeriod`.
- `simulateOvertimePeriod` (not shown) is the same, but with the smaller OT baselines and an even smaller
  strength effect (a short overtime is more of a coin flip — the same reason real close games feel like
  toss-ups once they reach OT).

---

## Part 3 — playing the whole live game

```ts
export interface LiveGameResult {
  quarters: PeriodScore[]; // always length 4
  overtimes: PeriodScore[]; // empty unless tied after regulation
  finalHomeScore: number;
  finalAwayScore: number;
  homeWon: boolean;
}

const MAX_OVERTIME_PERIODS = 6;

export function simulateLiveGame(
  homeStrength,
  awayStrength,
  homeCoachBonus = 0,
  awayCoachBonus = 0,
  rng = Math.random,
): LiveGameResult {
  const quarters: PeriodScore[] = [];
  for (let i = 0; i < 4; i++) {
    quarters.push(simulateQuarter(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus, rng));
  }

  let homeScore = quarters.reduce((sum, q) => sum + q.home, 0);
  let awayScore = quarters.reduce((sum, q) => sum + q.away, 0);

  const overtimes: PeriodScore[] = [];
  while (homeScore === awayScore && overtimes.length < MAX_OVERTIME_PERIODS) {
    const ot = simulateOvertimePeriod(
      homeStrength,
      awayStrength,
      homeCoachBonus,
      awayCoachBonus,
      rng,
    );
    overtimes.push(ot);
    homeScore += ot.home;
    awayScore += ot.away;
  }

  return {
    quarters,
    overtimes,
    finalHomeScore: homeScore,
    finalAwayScore: awayScore,
    homeWon: homeScore > awayScore,
  };
}
```

- `for (let i = 0; i < 4; i++) { quarters.push(simulateQuarter(...)); }` — play **4 quarters**, adding
  each to the `quarters` list.
- `let homeScore = quarters.reduce((sum, q) => sum + q.home, 0);` — add up all four quarters' home points
  (the running-total `.reduce` trick). Same for away. These are `let` because overtime may add to them.
- `while (homeScore === awayScore && overtimes.length < MAX_OVERTIME_PERIODS)` — **if the game is tied,
  play overtime periods until it isn't.** The `while` loop keeps adding OT periods (and their points to
  the running totals) as long as the score is level. `MAX_OVERTIME_PERIODS = 6` is a safety cap so it
  can't loop forever.
- `homeWon: homeScore > awayScore` — the winner is simply whoever has more points after everything is
  summed. **Nothing decides the outcome up front** — it genuinely emerges from the periods. That's the
  whole appeal of the live version.

---

## Part 4 — spreading player stats across the periods (`allocateAcrossPeriods`)

For the live reveal, individual player stats should tick up quarter by quarter too. But the _authoritative_
final box score already exists (from `boxScore.md`) — so this file **distributes** those final totals
across the periods rather than inventing new numbers.

```ts
function allocateAcrossPeriods(total: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0 || total === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (w / totalWeight) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((sum, f) => sum + f, 0);
  const byFraction = raw
    .map((r, i) => ({ index: i, fraction: r - floors[i] }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[byFraction[k % byFraction.length].index] += 1;
  return result;
}
```

This splits a `total` (say, a player's 20 points) across the periods, weighted by how much the team scored
each period, so the split always sums back to exactly the total. This is the **"largest remainder
method,"** a standard fair-rounding technique:

- `raw` — the exact (fractional) share for each period, like `[5.4, 4.8, 5.1, 4.7]`.
- `floors` — round each **down** (`Math.floor`), giving `[5, 4, 5, 4] = 18`. That leaves a `remainder` of
  `20 - 18 = 2` points to hand out.
- `byFraction` — sort the periods by their leftover fraction, biggest first (the `.8` and `.4` above).
- The final loop hands the 2 leftover points to the periods with the **biggest fractions**. Result:
  `[5, 5, 5, 5] = 20` — sums back exactly, split as fairly as possible. This guarantees per-period stats
  always add up to the real totals with no rounding drift.

`allocatePlayerStatsAcrossPeriods` (not shown) just runs this for every stat of every player, weighting by
each team's real per-period scoring — so the live stat reveal always lands exactly on the authoritative
box score.

---

## Zooming out

This file is the "cinematic" version of a game: build the score period by period so it feels live, then
split the final box score across those periods so the stats tick up believably too. The two ideas worth
keeping: (1) the outcome _emerges_ from summing independent periods (with a carefully-tuned sensitivity
so it still matches the game's normal odds), and (2) the largest-remainder method fairly splits a total
into parts that always sum back exactly — a handy, reusable technique.

**That completes the entire `simulation/` folder** (all 9 files). Next, Track B moves on to the remaining
domains — `gm/` (career, AI, expectations), `finances/`, `fans/`, `morale/`, `draft/`, `data-sources/`,
and the smaller pieces (`development/`, `rotation/`, `staff/`, `transactions/`), then the `actions/` layer.
