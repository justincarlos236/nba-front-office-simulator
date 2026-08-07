# Deep Dive 01 — Cap, Trades & Player Value (with real code)

Folders: `src/lib/cap/`, `src/lib/trade/`, `src/lib/valuation/`,
`src/lib/contracts/`. All pure (no DB). **Every code block below is the real source**
— read it, then read the explanation under it.

**Flow:** stats → valuation (how good / how much $ / how tradeable) → contracts →
cap sheets → apron level → trade legality → CPU accept/reject.

---

# Part 1 — `cap/`

## `cap/constants.ts`

The data shape and the accessor everything uses:

```ts
export interface SeasonCapRules {
  season: number; // e.g. 2025 => the 2025-26 season
  salaryCapCents: bigint;
  luxuryTaxCents: bigint;
  firstApronCents: bigint;
  secondApronCents: bigint;
  nonTaxpayerMLECents: bigint;
  taxpayerMLECents: bigint;
  roomMLECents: bigint;
  biAnnualExceptionCents: bigint;
  emptyRosterChargeCents: bigint; // cap hold charged per roster spot below 12 signed players
  tradeMatchLowerBreakpointCents: bigint;
  tradeMatchUpperBreakpointCents: bigint;
}
```

One entry of the hardcoded table (real 2025-26 figures):

```ts
{
  season: 2025,
  salaryCapCents: 154_647_000_00n,
  luxuryTaxCents: 187_895_000_00n,
  firstApronCents: 195_945_000_00n,
  secondApronCents: 207_824_000_00n,
  // ...exception amounts...
  tradeMatchLowerBreakpointCents: 7_950_000_00n,
  tradeMatchUpperBreakpointCents: 33_000_000_00n,
},
```

> Note the number style: `154_647_000_00n`. The `_` are just visual separators, and
> the trailing `n` makes it a `BigInt`. Read it as `$154,647,000` written in **cents**
> (…`_00`). This is the "money is integer cents" rule in the raw.

The accessor:

```ts
const CAP_GROWTH_RATE = 0.05;

function scaleCents(cents: bigint, factor: number): bigint {
  return BigInt(Math.round(Number(cents) * factor));
}

export function getSeasonCapRules(season: number): SeasonCapRules {
  const exact = SEASON_CAP_RULES.find((rules) => rules.season === season);
  if (exact) return exact;

  const latest = SEASON_CAP_RULES[SEASON_CAP_RULES.length - 1];
  if (season > latest.season) {
    const factor = (1 + CAP_GROWTH_RATE) ** (season - latest.season);
    return {
      season,
      salaryCapCents: scaleCents(latest.salaryCapCents, factor),
      // ...every other field scaled the same way...
    };
  }

  const closest = [...SEASON_CAP_RULES].sort(
    (a, b) => Math.abs(a.season - season) - Math.abs(b.season - season),
  )[0];
  if (!closest) throw new Error("No season cap rules configured");
  return closest;
}
```

**What it does:** exact season → return it; a _future_ season → scale every figure by
`1.05^(yearsAhead)` (so a save that runs past the hand-entered years keeps a growing
cap); a season _before_ the table → the nearest known season (never throws).
**Why:** callers can ask for any season and always get valid numbers, and no other
file hardcodes a dollar amount.

---

## `cap/apron.ts` (the whole file)

```ts
export enum ApronLevel {
  UNDER_CAP = "UNDER_CAP",
  BETWEEN_CAP_AND_TAX = "BETWEEN_CAP_AND_TAX",
  TAXPAYER = "TAXPAYER",
  FIRST_APRON = "FIRST_APRON",
  SECOND_APRON = "SECOND_APRON",
}

export function getApronLevel(totalSalaryCents: bigint, rules: SeasonCapRules): ApronLevel {
  if (totalSalaryCents >= rules.secondApronCents) return ApronLevel.SECOND_APRON;
  if (totalSalaryCents >= rules.firstApronCents) return ApronLevel.FIRST_APRON;
  if (totalSalaryCents >= rules.luxuryTaxCents) return ApronLevel.TAXPAYER;
  if (totalSalaryCents >= rules.salaryCapCents) return ApronLevel.BETWEEN_CAP_AND_TAX;
  return ApronLevel.UNDER_CAP;
}

export function eligibleMidLevelException(
  level: ApronLevel,
): "ROOM" | "NON_TAXPAYER" | "TAXPAYER" | null {
  switch (level) {
    case ApronLevel.UNDER_CAP:
      return "ROOM";
    case ApronLevel.BETWEEN_CAP_AND_TAX:
    case ApronLevel.TAXPAYER:
      return "NON_TAXPAYER";
    case ApronLevel.FIRST_APRON:
      return "TAXPAYER";
    case ApronLevel.SECOND_APRON:
      return null; // hard-capped out of every MLE
  }
}

export function canUseBiAnnualException(level: ApronLevel): boolean {
  return level !== ApronLevel.SECOND_APRON;
}
```

