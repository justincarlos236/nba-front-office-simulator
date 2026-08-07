# 05 — Ratings, Contracts & Development (the player-value chain)

This traces one player's numbers end to end: **real stats → a rating → a contract →
growth/decline over seasons.** It spans `valuation/`, `contracts/`, `league/`,
`data-sources/`, and `development/`.

## Step 1 — Stats → a performance score (`valuation/playerValue.ts`)

`computePerformanceScore(stats)` is the workhorse rating formula used _during a
save_ (for trade/market valuation). Key ideas in the code:

```ts
const raw =
  72 +
  (pts - 15) * 0.85 +
  (reb - 5) * 0.8 +
  (ast - 3) * 1.1 +
  (stl - 1) * 2.2 +
  (blk - 0.5) * 2.2 +
  (tov - 1.5) * -1.6 +
  (trueShootingPct - 0.56) * 140;
```

- **72 is the anchor** — an average-starter statline scores ~72; every stat is
  measured as a _delta_ from a baseline and weighted.
- Counting stats are first partially **normalized toward a per-36-minute rate**
  (`MINUTES_NORMALIZATION_BLEND = 0.7`) so a bench player isn't punished twice for
  playing fewer minutes.
- A **sample-confidence** blend pulls very-low-minute players toward a
  replacement-level score (not enough evidence to trust a spiky rate).
- Final result is clamped to **60–99**.
- **Why hand-tuned, not fitted:** the free data has box scores only, so weights are
  calibrated against known real players (Jokić ~98, a bench big ~63) rather than a
  regression on advanced metrics it doesn't have. The code comment is honest about
  this ceiling.

## Step 2 — Two different rating entry points (important!)

There are **two** rating functions and it's worth knowing why:

| Function                                                  | Where            | Purpose                                                    |
| --------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| `computePerformanceScore` (valuation)                     | used _in-sim_    | "how good/valuable right now" for trades, market value, AI |
| `computeSeedOverallRating` (`data-sources/seedRating.ts`) | used _at import_ | the realistic **starting** rating baked into the dataset   |

They're separate on purpose (the **seed/sim boundary**): the seed model is tuned for
a believable _starting_ league (compressed top end, sample-size regression), while
the valuation model is tuned for _in-game economy_. `league/ratingFromStats.ts`
(`deriveOverallRating`) is a thin wrapper that rounds the performance score, used as
a fallback.

## Step 3 — Age → potential (`league/ratingFromStats.ts`, `data-sources/seedRating.ts`)

```ts
function derivePotentialRating(overall, age): number {
  const yearsOfUpside = Math.max(0, 26 - age);
  const headroom = Math.min(10, yearsOfUpside * 2);
  return Math.min(99, overall + headroom);
}
```

Young players get real headroom above their current rating; players past ~26 get
none (their "potential" is their current rating — further change is more likely
decline). Simple, and it makes youth valuable.

## Step 4 — Score → dollars → a contract (`valuation` + `contracts`)

**Market value** comes from a logistic map of rating → a fraction of the cap:

```ts
function scoreToCapFraction(score): number {
  // valuation/playerValue.ts
  const MAX = 0.35,
    MIDPOINT = 80,
    STEEPNESS = 0.17; // 0.35 ≈ a supermax
  return MAX / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)));
}
```

A rating of ~80 earns half of a max deal; the curve rises smoothly toward the
supermax ceiling. (Same logistic idea as the game model — reused shape.)

**`generateContract(input)`** (`contracts/generateContract.ts`) turns that into an
actual multi-year deal:

```ts
generateContract({ season, ageAdjustedScore, yearsOfExperience, seed }) → { startSeason, endSeason, years[] }
```

- `marketValueCents = cap × scoreToCapFraction(ageAdjustedScore)`.
- `rookieScaleDiscount(yearsOfExperience)` — 0.35 for a true rookie up to 1.0 for a
  4+-year vet (rookies are underpaid by rule).
- `negotiationNoise = randomInRange(rng, 0.85, 1.15)` — deterministic ±15% wiggle so
  not every equal player signs the identical deal.
- floor at roughly a veteran minimum (`emptyRosterChargeCents`).
- `pickContractLength` — stars get longer deals; scrubs get 1–2 years.
- each year gets a modest **5% raise** (`salary × (1 + 0.05·i)`), like real deals.
- **The `seed`** (usually the player id) feeds `createSeededRandom(seed)` so
  re-running the seed script produces the _same_ contracts — reproducibility, not
  fresh randomness every run.

## Step 5 — Wiring it at league creation (`league/planLeaguePlayer.ts`)

`planLeaguePlayer` is the pure function that bundles steps 1–4 for one player at
bootstrap:

```ts
planLeaguePlayer({ season, age, yearsOfExperience, stats, seed }) → { overallRating, potentialRating, contract }
```

It computes the rating, the potential, an age-adjusted score
(`performanceScore × ageValueMultiplier(age)` from `valuation/ageCurve.ts`), and
then the contract. The bootstrap action (`createLeagueAction`) calls this once per
player — but note (from our data-pipeline work) it now uses the **stored seed
rating** for the LeaguePlayer's overall and keeps `planLeaguePlayer` mainly for the
_contract_.

## Step 6 — Growth & decline over seasons (`development/developPlayerRating.ts`)

Each offseason, players move toward (young) or away from (old) their potential:

- Young players below their `potentialRating` gain, faster with a good **development
  coach** and better **facilities investment** (small bonuses passed in as params).
- Older players decline along an age curve.
- The movement is bounded so no one leaps or collapses overnight.

This is why a save has a _timeline_: the same player you drafted at 68/85 potential
can become an 85 overall five seasons later — entirely inside your league, never
re-synced from real data.

## The chain in one picture

```
real stats ─► computePerformanceScore ─► rating (60–99)
     │                                      │
     ├─ age ─► derivePotentialRating ───────┤
     │                                      ▼
     └─ ageAdjustedScore ─► scoreToCapFraction ─► marketValue ─► generateContract(seed) ─► ContractYears
                                                                         │
each offseason:  developPlayerRating(rating, potential, age, coach, facilities) ─► new rating
```

## Interview-ready one-liners

- "Ratings come from a hand-tuned box-score composite anchored so an average
  starter is ~72, with per-36 normalization and sample-size regression so bench and
  small-sample players aren't mis-rated."
- "There are deliberately two rating functions — one for realistic _starting_
  ratings at import, one for in-game _valuation_ — because they optimize for
  different things; that's the seed/sim boundary in code."
- "Contracts are generated from a logistic rating→cap-fraction curve plus a
  seeded ±15% negotiation noise, so they're realistic _and_ reproducible."
