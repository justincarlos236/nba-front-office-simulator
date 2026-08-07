# `simulation/teamStrength.ts` — turning a roster into one "team strength" number

**What this whole file is about:** to simulate a game, the sim needs to compare two teams. But a team
is ~15 players with different ratings — how do you get one number for the whole team? This file does
that. And it doesn't just average the ratings: it weights the **best players more heavily**, because
in real basketball your stars matter far more than your 15th man.

Open the real file: `src/lib/simulation/teamStrength.ts`. It's short and teaches weighted averages and
sorting.

---

## Part 1 — the weighting settings

```ts
const ROTATION_SIZE = 9;
const ROTATION_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
const BENCH_WEIGHT = 0.4;
```

- `ROTATION_SIZE = 9` — a real NBA team's "rotation" (the players who actually play meaningful
  minutes) is about 9 deep.
- `ROTATION_WEIGHTS = [1.4, 1.3, ...]` — a **list** of nine weights, one for each rotation player,
  ordered best to worst. The team's best player counts the most (weight `1.4`), the 9th-best counts
  `0.6`. (Lists are written in square brackets; these nine numbers are read by position.)
- `BENCH_WEIGHT = 0.4` — everyone _past_ the top 9 (deep bench) counts only `0.4` — they barely move
  the needle.

So the idea: your top players dominate the team's strength; your bench matters a little.

---

## Part 2 — the machine

```ts
export function computeTeamStrength(playerRatings: number[]): number {
  if (playerRatings.length === 0) return 0;

  const sorted = [...playerRatings].sort((a, b) => b - a);
  let weightedSum = 0;
  let weightTotal = 0;

  sorted.forEach((rating, i) => {
    const weight = i < ROTATION_SIZE ? ROTATION_WEIGHTS[i] : BENCH_WEIGHT;
    weightedSum += rating * weight;
    weightTotal += weight;
  });

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
```

**The signature:** `computeTeamStrength(playerRatings: number[]): number` — takes a **list of numbers**
(the players' ratings) and hands back one number (the team's strength).

**Step 1 — handle an empty roster:**

```ts
if (playerRatings.length === 0) return 0;
```

- If the list is empty (`.length === 0`), there are no players, so strength is `0`. This also prevents
  dividing by zero later.

**Step 2 — sort the ratings, best first:**

```ts
const sorted = [...playerRatings].sort((a, b) => b - a);
```

- `[...playerRatings]` makes a **copy** of the list first (so we don't scramble the original — a
  courtesy so the caller's data is untouched).
- `.sort((a, b) => b - a)` sorts the copy. The mini-function `(a, b) => b - a` is the "which comes
  first?" rule. When it returns a **positive** number, `b` goes before `a`; so `b - a` being positive
  (meaning `b` is bigger) puts bigger numbers first. In short, **`(a, b) => b - a` sorts
  highest-to-lowest.** (The reverse, `a - b`, would sort lowest-to-highest.)
- Now `sorted` has the best player at position 0, next best at 1, and so on — which is exactly the
  order our weights list expects.

**Step 3 — set up two running totals:**

```ts
let weightedSum = 0;
let weightTotal = 0;
```

- These are `let` (changeable) because we'll add to them in the loop. We're computing a **weighted
  average**, which needs two totals: the sum of (rating × weight), and the sum of the weights.

**Step 4 — loop over every player, applying its weight:**

```ts
sorted.forEach((rating, i) => {
  const weight = i < ROTATION_SIZE ? ROTATION_WEIGHTS[i] : BENCH_WEIGHT;
  weightedSum += rating * weight;
  weightTotal += weight;
});
```

- `.forEach(...)` runs a mini-function **once for each item** in the list. Here it gives us two things
  each time: `rating` (the player's rating) and `i` (their position: 0, 1, 2, …). Unlike `.map`,
  `.forEach` doesn't build a new list — it just _does something_ each time (here, adding to our
  totals).
- `const weight = i < ROTATION_SIZE ? ROTATION_WEIGHTS[i] : BENCH_WEIGHT;` — a ternary picking this
  player's weight: **if** they're in the top 9 (`i < 9`), use the matching rotation weight from the
  list (`ROTATION_WEIGHTS[i]` — the weight at their position); **otherwise** (deep bench) use the flat
  `0.4`.
- `weightedSum += rating * weight;` — add this player's _weighted_ rating to the running total.
- `weightTotal += weight;` — add this player's weight to the weight total.

**Step 5 — finish the weighted average:**

```ts
return weightTotal > 0 ? weightedSum / weightTotal : 0;
```

- A weighted average is "sum of (value × weight) ÷ sum of weights." So we divide `weightedSum` by
  `weightTotal`. The ternary guards against dividing by zero (if somehow `weightTotal` is 0, return
  0). The result is a single strength number on roughly the same 60–99 scale as player ratings.

**Why weighted, not a plain average?** A team of one 99-rated superstar and fourteen 60s is _not_ the
same as fifteen 70s, even though a plain average might rate them similarly. The weighting makes the
superstar's rating dominate — which is how real basketball works.

---

## Zooming out

One number, `computeTeamStrength`, is the foundation of the whole simulation: it's what the game
model compares to decide who wins. And it's reused beyond the sim — the GM expectation system and the
trade AI both ask "how strong is this roster?" through it. It's pure and tiny, but it's the hinge the
entire on-court side of the sim turns on.

**Next file:** `simulation/simulateGame.md` — using two teams' strengths to decide who wins and
produce a score.