**What it does:** `getApronLevel` is a descending threshold check — one number in,
one of five labels out. That label is the _currency_ of the whole cap system: the two
exception functions show how "spend more → fewer tools" is encoded as a
level→privilege mapping.

---

## `cap/capSheet.ts`

```ts
const MIN_ROSTER_SIZE_FOR_CAP_PURPOSES = 12;

export function computeCapSheet(input: CapSheetInput): CapSheet {
  const rules = getSeasonCapRules(input.season);

  const committedSalaryCents = input.contracts.reduce(
    (sum, contract) => sum + contract.salaryCents,
    0n,
  );
  const deadMoneyCents = input.deadMoneyCents ?? 0n;
  const retainedSalaryCents = input.retainedSalaryCents ?? 0n;

  const emptyRosterSpots = Math.max(0, MIN_ROSTER_SIZE_FOR_CAP_PURPOSES - input.contracts.length);
  const emptyRosterChargeCents = rules.emptyRosterChargeCents * BigInt(emptyRosterSpots);

  const totalSalaryCents =
    committedSalaryCents + deadMoneyCents + retainedSalaryCents + emptyRosterChargeCents;

  const apronLevel = getApronLevel(totalSalaryCents, rules);
  const capSpaceCents =
    totalSalaryCents < rules.salaryCapCents ? rules.salaryCapCents - totalSalaryCents : 0n;

  return {
    season: input.season,
    committedSalaryCents,
    deadMoneyCents: deadMoneyCents + retainedSalaryCents,
    emptyRosterChargeCents,
    totalSalaryCents,
    apronLevel,
    capSpaceCents,
    distanceToFirstApronCents: rules.firstApronCents - totalSalaryCents,
    distanceToSecondApronCents: rules.secondApronCents - totalSalaryCents,
  };
}
```

**Line by line:** sum the contract salaries → add dead money, retained salary, and a
charge for every empty roster spot below 12 (so a near-empty team can't fake huge cap
space) → that total decides the apron level and cap space. `distanceTo*Apron` goes
negative once you're past a threshold. Pure `BigInt` math, so its test file checks
many scenarios with plain arrays.

---

## `cap/capStatusLabel.ts` (display sugar)

```ts
export function simplifyCapStatus(level: ApronLevel): SimpleCapStatus {
  if (level === ApronLevel.UNDER_CAP) return "UNDER_CAP";
  if (level === ApronLevel.BETWEEN_CAP_AND_TAX) return "OVER_CAP";
  return "LUXURY_TAX"; // TAXPAYER | FIRST_APRON | SECOND_APRON
}
```

Collapses the 5 real apron levels into 3 casual-facing states for the UI. The real
5-level distinctions still drive actual rules underneath — this only changes what's
_shown_.

---

## `cap/multiYearProjection.ts`

```ts
export function computeMultiYearProjection(
  contractYears: ContractYearForProjection[],
  startSeason: number,
  yearsAhead: number,
): SeasonProjection[] {
  const seasons = Array.from({ length: yearsAhead }, (_, i) => startSeason + i);
  return seasons.map((season) => {
    const rows = contractYears.filter((cy) => cy.season === season);
    const committedSalaryCents = rows.reduce((sum, cy) => sum + cy.salaryCents, 0n);
    const rules = getSeasonCapRules(season);
    const projectedCapSpaceCents =
      committedSalaryCents < rules.salaryCapCents
        ? rules.salaryCapCents - committedSalaryCents
        : 0n;
    return {
      season,
      committedSalaryCents,
      projectedCapSpaceCents,
      playersUnderContract: rows.length,
    };
  });
}
```

