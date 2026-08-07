# `simulation/simulateGame.ts` — deciding who wins a single game

**What this whole file is about:** given two teams' strength numbers (from the last file), this file
decides who wins one game and makes up a believable final score. It does _not_ simulate every
possession — it uses a probability (a weighted coin flip) based on the strength difference. This is
fast, and — because the randomness is passed in — it's predictable when testing.

Open the real file: `src/lib/simulation/simulateGame.ts`. It teaches "default values" for inputs, an
S-curve probability, and drawing a random outcome.

---

## Part 1 — the settings

```ts
const HOME_COURT_ADVANTAGE = 3; // rating points of equivalent strength
const WIN_PROB_STEEPNESS = 0.07;
const AVERAGE_TEAM_SCORE = 112;
const SCORE_RANDOMNESS = 22; // +/- swing applied to the loser's score
const MIN_MARGIN = 3;
const MAX_MARGIN = 22;
```

- `HOME_COURT_ADVANTAGE = 3` — the home team plays as if it's 3 rating points stronger (home teams win
  a bit more, like reality).
- `WIN_PROB_STEEPNESS = 0.07` — controls how sharply a strength edge turns into a win-probability edge
  (used in the S-curve below).
- `AVERAGE_TEAM_SCORE = 112` — a realistic average NBA team score.
- `SCORE_RANDOMNESS = 22` — how much the loser's score can swing up or down from average.
- `MIN_MARGIN = 3` / `MAX_MARGIN = 22` — the winner beats the loser by somewhere between 3 and 22
  points.

---

## Part 2 — the strength difference

```ts
export function computeStrengthDiff(
  homeStrength: number,
  awayStrength: number,
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
): number {
  return homeStrength + HOME_COURT_ADVANTAGE + homeCoachBonus - awayStrength - awayCoachBonus;
}
```

- This computes the single "how much stronger is the home team?" number that everything else keys off.
- **`homeCoachBonus: number = 0`** — the `= 0` is a **default value.** It means if the caller doesn't
  provide a coach bonus, it's treated as `0`. So you can call this with just two strengths, and the
  coach bonuses quietly default to "no effect." (Coaches are an optional feature; this makes them opt-in
  without breaking anything.)
- The formula: home strength, **plus** home court advantage, **plus** the home coach's bonus, **minus**
  the away strength and the away coach's bonus. A positive result means the home team is favored; a
  negative result means the away team is.

---

## Part 3 — the win probability (an S-curve)

```ts
export function computeHomeWinProbability(
  homeStrength: number,
  awayStrength: number,
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
): number {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  return 1 / (1 + Math.exp(-WIN_PROB_STEEPNESS * diff));
}
```

- First compute the strength difference (above).
- `1 / (1 + Math.exp(-WIN_PROB_STEEPNESS * diff))` — this is a **logistic curve** (the same S-curve
  shape we met in `valuation/playerValue.md`). `Math.exp(x)` is _e_ to the power `x`. You don't need
  the math; you need the _shape_:
  - When the teams are even (`diff = 0`), this gives exactly **0.5** — a 50/50 coin flip.
  - As the home team gets stronger (`diff` grows), the probability rises toward 1 but **never reaches
    it** — a much better team might be ~85% to win, not 100%.
  - As they get weaker, it falls toward 0.
- **Why an S-curve instead of a straight line?** Because it correctly keeps the probability between 0
  and 1 no matter how big the strength gap, and it matches reality: even a heavy favorite loses
  sometimes. Upsets stay possible, which is what makes the sim feel real.

---

## Part 4 — playing the game

```ts
export interface SimulatedGameResult {
  homeWon: boolean;
  homeScore: number;
  awayScore: number;
  homeWinProbability: number;
}

export function simulateGame(
  homeStrength: number,
  awayStrength: number,
  rng: () => number = Math.random,
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
): SimulatedGameResult {
  const homeWinProbability = computeHomeWinProbability(
    homeStrength,
    awayStrength,
    homeCoachBonus,
    awayCoachBonus,
  );
  const homeWon = rng() < homeWinProbability;

  const loserScore = Math.round(AVERAGE_TEAM_SCORE + (rng() - 0.5) * SCORE_RANDOMNESS);
  const margin = MIN_MARGIN + Math.round(rng() * (MAX_MARGIN - MIN_MARGIN));
  const winnerScore = loserScore + margin;

  return homeWon
    ? { homeWon: true, homeScore: winnerScore, awayScore: loserScore, homeWinProbability }
    : { homeWon: false, homeScore: loserScore, awayScore: winnerScore, homeWinProbability };
}
```

- `SimulatedGameResult` — the answer shape: who won, both scores, and the win probability that was used
  (handy for display).
- **`rng: () => number = Math.random`** — the third input is a random-number **function**, and its
  default is the built-in `Math.random` (real randomness). But a test can pass a _fake_ rng to force a
  specific outcome. This is the "inject the randomness so it's testable" pattern again.

**Step 1 — decide the winner (a weighted coin flip):**

```ts
const homeWinProbability = computeHomeWinProbability(...);
const homeWon = rng() < homeWinProbability;
```

- Get the home team's win probability, then `rng() < homeWinProbability`. `rng()` produces a number
  from 0 to 1. If that random number lands _below_ the home win probability, the home team wins.
  Example: if the home team is 70% (`0.7`) to win, then any `rng()` roll under `0.7` is a home win —
  which happens ~70% of the time. That's how you turn a probability into an actual yes/no outcome.

**Step 2 — make up a believable score:**

```ts
const loserScore = Math.round(AVERAGE_TEAM_SCORE + (rng() - 0.5) * SCORE_RANDOMNESS);
const margin = MIN_MARGIN + Math.round(rng() * (MAX_MARGIN - MIN_MARGIN));
const winnerScore = loserScore + margin;
```

- `loserScore` — start at the average (112) and nudge it randomly. `(rng() - 0.5)` turns a 0-to-1 roll
  into a value between −0.5 and +0.5 (so it can go _down_ as well as up); times `SCORE_RANDOMNESS` (22)
  spreads it to roughly ±11; `Math.round(...)` makes it a whole number. So the loser scores somewhere
  around 101–123.
- `margin` — a random winning margin between `MIN_MARGIN` (3) and `MAX_MARGIN` (22). `rng() * (22 - 3)`
  is 0 to 19; add 3; round; so 3 to 22.
- `winnerScore` — the loser's score plus the margin.

**Step 3 — hand back the result:**

```ts
return homeWon
  ? { homeWon: true, homeScore: winnerScore, awayScore: loserScore, homeWinProbability }
  : { homeWon: false, homeScore: loserScore, awayScore: winnerScore, homeWinProbability };
```

- A ternary that assigns the scores correctly: if the home team won, the home score is the winner's
  score and the away score is the loser's; otherwise it's flipped. Either way it reports whether the
  home team won and the probability that was used.

Notice the whole thing uses only **three** `rng()` calls (one for the winner, two for the score) — very
cheap, which is exactly why simulating a thousand-game season is fast.

---

## Zooming out

This is the beating heart of the on-court simulation, and it's tiny: turn a strength difference into an
S-curve probability, flip a weighted coin, and dress it up with a plausible score. It's fast (so
whole seasons sim quickly), it's realistic (favorites are favored but upsets happen), and it's testable
(the randomness is injected). Every regular-season game and every playoff game runs through this one
function.

**Next file:** `simulation/boxScore.md` — taking a decided game score and spreading it into believable
individual player stat lines. (That one's bigger.)
