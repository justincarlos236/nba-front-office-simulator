import { computePerformanceScore, type PlayerValuationStats } from "../valuation/playerValue";

/**
 * Derives a LeaguePlayer's starting `overallRating` from real season stats
 * using the same performance composite the valuation model uses elsewhere —
 * one scoring function backs both "how good is this player" (league
 * bootstrap) and "is this player over/underpaid" (trade/AI tooling),
 * instead of maintaining two divergent rating systems.
 */
export function deriveOverallRating(stats: PlayerValuationStats): number {
  return Math.round(computePerformanceScore(stats));
}

/**
 * Potential ceiling above (or below) the current rating, driven by age:
 * young players get real development headroom, players past their prime
 * have essentially no upside left (their "potential" is their current
 * rating, since further change is more likely decline than growth). The
 * headroom cap is proportional to the 60-99 rating scale's width (39
 * points) - the same ~27% of the scale a 20-point cap represented on the
 * old, wider 0-100 scale.
 */
export function derivePotentialRating(overallRating: number, age: number): number {
  const yearsOfUpside = Math.max(0, 26 - age);
  const headroom = Math.min(10, yearsOfUpside * 2);
  return Math.min(99, overallRating + headroom);
}