For each future season, sums the contract years **already on the books** for it (no
assumed new signings) → shows how much of a future season is already spoken for. That
_is_ what "long contracts hurt future flexibility" means.

---

## `cap/financialFlexibilityGrade.ts`

```ts
const APRON_PENALTY: Record<ApronLevel, number> = {
  [ApronLevel.UNDER_CAP]: 0,
  [ApronLevel.BETWEEN_CAP_AND_TAX]: 8,
  [ApronLevel.TAXPAYER]: 16,
  [ApronLevel.FIRST_APRON]: 26,
  [ApronLevel.SECOND_APRON]: 38,
};
const LONG_TERM_YEARS_THRESHOLD = 3;
const LONG_TERM_SALARY_FRACTION_THRESHOLD = 0.15;
const LONG_TERM_CONTRACT_PENALTY = 6;
const MAX_LONG_TERM_PENALTY = 18;

export function computeFinancialFlexibilityGrade(
  currentApronLevel,
  futureProjections,
  contracts,
  currentSeasonCapCents,
): FinancialFlexibilityResult {
  let score = 100;
  score -= APRON_PENALTY[currentApronLevel];

  for (const projection of futureProjections) {
    const rules = getSeasonCapRules(projection.season);
    const fraction = Number(projection.committedSalaryCents) / Number(rules.salaryCapCents);
    score -= Math.max(0, fraction - 0.4) * 20; // being over-committed far ahead costs points every year
  }

  let longTermPenalty = 0;
  for (const contract of contracts) {
    const fraction = Number(contract.currentSalaryCents) / Number(currentSeasonCapCents);
    if (
      contract.yearsRemaining >= LONG_TERM_YEARS_THRESHOLD &&
      fraction >= LONG_TERM_SALARY_FRACTION_THRESHOLD
    ) {
      longTermPenalty += LONG_TERM_CONTRACT_PENALTY; // the "albatross" deal
    }
  }
  score -= Math.min(MAX_LONG_TERM_PENALTY, longTermPenalty);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade, summary: GRADE_SUMMARY[grade] };
}
```

Starts at 100, subtracts an apron penalty, a penalty for each future season it's
heavily committed, and a per-"albatross" (long + expensive) contract penalty → maps to
an A–F letter. One number a casual user reads instead of studying several cap sheets.

---

# Part 2 — `trade/`

## `trade/salaryMatching.ts` (the real CBA formula)

```ts
const FLEXIBLE_MATCH_BONUS_CENTS = 250_000_00n;

export function maxIncomingSalaryCents(
  outgoingSalaryCents: bigint,
  apronLevel: ApronLevel,
  rules: SeasonCapRules,
): bigint {
  if (outgoingSalaryCents <= 0n) return 0n;
  if (apronLevel === ApronLevel.SECOND_APRON) return outgoingSalaryCents; // 100%
  if (apronLevel === ApronLevel.FIRST_APRON) return (outgoingSalaryCents * 110n) / 100n; // 110%
  if (outgoingSalaryCents <= rules.tradeMatchLowerBreakpointCents)
    return outgoingSalaryCents * 2n + FLEXIBLE_MATCH_BONUS_CENTS; // 200% + $250k
  if (outgoingSalaryCents <= rules.tradeMatchUpperBreakpointCents)
    return outgoingSalaryCents + rules.tradeMatchLowerBreakpointCents; // flat add-on
  return (outgoingSalaryCents * 125n) / 100n + FLEXIBLE_MATCH_BONUS_CENTS; // 125% + $250k
}

export function canAggregateSalaries(apronLevel: ApronLevel): boolean {
  return apronLevel !== ApronLevel.SECOND_APRON;
}
export function isUnderCapSpace(apronLevel: ApronLevel): boolean {
  return apronLevel === ApronLevel.UNDER_CAP;
}
```

