/**
 * Maps a player's `overallRating` (0-100, same scale used everywhere -
 * team strength, contract generation, development) to one of five
 * casual-friendly market-value tiers. This is presentation-layer sugar
 * over the existing rating scale, not a new valuation model - the
 * thresholds are calibrated against the actual rating distribution this
 * simulator produces (real 2023-24 stat-derived ratings top out in the
 * high 70s/low 80s for MVP-caliber players, not a theoretical 0-100
 * spread), so a caller never needs to know the underlying cap-fraction
 * math to understand "is this guy expensive."
 */
export type PlayerValueTier = "SUPERSTAR" | "STAR" | "STARTER" | "ROTATION" | "MINIMUM";

export const PLAYER_VALUE_TIER_LABEL: Record<PlayerValueTier, string> = {
  SUPERSTAR: "Superstar",
  STAR: "Star",
  STARTER: "Starter",
  ROTATION: "Rotation Player",
  MINIMUM: "Minimum-Level Player",
};

export function getPlayerValueTier(overallRating: number): PlayerValueTier {
  if (overallRating >= 80) return "SUPERSTAR";
  if (overallRating >= 68) return "STAR";
  if (overallRating >= 55) return "STARTER";
  if (overallRating >= 40) return "ROTATION";
  return "MINIMUM";
}
