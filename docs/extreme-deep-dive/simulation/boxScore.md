# `simulation/boxScore.ts` — turning a team score into individual player stat lines

**What this whole file is about:** `simulateGame` already decided the final score (say 112–105). But
a real box score has _individual_ lines — this player scored 24, that one grabbed 11 rebounds. This
file invents those individual lines so they're believable **and** add up exactly to the team's already-
decided score. It's the biggest file we've done, so I'll walk the four stages and explain the important
parts. Some of it is statistical fine-tuning — I'll flag those as "tuning knobs" you can skim.

Open the real file: `src/lib/simulation/boxScore.ts`. Big-picture, it works in four stages:

1. **Minutes** — split 240 team-minutes among the players.
2. **Priors** — figure out each player's expected per-minute production.
3. **Generate** — turn minutes + priors into a raw stat line, with luck.
4. **Reconcile** — nudge everyone's scoring so the team total exactly matches the decided score.

---

## The setup

```ts
const TEAM_MINUTES = 240;
const GARBAGE_TIME_MARGIN_FLOOR = 15;
const GARBAGE_TIME_MARGIN_CEIL = 40;
const DEEP_BENCH_SCRATCH_RANK = 9; // rank >= this can DNP-CD
const DEEP_BENCH_SCRATCH_CHANCE = 0.4;
```

- `TEAM_MINUTES = 240` — a basketball game is 48 minutes with 5 players on the floor, so `48 × 5 = 240`
  total "player-minutes" to hand out per team.
- The `GARBAGE_TIME_*` constants define a blowout (a lead between 15 and 40 points), where starters sit
  and the bench plays more.