**The real 2023-CBA matching bands:** small outgoing salaries can bring back up to
200%+$250k, mid-range a flat add-on, large ones 125%+$250k — and the aprons strip the
generosity (110% at the first apron, exactly 100% / no aggregation at the second). All
`BigInt` (`110n`, `/ 100n`).

## `trade/validateTrade.ts`

The asset shape and violation codes:

```ts
export type TradeAssetInput =
  | {
      type: "PLAYER";
      fromTeamId: string;
      toTeamId: string;
      playerId: string;
      salaryCents: bigint;
      noTradeClause?: boolean;
    }
  | {
      type: "DRAFT_PICK";
      fromTeamId: string;
      toTeamId: string;
      pickId: string;
      season: number;
      round: 1 | 2;
    }
  | { type: "CASH"; fromTeamId: string; toTeamId: string; amountCents: bigint };

export interface TradeViolation {
  rule:
    | "SALARY_MATCHING"
    | "NO_AGGREGATION_AT_SECOND_APRON"
    | "NO_TRADE_CLAUSE"
    | "STEPIEN_RULE"
    | "MISSING_TEAM_CAP_STATE"
    | "INVALID_STRUCTURE";
  teamId?: string;
  message: string;
}
```

The salary-matching heart of the loop (per team):

```ts
const outgoingPlayers = input.assets.filter(
  (a): a is Extract<TradeAssetInput, { type: "PLAYER" }> =>
    a.type === "PLAYER" && a.fromTeamId === teamId,
);
const incomingPlayers = input.assets.filter(
  (a): a is Extract<TradeAssetInput, { type: "PLAYER" }> =>
    a.type === "PLAYER" && a.toTeamId === teamId,
);
const outgoingSalaryCents = outgoingPlayers.reduce((sum, p) => sum + p.salaryCents, 0n);
const incomingSalaryCents = incomingPlayers.reduce((sum, p) => sum + p.salaryCents, 0n);
if (incomingSalaryCents === 0n) continue;

if (isUnderCapSpace(capState.apronLevel)) {
  const availableRoomCents = capState.capSpaceCents + outgoingSalaryCents;
  if (incomingSalaryCents > availableRoomCents) {
    violations.push({ rule: "SALARY_MATCHING", teamId, message: `...` });
  }
  continue;
}
const maxIncoming = maxIncomingSalaryCents(outgoingSalaryCents, capState.apronLevel, rules);
if (incomingSalaryCents > maxIncoming) {
  violations.push({ rule: "SALARY_MATCHING", teamId, message: `...` });
}
```

Note the **type-guard filter** `(a): a is Extract<TradeAssetInput,{type:"PLAYER"}>` —
it narrows the union so `.salaryCents` is available with no cast. A cap-space team just
needs incoming to fit `capSpace + outgoing`; an over-the-cap team is held to
`maxIncomingSalaryCents`.

