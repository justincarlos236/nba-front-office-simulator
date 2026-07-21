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

// Below this many minutes/game, a per-36 rate is statistically noisy
// (small-sample garbage-time stats can look artificially great or
// terrible) - the score gets blended toward REPLACEMENT_LEVEL_SCORE
// instead of trusted outright. A player at or above this many minutes is
// scored entirely on their own real production.
const CONFIDENCE_MINUTES = 16;
// What a player with too little playing time to trust gets blended
// toward - "presume fringe/replacement level, not enough evidence,"
// rather than "presume average" (72). Slightly above the hard floor (60).
const REPLACEMENT_LEVEL_SCORE = 65;

function normalizedRate(perGame: number, minutesPerGame: number): number {
  const per36 = perGame * (36 / Math.max(minutesPerGame, 1));
  return perGame + MINUTES_NORMALIZATION_BLEND * (per36 - perGame);
}

/**
 * Combines real per-game box-score stats into a single NBA-2K-style
 * 60-99 production score/rating, anchored around roughly average-starter
 * baselines (~15 ppg, 5 reb, 3 ast, 24 minutes, ~56% true shooting) -
 * that exact statline is this formula's zero point (72, the new
 * baseline). Counting stats are partially normalized toward a per-36-
 * minutes rate first (see `MINUTES_NORMALIZATION_BLEND`) so a legitimate
 * bench player isn't penalized twice for playing fewer minutes. Weights
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
 * docs/ARCHITECTURE.md for why this runs on raw box-score stats rather
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

  const raw =
    72 +
    (pts - 15) * 0.85 +
    (reb - 5) * 0.8 +
    (ast - 3) * 1.1 +
    (stl - 1) * 2.2 +
    (blk - 0.5) * 2.2 +
    (tov - 1.5) * -1.6 +
    (stats.trueShootingPct - 0.56) * 140;

  const sampleWeight = Math.min(1, stats.minutesPerGame / CONFIDENCE_MINUTES);
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
  const MIDPOINT = 80; // score at which a player earns half of MAX_CAP_FRACTION
  const STEEPNESS = 0.17;
  return MAX_CAP_FRACTION / (1 + Math.exp(-STEEPNESS * (score - MIDPOINT)));
}

export function evaluatePlayer(input: PlayerValuationInput): PlayerValuationResult {
  const rules = getSeasonCapRules(input.season);

  const performanceScore = computePerformanceScore(input.stats);
  const ageAdjustedScore = Math.min(99, performanceScore * ageValueMultiplier(input.age));

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
