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

export interface PlayerValuationInput {
  season: number;
  age: number;
  stats: PlayerValuationStats;
  actualSalaryCents: bigint;
}

export interface PlayerValuationResult {
  /** Composite of current on-court production, 60-99 (NBA-2K-style). */
  performanceScore: number;
  /** performanceScore after applying the age curve - what the market pays for. */
  ageAdjustedScore: number;
  /** What a player with this ageAdjustedScore would be expected to earn this season. */
  estimatedMarketValueCents: bigint;
  /** estimatedMarketValueCents minus what they're actually being paid. Positive = team bargain. */
  surplusValueCents: bigint;
  /** Surplus as a fraction of actual salary, for ranking "best value" contracts of any size. */
  surplusValuePct: number;
}

// How much each counting stat is normalized toward a per-36-minutes rate
// before comparing against baseline (0 = pure per-game, as it used to be;
// 1 = pure per-36). Pure per-game double-penalizes bench players (their
// counting stats are naturally lower from fewer minutes *and* the
// baseline comparison itself), which was found to crush ~42% of all real
// players to the exact rating floor - nearly every bench player in the
// league, not the intended "bottom ~15%". Pure per-36 (1.0) overcorrects
// the other way: it strips out essentially all of the real signal in a
// star's heavy minutes (a coach trusting a player with 36+ minutes a
// night is itself real evidence of quality), collapsing the gap between
// stars and average players. 0.7 was the empirically-best blend found by
// checking real anchor players spanning archetypes (see the anchor table
// below) - it fixes the bench pileup while keeping real stars correctly
// elite.
const MINUTES_NORMALIZATION_BLEND = 0.7;

/**
 * What counts as a full workload, in minutes per game. One number, because
 * the two things it controls are the same claim stated twice: a per-36 rate
 * is never extrapolated by more than `36 / FULL_WORKLOAD_MINUTES`, and a
 * player below that many minutes is blended toward replacement level in
 * proportion to how far below he is.
 *
 * This was 16, which trusted a 17-minute player's per-36 rates outright -
 * a 2.1x extrapolation taken as fact. Measured on the seeded roster, that
 * turned backup centres into superstars: Robert Williams III (17.1 mpg) and
 * Jaxson Hayes (18.3 mpg) both scored a clamped 99.0, tying Jokić and SGA,
 * and were paid accordingly. 24 minutes is a real rotation player's night;
 * beyond that the model is inventing production rather than measuring it.
 */
const FULL_WORKLOAD_MINUTES = 24;
const MAX_RATE_EXTRAPOLATION = 36 / FULL_WORKLOAD_MINUTES;

// What a player with too little playing time to trust gets blended
// toward - "presume fringe/replacement level, not enough evidence,"
// rather than "presume average" (72). Slightly above the hard floor (60).
const REPLACEMENT_LEVEL_SCORE = 65;

/**
 * Scoring volume at which shooting efficiency is taken at face value. Below
 * it, the efficiency term is scaled down in proportion - see
 * `computePerformanceScore`. Deliberately the same 15 ppg the formula uses
 * as its baseline statline, so the model has one zero point rather than two.
 */
const EFFICIENCY_VOLUME_BASELINE = 15;

function normalizedRate(perGame: number, minutesPerGame: number): number {
  const extrapolation = Math.min(MAX_RATE_EXTRAPOLATION, 36 / Math.max(minutesPerGame, 1));
  const per36 = perGame * extrapolation;
  return perGame + MINUTES_NORMALIZATION_BLEND * (per36 - perGame);
}

/**
 * Combines real per-game box-score stats into a single NBA-2K-style
 * 60-99 production score/rating, anchored around roughly average-starter
 * baselines (~15 ppg, 5 reb, 3 ast, 24 minutes, ~56% true shooting) -
 * that exact statline is this formula's zero point (72, the new
 * baseline). Counting stats are partially normalized toward a per-36-
 * minutes rate first (see `MINUTES_NORMALIZATION_BLEND`) so a legitimate
 * bench player isn't penalized twice for playing fewer minutes, but that
 * extrapolation is capped and the efficiency term is weighted by scoring
 * volume - see `FULL_WORKLOAD_MINUTES` and `EFFICIENCY_VOLUME_BASELINE`
 * for the two ways this formula previously mistook a low-minute,
 * high-efficiency backup for a superstar. Weights
 * are a hand-tuned heuristic (not a fitted regression) intended to
 * produce sensible relative orderings, calibrated against real NBA 2K24
 * ratings as anchor points across archetypes - not just top scorers, since
 * an earlier pass here found that weighting steals/blocks far higher than
 * points (as this formula originally did) quietly over-rewarded
 * shot-blocking bigs relative to high-usage scoring wings, an imbalance
 * invisible only because both extremes used to clamp to the same ceiling.
 * Verified against: Jokić 98/Embiid 96/Giannis 96 (bigs), Tatum 95/Dončić
 * 95/Curry 96/SGA 95 (scoring wings/guards), Kessler ~82/Fontecchio ~76
 * (real rotation players), Horton-Tucker ~72/Potter ~63 (bench). This
 * remains a heuristic, not a claim of precise real-world valuation - see
 * docs/SYSTEMS.md for why this runs on raw box-score stats rather
 * than advanced metrics like BPM/Win Shares/VORP, a limitation no amount
 * of weight-tuning on this input set can fully overcome (a handful of
 * real low-volume, low-efficiency-but-valuable role players will still
 * land near the floor).
 */