The Stepien rule (can't be pick-less in back-to-back future drafts):

```ts
const remainingOwnedSeasons = new Set(
  capState.ownedFutureFirstRoundPickSeasons.filter((s) => !seasonsLosingPick.has(s)),
);
for (const season of seasonsLosingPick) {
  const hasNextYear = remainingOwnedSeasons.has(season + 1);
  const hasPriorYear = remainingOwnedSeasons.has(season - 1);
  if (!hasNextYear && !hasPriorYear) {
    violations.push({ rule: "STEPIEN_RULE", teamId, message: `...consecutive future years.` });
  }
}
```

**Whole-function purity payoff:** this exact function runs in the browser (live trade
preview), the server (authoritative gate), and the AI tools — one implementation,
zero drift.

## `trade/evaluateTradeOffer.ts` (the CPU brain)

The untouchable gate:

```ts
function isUntouchable(player, rosterRatingsDesc, identity): boolean {
  if (getPlayerValueTier(player.overallRating) === "SUPERSTAR") return true;
  if (!UNTOUCHABLE_IDENTITIES.includes(identity)) return false; // CONTENDER | PLAYOFF_TEAM
  const topThreshold = rosterRatingsDesc[Math.min(UNTOUCHABLE_COUNT, rosterRatingsDesc.length) - 1];
  return topThreshold !== undefined && player.overallRating >= topThreshold;
}
```

The decision core:

```ts
// incoming value, with personality + identity + need adjustments
let totalIncomingCents = 0n;
for (const asset of input.incoming) {
  if (asset.type === "PLAYER") {
    let value = objectivePlayerValue(asset, input.currentSeason);
    if (asset.age <= YOUNG_AGE_THRESHOLD) {
      value = scaleCents(value, weights.youthValueMultiplier);
      if (isRebuildingIdentity) value = scaleCents(value, REBUILDING_YOUTH_PICK_BONUS);
    }
    if (asset.age >= VETERAN_AGE_THRESHOLD) {
      value = scaleCents(value, weights.veteranValueMultiplier);
      if (isWinNowIdentity) value = scaleCents(value, CONTENDER_VETERAN_BONUS);
    }
    if (needs.some((need) => playerFillsNeed(asset, need))) {
      value = scaleCents(value, NEED_FIT_BONUS_MULTIPLIER);
      reasons.add("FILLS_A_NEED");
    }
    totalIncomingCents += value;
  } else {
    /* pick value × pickValueMultiplier, +bonus if rebuilding */
  }
}

// hard untouchable gate
for (const asset of input.outgoing) {
  if (asset.type !== "PLAYER" || !isUntouchable(asset, rosterRatingsDesc, identity)) continue;
  const requiredOverpayCents = scaleCents(
    objectivePlayerValue(asset, input.currentSeason),
    UNTOUCHABLE_OVERPAY_MULTIPLIER,
  );
  if (totalIncomingCents < requiredOverpayCents)
    return { decision: "REJECT", score: 0, reasons: ["UNTOUCHABLE_PLAYER"] };
}

// ...compute totalOutgoingCents...
const score =
  totalOutgoingCents > 0n
    ? Number(totalIncomingCents) / Number(totalOutgoingCents)
    : totalIncomingCents > 0n
      ? Infinity
      : 1;
const effectiveAcceptThreshold = ACCEPT_THRESHOLD * weights.acceptanceThresholdMultiplier; // 0.95 × …
const effectiveCounterThreshold = COUNTER_THRESHOLD * weights.acceptanceThresholdMultiplier; // 0.75 × …
let decision =
  score >= effectiveAcceptThreshold
    ? "ACCEPT"
    : score >= effectiveCounterThreshold
      ? "COUNTER"
      : "REJECT";
```

**What it does:** value the incoming assets with bounded personality/identity/need
multipliers, hard-reject if an outgoing player is untouchable and the overpay is < 1.75×
their value, then decide on the incoming/outgoing **ratio** vs personality-scaled
thresholds. Because the nudges are bounded, no personality can be tricked into a
robbery (there's a test asserting exactly that).

---

# Part 3 — `valuation/`

## `valuation/playerValue.ts`

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

  const sampleWeight = Math.min(1, stats.minutesPerGame / CONFIDENCE_MINUTES); // 16
  const blended = sampleWeight * raw + (1 - sampleWeight) * REPLACEMENT_LEVEL_SCORE; // 65
  return Math.min(99, Math.max(60, blended));
}

export function scoreToCapFraction(score: number): number {
  const MAX_CAP_FRACTION = 0.35; // ~a supermax
  const MIDPOINT = 80;
  const STEEPNESS = 0.17;
  return MAX_CAP_FRACTION / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)));
}
```

`raw` anchors an average starter at **72** and adds weighted deltas from per-stat
baselines. `normalizedRate` (not shown) blends each counting stat 70% toward a per-36
rate so bench players aren't double-penalized; the `sampleWeight` blend pulls
very-low-minute players toward a replacement level of 65. `scoreToCapFraction` is a
logistic map rating→dollars (0.35 max, half at a rating of 80).

## `valuation/ageCurve.ts` (whole file)

```ts
const PEAK_AGE = 27;

