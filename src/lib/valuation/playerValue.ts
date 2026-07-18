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
  /** Composite of current on-court production, roughly 0-100. */
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

/**
 * Combines real per-game box-score stats into a single 0-100 production
 * score, anchored around roughly average-starter baselines (~15 ppg,
 * 5 reb, 3 ast, 24 minutes, ~56% true shooting). Weights are a hand-tuned
 * heuristic (not a fitted regression) intended to produce sensible
 * relative orderings, not to be read as a precise real-world valuation.
 * See docs/ARCHITECTURE.md for why this runs on raw box-score stats
 * rather than advanced metrics like BPM/Win Shares/VORP.
 */
export function computePerformanceScore(stats: PlayerValuationStats): number {
  const raw =
    50 +
    (stats.pointsPerGame - 15) * 0.7 +
    (stats.reboundsPerGame - 5) * 1.0 +
    (stats.assistsPerGame - 3) * 1.3 +
    (stats.stealsPerGame - 1) * 4 +
    (stats.blocksPerGame - 0.5) * 4 +
    (stats.turnoversPerGame - 1.5) * -2 +
    (stats.trueShootingPct - 0.56) * 120 +
    (stats.minutesPerGame - 24) * 0.4;
  return Math.min(100, Math.max(0, raw));
}

/**
 * Maps a 0-100 age-adjusted score to a fraction of the salary cap, using a
 * logistic curve so value rises smoothly from minimum-salary-level players
 * up through the realistic max-contract ceiling rather than a hard
 * piecewise cutoff.
 */
export function scoreToCapFraction(score: number): number {
  const MAX_CAP_FRACTION = 0.35; // roughly a supermax-caliber player
  const MIDPOINT = 55; // score at which a player earns half of MAX_CAP_FRACTION
  const STEEPNESS = 0.08;
  return MAX_CAP_FRACTION / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)));
}

export function evaluatePlayer(input: PlayerValuationInput): PlayerValuationResult {
  const rules = getSeasonCapRules(input.season);

  const performanceScore = computePerformanceScore(input.stats);
  const ageAdjustedScore = Math.min(100, performanceScore * ageValueMultiplier(input.age));

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
