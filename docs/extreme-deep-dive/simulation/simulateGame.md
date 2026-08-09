# `simulation/simulateGame.ts` — deciding who wins a single game

**What this whole file is about:** given two teams' strength numbers (from the last file), this file
decides who wins one game and makes up a believable final score. It does _not_ simulate every
possession — it draws a **point margin** from a bell curve centred on the strength difference, and
whoever the margin favours wins. This is fast, and — because the randomness is passed in — it's
predictable when testing.

Open the real file: `src/lib/simulation/simulateGame.ts`. It teaches "default values" for inputs,
drawing from a normal distribution, and deriving two related outputs from one model so they cannot
contradict each other.

---

## Part 1 — the settings

```ts
const HOME_COURT_ADVANTAGE = 1.1; // rating points of equivalent strength
const MARGIN_PER_STRENGTH_POINT = 2.31;
const MARGIN_SD = 15;
const AVERAGE_COMBINED_SCORE = 228; // both teams together
const COMBINED_SCORE_SD = 19;
const MIN_TEAM_SCORE = 78;
```

- `HOME_COURT_ADVANTAGE = 1.1` — the home team plays as if it's about one rating point stronger.
  Small, because a rating point is now worth 2.31 points of margin, so 3 would mean a ~7-point home
  edge and push home teams to a 67% win rate.
- `MARGIN_PER_STRENGTH_POINT = 2.31` — how many points of expected margin one point of strength buys.
- `MARGIN_SD = 15` — how far a single game swings around that expectation. This is what produces both
  one-point finishes and 30-point blowouts from the same draw.
- `AVERAGE_COMBINED_SCORE = 228` / `COMBINED_SCORE_SD = 19` — the two teams' combined points, which
  the margin is then split out of.
- `MIN_TEAM_SCORE = 78` — a floor, so a tail draw can't produce an impossible scoreline.

> **Only the ratio `MARGIN_PER_STRENGTH_POINT / MARGIN_SD` sets win probability**, so those two are
> tuned as a pair. See `docs/SIMULATION_AUDIT.md` for how they were calibrated against real saves.

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

## Part 3 — the win probability

```ts
export function computeHomeWinProbability(homeStrength, awayStrength, homeCoachBonus = 0, awayCoachBonus = 0): number {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  return standardNormalCdf((diff * MARGIN_PER_STRENGTH_POINT) / MARGIN_SD);
}
```

- This is not a separate model from the score below — it is **literally "how often is this matchup's
  margin positive."** `standardNormalCdf(z)` answers "what share of a bell curve lies left of `z`", so
  feeding it `expectedMargin / MARGIN_SD` gives the chance the margin lands above zero.
- Because probability and margin come from the same two constants, the number shown in the UI and the
  results the engine actually produces **cannot disagree**. That is the point of deriving one from the
  other rather than drawing them separately.
- The result is clamped just inside `(0, 1)` — no matchup is ever a certainty, and a probability of
  exactly 1 would make a comeback impossible in the live-game simulator.

---

## Part 4 — simulating a game

```ts
export function simulateGame(homeStrength, awayStrength, rng = Math.random, homeCoachBonus = 0, awayCoachBonus = 0) {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  const homeWinProbability = standardNormalCdf((diff * MARGIN_PER_STRENGTH_POINT) / MARGIN_SD);

  // 1. Draw the margin, from the home team's point of view.
  const expectedMargin = diff * MARGIN_PER_STRENGTH_POINT;
  let homeMargin = Math.round(expectedMargin + gaussian(rng) * MARGIN_SD);
  if (homeMargin === 0) homeMargin = expectedMargin >= 0 ? 1 : -1;

  // 2. Draw how high-scoring the game was, then split the margin out of it.
  const combined = Math.round(AVERAGE_COMBINED_SCORE + gaussian(rng) * COMBINED_SCORE_SD);
  const absMargin = Math.abs(homeMargin);
  const loserScore = Math.max(MIN_TEAM_SCORE, Math.round((combined - absMargin) / 2));
  const winnerScore = loserScore + absMargin;

  // 3. The sign of the margin decides who won.
  const homeWon = homeMargin > 0;
  return homeWon
    ? { homeWon: true, homeScore: winnerScore, awayScore: loserScore, homeWinProbability }
    : { homeWon: false, homeScore: loserScore, awayScore: winnerScore, homeWinProbability };
}
```

**Step 1 — the margin.** A normal draw centred on the strength difference. A better team is expected
to win by more, and the `MARGIN_SD` spread means the same matchup can produce a nail-biter one night
and a rout the next. Basketball has no ties, so a drawn zero breaks toward whoever was favoured.

**Step 2 — the scoreline.** Rather than inventing two scores, the engine draws how high-scoring the
game was in total and splits the already-decided margin out of it. `MIN_TEAM_SCORE` guards the tail so
a lopsided draw can't produce something impossible.

**Step 3 — the winner.** No separate coin flip: the margin's sign already says who won, which is why
the reported probability and the results always agree.

`gaussian(rng)` uses Box-Muller and consumes **two** `rng()` values, so a game costs four in total —
still cheap enough to sim a full season instantly, and fully reproducible from a seed.

---

## Why it was rebuilt

The original version drew the winner from a logistic curve and *then* drew the margin from a bounded
uniform `[3, 22]` that never looked at team strength. Measured over 246,000 simulated games:

- a 97.5% favourite beat a hopeless team by the same margin distribution as a coin flip — 12.49 points
  in both cases
- not one game was decided by 1 or 2 points (the real NBA: ~7%)
- not one was decided by more than 22 (the real NBA: ~12% are 26+)

Deriving both from one distribution fixed all three at once. See `docs/SIMULATION_AUDIT.md`.

---

## Zooming out

This is the beating heart of the on-court simulation, and it's still tiny: turn a strength difference
into an expected margin, draw around it, and let the sign decide the winner. It's fast (so whole
seasons sim quickly), it's realistic (favourites are favoured, upsets and blowouts both happen at
believable rates), and it's testable (the randomness is injected). Every regular-season game and every
playoff game runs through this one function.