export function ageValueMultiplier(age: number): number {
  const distanceFromPeak = age - PEAK_AGE;
  if (distanceFromPeak <= 0) {
    return Math.min(1.15, 1 + Math.abs(distanceFromPeak) * 0.015); // mild youth premium, capped
  }
  const yearsPastPeak = distanceFromPeak;
  const discount = yearsPastPeak * 0.02 + Math.max(0, yearsPastPeak - 5) * 0.03; // accelerating
  return Math.max(0.4, 1 - discount);
}
```

Peak value at 27; a small rising premium before it (capped at 1.15×), an accelerating
discount after (floored at 0.4×). Teams pay for youth's upside and discount decline.

## `valuation/playerValueTier.ts`

```ts
export function getPlayerValueTier(overallRating: number): PlayerValueTier {
  if (overallRating >= 90) return "SUPERSTAR";
  if (overallRating >= 80) return "STAR";
  if (overallRating >= 72) return "STARTER";
  if (overallRating >= 65) return "ROTATION";
  return "MINIMUM";
}
```

Buckets a rating into a casual tier — used by the trade AI's untouchable/need logic and
the UI.

---

# Part 4 — `contracts/`

## `contracts/seededRandom.ts` (whole file)

```ts
function hashStringToUint32(seed: string): number {
  let hash = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string): () => number {
  let state = hashStringToUint32(seed); // mulberry32
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
```

Hashes a string seed (FNV-1a) into a small fast PRNG (mulberry32). Same seed →
identical stream, so re-running the seed script reproduces the same contracts.

## `contracts/generateContract.ts`

```ts
export function generateContract(input: GenerateContractInput): GeneratedContract {
  const rules = getSeasonCapRules(input.season);
  const rng = createSeededRandom(input.seed);

  const marketValueCents = BigInt(
    Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(input.ageAdjustedScore)),
  );
  const discount = rookieScaleDiscount(input.yearsOfExperience); // 0.35..1.0
  const negotiationNoise = randomInRange(rng, 0.85, 1.15); // deterministic ±15%
  const rawSalaryCents = BigInt(Math.round(Number(marketValueCents) * discount * negotiationNoise));

  const floorCents = rules.emptyRosterChargeCents; // ~veteran minimum
  const firstYearSalaryCents = rawSalaryCents < floorCents ? floorCents : rawSalaryCents;

  const lengthYears = pickContractLength(input.ageAdjustedScore, rng);
  const endSeason = input.season + lengthYears - 1;

  const years: GeneratedContractYear[] = [];
  for (let i = 0; i < lengthYears; i++) {
    const salaryCents = BigInt(Math.round(Number(firstYearSalaryCents) * (1 + 0.05 * i))); // 5% raise/yr
    years.push({ season: input.season + i, salaryCents, guaranteedCents: salaryCents });
  }
  return { startSeason: input.season, endSeason, years };
}
```

The helpers it uses:

```ts
function rookieScaleDiscount(yearsOfExperience: number): number {
  if (yearsOfExperience <= 0) return 0.35;
  if (yearsOfExperience === 1) return 0.4;
  if (yearsOfExperience === 2) return 0.45;
  if (yearsOfExperience === 3) return 0.55;
  return 1;
}
function pickContractLength(ageAdjustedScore: number, rng: () => number): number {
  if (ageAdjustedScore >= 80)
    return rng() < 0.6 ? randomLength(4, 5, rng) : randomLength(2, 3, rng);
  if (ageAdjustedScore >= 55) return randomLength(2, 4, rng);
  return randomLength(1, 2, rng);
}
```

**What it does:** rating → market value (`scoreToCapFraction`) → apply a rookie-scale
discount and a seeded ±15% negotiation wiggle → floor at ~a minimum → pick a length
(stars get longer) → each year gets a 5% raise, fully guaranteed. The `seed` (a player
id) is what makes it reproducible.

---

## Interview one-liners

- "One constants table (`getSeasonCapRules`) feeds cap sheets, matching, projections,
  and contracts — no dollar figure is hardcoded anywhere else."
- "Apron level is the currency of the cap system: one label derived from total salary
  drives matching limits, exceptions, and flexibility grades."
- "The trade AI scores a deal as an adjusted incoming/outgoing value ratio with bounded
  multipliers, behind a hard untouchable gate no personality can override."
- "Contracts are a logistic rating→cap-fraction curve plus a seeded ±15% negotiation
  noise — realistic and reproducible."
