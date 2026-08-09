# 04 — The Simulation Code (real functions)

Pure logic in `src/lib/simulation/*`; the persistence loop in
`src/lib/actions/simulation.ts`.

## `simulation/teamStrength.ts` — roster → one number

```ts
const ROTATION_SIZE = 9;
const ROTATION_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
const BENCH_WEIGHT = 0.4;

function computeTeamStrength(playerRatings: number[]): number {
  const sorted = [...playerRatings].sort((a, b) => b - a); // best first
  let weightedSum = 0,
    weightTotal = 0;
  sorted.forEach((rating, i) => {
    const weight = i < ROTATION_SIZE ? ROTATION_WEIGHTS[i] : BENCH_WEIGHT;
    weightedSum += rating * weight;
    weightTotal += weight;
  });
  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
```

- **Input:** an array of player overall ratings. **Output:** one team-strength
  number on the same ~60–99 scale.
- **Why weighted, not a plain average:** NBA games are star-driven — your best
  player matters more than your 12th man. The top 9 get descending weights (the best
  player counts 1.4×), everyone past the rotation counts 0.4×. A team of one 99 and
  fourteen 60s is _not_ the same as fifteen 70s, and the weighting captures that.
- **Note it `[...ratings].sort()`** — it copies before sorting so it never mutates
  the caller's array (a pure-function courtesy).

This single number feeds three different systems (the sim, GM expectations, trade
valuation), which is why it's its own tiny function.

## `simulation/simulateGame.ts` — the win/score model

**The shared signal** (exported so nothing re-derives it):

```ts
function computeStrengthDiff(
  homeStrength,
  awayStrength,
  homeCoachBonus = 0,
  awayCoachBonus = 0,
): number {
  return homeStrength + HOME_COURT_ADVANTAGE + homeCoachBonus - awayStrength - awayCoachBonus;
}
```

`HOME_COURT_ADVANTAGE = 1.1` rating points — small because a strength point is now worth 2.31 points of margin, so 3 would imply a ~7-point home edge. The coach bonuses are kept _out_ of the
team-strength number itself (so strength stays a pure-player signal reused
elsewhere) and added here instead.

**Win probability and score come from one distribution.**

A game is a **point margin drawn from a normal centred on the strength
differential**; the winner is simply the sign of that margin.

```ts
const MARGIN_PER_STRENGTH_POINT = 2.31; // expected margin per point of strength
const MARGIN_SD = 15;                   // spread of a single game around it

function computeHomeWinProbability(homeStrength, awayStrength, homeCoachBonus=0, awayCoachBonus=0) {
  const diff = computeStrengthDiff(...);
  // Literally "how often is this margin positive".
  return standardNormalCdf((diff * MARGIN_PER_STRENGTH_POINT) / MARGIN_SD);
}

function simulateGame(homeStrength, awayStrength, rng = Math.random, ...) {
  const expectedMargin = diff * MARGIN_PER_STRENGTH_POINT;
  let homeMargin = Math.round(expectedMargin + gaussian(rng) * MARGIN_SD);
  if (homeMargin === 0) homeMargin = expectedMargin >= 0 ? 1 : -1;  // no ties

  const combined = Math.round(AVERAGE_COMBINED_SCORE + gaussian(rng) * COMBINED_SCORE_SD);
  const loserScore = Math.max(MIN_TEAM_SCORE, Math.round((combined - Math.abs(homeMargin)) / 2));
  const winnerScore = loserScore + Math.abs(homeMargin);
  // ...winner assigned by the sign of homeMargin
}
```

- **Why margin-first.** The previous model drew the winner from a logistic curve
  and then drew the margin from a bounded uniform `[3, 22]` that never looked at
  team strength. Measured over 246,000 games: a 97.5% favourite beat a hopeless
  team by the same margin distribution as a coin flip (12.49 points in both), not
  one game was decided by 1–2 points, and not one exceeded 22. One distribution
  fixes all three and makes probability and margin consistent by construction.
- **The two constants are tuned as a pair** — only their *ratio* sets win
  probability. See `docs/SIMULATION_AUDIT.md` for the calibration.
- **`rng` is a parameter** — inject a seeded generator in tests (Rule 4 from the
  code-guide README). Each `gaussian()` consumes two `rng()` values via
  Box-Muller, so seeded sequences stay reproducible.

## `simulation/boxScore.ts` — team result → player lines

`generateBoxScore(...)` distributes a team's final score across its players using
their minutes/role, so each game produces plausible per-player stat lines _derived
from_ the team result (not simulated possession-by-possession). This is the
documented approximation — fast and believable, but not emergent.

## `actions/simulation.ts` — the chunked persistence loop

This is the shell that runs many games and writes them without timing out.

```ts
type SimulateTarget = "NEXT_GAME" | "NEXT_10_GAMES";
const TARGET_USER_GAMES = { NEXT_GAME: 1, NEXT_10_GAMES: 10 };
const CHUNK_SIZE = 50; // max games resolved per inner pass
```

The logic (conceptually):

```
compute every team's strength once
loop:
  pull the next up-to-CHUNK_SIZE unplayed games in chronological order (by dayIndex/gameNumber)
  for each game in the chunk:
      simulateGame(homeStrength, awayStrength, rng, coach bonuses)
      generateBoxScore(...)
  applyLeagueEvents(...)      // injuries, milestones, streaks for this window
  applyPlayerMoraleEvents(...)
  persist the chunk's games + box scores + events to the DB
  stop once the USER'S team has completed TARGET_USER_GAMES
```

**Why chunk (the key engineering point):** a full season is ~1,230 games, each a DB
write; doing all of it in one serverless request would exceed the function time
limit. Chunking bounds each pass, and because games resolve in **chronological
order across all teams**, every team's schedule advances together — you never end
up with your team 10 games ahead of the league.

**Why compute strength once, not per game:** strength only changes at roster events,
so recomputing it inside the game loop would be wasted work. It's hoisted out — an
O(games × players) mistake avoided, kept at O(teams × players) + O(games).

## The playoff variants

- `simulateSeries.ts` — repeatedly `simulateGame` until one team reaches 4 wins,
  flipping home court by seed. Reuses `computeStrengthDiff` so it can't drift from
  the regular-season model.
- `simulateLiveGame.ts` — a quarter-by-quarter version for the "watch it live"
  playoff view, again reusing the same strength differential.
- `playoffSeeding.ts` / `playInTournament.ts` — order the bracket and run the 7–10
  play-in.

## Complexity recap

- one game: **O(1)**; a chunk of G games: **O(G)**; team strength: **O(P log P)** per
  team (the sort), done once. The real cost is the DB writes per game, which is
  exactly what the chunking is designed around.