export function computePerformanceScore(stats: PlayerValuationStats): number {
  const pts = normalizedRate(stats.pointsPerGame, stats.minutesPerGame);
  const reb = normalizedRate(stats.reboundsPerGame, stats.minutesPerGame);
  const ast = normalizedRate(stats.assistsPerGame, stats.minutesPerGame);
  const stl = normalizedRate(stats.stealsPerGame, stats.minutesPerGame);
  const blk = normalizedRate(stats.blocksPerGame, stats.minutesPerGame);
  const tov = normalizedRate(stats.turnoversPerGame, stats.minutesPerGame);

  // Efficiency is weighted by how much a player actually shoots. True
  // shooting percentage is a rate, and treating it as one carried the same
  // weight for a rim-runner taking four shots a night as for a first option
  // taking twenty - which made it far and away the largest term in the
  // model for exactly the players it says least about. Measured on the
  // seeded roster, Ryan Kalkbrenner (7.5 ppg, .762 TS) drew +28.3 from this
  // term and Jaxson Hayes (7.5 ppg, .758) +27.7, against +15.3 for Jokić
  // and +14.7 for SGA: a backup centre earned nearly double the MVP's
  // efficiency bonus, and every other term combined moved him less than a
  // point. Scaling by volume leaves every real high-usage scorer untouched
  // (they are at or above the baseline, so the weight is 1) and removes the
  // phantom.
  const efficiencyWeight = Math.min(1, stats.pointsPerGame / EFFICIENCY_VOLUME_BASELINE);

  const raw =
    72 +
    (pts - 15) * 0.85 +
    (reb - 5) * 0.8 +
    (ast - 3) * 1.1 +
    (stl - 1) * 2.2 +
    (blk - 0.5) * 2.2 +
    (tov - 1.5) * -1.6 +
    (stats.trueShootingPct - 0.56) * 140 * efficiencyWeight;

  const sampleWeight = Math.min(1, stats.minutesPerGame / FULL_WORKLOAD_MINUTES);
  const blended = sampleWeight * raw + (1 - sampleWeight) * REPLACEMENT_LEVEL_SCORE;

  return Math.min(99, Math.max(60, blended));
}

/**
 * Maps a 60-99 age-adjusted score to a fraction of the salary cap, using a
 * logistic curve so value rises smoothly from minimum-salary-level players
 * up through the realistic max-contract ceiling rather than a hard
 * piecewise cutoff. MIDPOINT/STEEPNESS are re-derived (not just carried
 * over) whenever the rating scale changes, so the curve's shape - near-zero
 * at the floor, ~95% of MAX_CAP_FRACTION at the ceiling - stays consistent
 * regardless of how wide the input range is.
 */
export function scoreToCapFraction(score: number): number {
  const MAX_CAP_FRACTION = 0.35; // roughly a supermax-caliber player
  // Score at which a player earns half of MAX_CAP_FRACTION.
  //
  // **This was 80, and 80 is an ordinary starter on this scale.** Paying the
  // middle of the league half the maximum priced a 15-man roster at 135% of the
  // cap, left 1 of 30 clubs under it and 20 of 30 over the SECOND apron - which
  // starves free agency, because `computeRivalInterest` gates suitors on having
  // room. It also drove the curve into the individual-maximum clamp at ~86 OVR,
  // so an 85-rated player was a max player. See docs/audits/SALARY_SYSTEM_AUDIT.md
  // P0-1 and P1-1.
  //
  // Fitted in `scripts/pricing-curve-calibration.ts` against the real payroll
  // shape in `realPayrollShape.ts`: mean team payroll 110% of cap, and the
  // measured count of players above 19.4% of cap ($30M+ in 2025-26 terms).
  const MIDPOINT = 82;
  // Steeper to keep the tiers apart once the midpoint moved. A flatter curve at
  // this midpoint hits the payroll target only by flattening the whole league.
  const STEEPNESS = 0.21;
  return MAX_CAP_FRACTION / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)));
}

/**
 * What the market would pay a player of this calibre at this age, in cents.
 *
 * **The age discount belongs here, on the money - not on the score.**
 * `ageValueMultiplier` documents itself as affecting market *value*, but it
 * used to be multiplied into the score before the score was fed through
 * `scoreToCapFraction`. That curve is a logistic, so scaling its input
 * compounds: a 35% haircut on a 37-year-old's score became a 96% haircut on
 * his salary. Measured against the seeded roster, that paid Kevin Durant
 * (performance score 91.9) $1.7M, Stephen Curry $2.3M and LeBron James
 * $1.3M - all at or near the veteran minimum, which in turn left Houston
 * $57.9M below a realistic team salary floor.
 *
 * Applying the multiplier to the output instead keeps the curve's shape and
 * the age discount's intent without the two multiplying into each other.
 */
export function ageAdjustedMarketValueCents(args: {
  /** Un-aged score: raw on-court production, or an overall rating. */
  score: number;
  age: number;
  season: number;
}): bigint {
  const rules = getSeasonCapRules(args.season);
  const value =
    Number(rules.salaryCapCents) * scoreToCapFraction(args.score) * ageValueMultiplier(args.age);
  return BigInt(Math.round(value));
}

export function evaluatePlayer(input: PlayerValuationInput): PlayerValuationResult {
  const performanceScore = computePerformanceScore(input.stats);
  // Retained for callers that describe *how a player is trending* rather than
  // what he is paid - it is no longer what sets his price.
  const ageAdjustedScore = Math.min(99, performanceScore * ageValueMultiplier(input.age));

  const estimatedMarketValueCents = ageAdjustedMarketValueCents({
    score: performanceScore,
    age: input.age,
    season: input.season,
  });

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