- The `DEEP_BENCH_SCRATCH_*` constants mean a deep-bench player (rank 9 or worse) has a 40% chance of
  not playing at all ("DNP-CD" = did not play, coach's decision).

Two little random helpers appear near the top:

```ts
function triangular(rng: () => number, spread: number): number {
  return (rng() + rng() - 1) * spread;
}

function countSuccesses(attempts: number, pct: number, rng: () => number): number {
  let makes = 0;
  for (let i = 0; i < attempts; i++) {
    if (rng() < pct) makes++;
  }
  return makes;
}
```

- `triangular` produces a random nudge centered on 0 (adding two `rng()` rolls and subtracting 1 gives a
  value that clusters near the middle, like rolling two dice). `spread` scales how big the nudge can be.
  It's used all over this file to add believable variation.
- `countSuccesses` simulates "attempt this shot `attempts` times, each with `pct` chance of going in,
  and count the makes." It loops that many times, and each loop `if (rng() < pct) makes++` counts a make
  when the random roll beats the shooting percentage. This is exactly how the file turns "10 three-point
  attempts at 37%" into an actual number of makes.

---

## Stage 1 — allocating the 240 minutes (`allocateMinutes`)

```ts
export function allocateMinutes(
  roster,
  marginOfVictory,
  rng = Math.random,
  coachModifier?,
): Map<string, number> {
  const rotation = resolveRotation(roster);
  if (rotation.length === 0) return new Map();

  const garbageFactor = clamp(
    (marginOfVictory - GARBAGE_TIME_MARGIN_FLOOR) /
      (GARBAGE_TIME_MARGIN_CEIL - GARBAGE_TIME_MARGIN_FLOOR),
    0,
    1,
  );
  const scratchChance = clamp(
    DEEP_BENCH_SCRATCH_CHANCE - (coachModifier?.benchTrustDelta ?? 0) * 0.15,
    0.1,
    0.6,
  );

  const weights = rotation.map(({ player, rank, targetMinutes }) => {
    const baseWeight =
      targetMinutes !== null ? targetMinutes * WEIGHT_PER_MINUTE : (RANK_MINUTE_WEIGHTS[rank] ?? 0);
    if (baseWeight <= 0) return 0;
    if (rank >= DEEP_BENCH_SCRATCH_RANK && rng() < scratchChance) return 0;
    const ratingMultiplier = 0.8 + (player.overallRating / 99) * 0.2;
    const garbageMultiplier = rank < 5 ? 1 - 0.4 * garbageFactor : 1 + 0.5 * garbageFactor;
    const variance = 1 + triangular(rng, rank < DEEP_BENCH_SCRATCH_RANK ? 0.15 : 0.3);
    return Math.max(0, baseWeight * ratingMultiplier * garbageMultiplier * variance);
  });
  // ...normalize weights into minutes that sum to 240...
}
```

The idea: give each player a **weight** (how much they should play), then split 240 minutes in
proportion to the weights. Reading the important lines:

- `const rotation = resolveRotation(roster);` — ask the rotation system (its own file, later) "who
  plays, in what order?" Each entry has a `rank` (depth-chart position) and maybe a user-set
  `targetMinutes`.
- `garbageFactor` — `clamp(..., 0, 1)` turns the margin of victory into a 0-to-1 "how much of a blowout
  is this?" number. (`clamp` = force into a range, from earlier docs.)
- `scratchChance` — the chance a deep-bench player sits, nudged by a good coach playing his bench more.
- `.map(...)` builds a `weights` list, one per rotation player:
  - `baseWeight` — if the user set target minutes, use those (converted to weight units); otherwise use
    a default weight for that depth rank.
  - `if (rank >= 9 && rng() < scratchChance) return 0;` — a deep-bench player might randomly not play
    (weight 0).
  - `ratingMultiplier` — better players get a slightly higher weight (`0.8` to `1.0`).
  - `garbageMultiplier` — in a blowout, **starters** (rank < 5) get _less_ (`1 - 0.4 * garbageFactor`)
    and **bench** get _more_ (`1 + 0.5 * garbageFactor`). This is the "starters sit in a blowout" logic.
  - `variance` — a little random wobble via `triangular`.
- The rest (not shown) converts those weights into whole-number minutes that sum to exactly 240, with a
  small "residual" loop nudging the top players ±1 until it's exactly 240. The result is a `Map` from
  each player's id to their minutes.

**Skim-friendly summary:** better players and higher-rotation players get more minutes; blowouts shift
minutes to the bench; a deep-bench guy might sit; and it all adds up to exactly 240.

---

## Stage 2 — each player's expected per-minute rates (`derivePer36Prior`)

Before generating stats, the file estimates each player's expected production **per 36 minutes** — a
"prior" (a starting expectation). There are two cases:

- **`fictionalPrior(position, rating)`** — for generated draft players who have no real stats. It starts
  from hand-authored `POSITION_PROFILES` (e.g. a point guard's baseline is high assists, low rebounds; a
  center's is the reverse), anchored at rating 72, and shifts each stat up or down based on how far the
  player's rating is from 72. So a 90-rated center produces more than a 72-rated one.
- **`realPlayerPrior(position, realStat, currentRating)`** — for real players, who _do_ have real
  stats. This is the clever one:
  ```ts
  const ratio = clamp(currentRating / Math.max(baselineRating, 1), 0.5, 1.8);
  const countingRatio = 1 + (ratio - 1) * 0.85;
  // pts36 = per36(realStat.pointsPerGame) * countingRatio, etc.
  ```
  It takes the player's **real** per-36 stat line, then scales it by how much their _current in-game
  rating_ has drifted from the rating their real stats would earn. If a young player has **developed**
  (current rating higher than their old stats suggest), `ratio` is above 1, so their production scales
  **up**. If they've declined, it scales down. **This is what makes a player you developed actually put
  up better numbers in games** — not just have a higher rating.

The dense per-stat formulas here are tuning; the concept is what matters: **turn a rating + (maybe real
stats) into expected per-minute production.**

---

## Stage 3 — generating one raw stat line (`generateRawPlayerGame`)

```ts
const hot = 1 + triangular(rng, hotSpread); // this game's "hot or cold" luck
const minutesFactor = minutes / 36; // scale per-36 rates to actual minutes
// ...compute FG attempts, 3P attempts, FT attempts from the prior...
const fg3Made = countSuccesses(fg3Attempted, fg3Pct, rng);
const twoMade = countSuccesses(twoAttempted, twoPct, rng);
const ftMade = countSuccesses(ftAttempted, ftPct, rng);
const points = twoMade * 2 + fg3Made * 3 + ftMade;
```

For each player, using their prior and their minutes:

- A shared **`hot`** factor gives the player a hot or cold night (applied more to _volume_ — how many
  shots — than efficiency, so a big night reads as "took more shots," not "shot an impossible
  percentage"). A rare 6% chance makes it an outlier night.
- `minutesFactor = minutes / 36` scales the per-36 rates down to how much the player actually played.
- The file works out how many shots each type (2-pointers, 3-pointers, free throws) the player attempts,
  then uses `countSuccesses` to roll how many go in, and computes `points` from the makes (`× 2`, `× 3`,
  `× 1`). Rebounds, assists, steals, etc. are generated similarly.
- There's also a small "opponent adjustment" — you produce a touch less against a stronger opponent.

The result is one believable raw stat line per player — but the team totals won't _exactly_ match the
decided score yet. That's Stage 4.

---

## Stage 4 — making the totals match (`reconcilePoints`)

```ts
const scaleFactor = targetScore / rawTotal;
const rescaled = rawPlayers.map((p) => {
  const fgAttempted = Math.floor(p.fgAttempted * scaleFactor);
  // ...re-roll makes from the same shooting percentages...
});
// then nudge free throws (or downgrade a made 3 to a 2) until the total is exactly right
```

`simulateGame` said the team scored, say, 112. But the sum of the generated player points might be 108
or 117. This function fixes that:

- `scaleFactor = targetScore / rawTotal` — how much to scale everyone toward the target. If we generated
  108 but need 112, the factor is `112/108 ≈ 1.037`.
- It scales each player's **shot attempts** (not their points directly), then re-rolls the makes. Why
  attempts, not points? Because a valid box score requires makes ≤ attempts — scaling attempts keeps the
  math legal. Scaling points directly could produce "made 10 of 8 shots," which is impossible.
- After rescaling there's usually a tiny leftover (off by a point or two). A final loop adds or removes a
  made free throw (or downgrades a made three to a two) on the highest-minute players until the total is
  **exactly** right — "the last point or two just is what it is," like a real box score.
- A sibling helper `rescaleStatBand` does a light version for rebounds and assists, keeping team totals
  in a believable range (e.g. a team's rebounds between 28 and 58).

---

## The entry point (`generateBoxScore`)

```ts
export function generateBoxScore(
  rosters,
  homeScore,
  awayScore,
  rng = Math.random,
): PlayerBoxScoreLine[] {
  const margin = Math.abs(homeScore - awayScore);
  const homeMinutes = allocateMinutes(rosters.homeRoster, margin, rng, rosters.homeCoachModifier);
  const awayMinutes = allocateMinutes(rosters.awayRoster, margin, rng, rosters.awayCoachModifier);
  // ...generate raw lines for each player, then reconcile each team to its score...
  return [...homeReconciled, ...awayReconciled];
}
```

The conductor: it takes both rosters and the already-decided scores, allocates minutes for each team
(passing the margin so blowouts affect minutes), generates raw lines, reconciles each team's points to
its score, and returns every player's final line as one list.

---

## Zooming out

This is the most intricate file so far, but the _shape_ is simple: **the team score is decided first,
then this file explains it with believable individual lines that add back up to it.** The four stages —
minutes, priors, generate, reconcile — each have one job. The most important idea to carry away is the
"reconcile" trick: generate freely, then gently scale everyone toward the fixed target so the individual
stats and the team score never contradict each other. And the standout detail is that real players'
_production_ scales with how much they've developed or declined — so the seasons you play genuinely
change how players perform, not just their rating number.

**Next file:** `simulation/generateSchedule.md` — building the 82-game season calendar (with a neat bit
of matchup math).
