/**
 * Maps a player's `overallRating` (60-99, NBA-2K-style scale - see
 * `computePerformanceScore`) to one of five casual-friendly market-value
 * tiers. This is presentation-layer sugar over the existing rating scale,
 * not a new valuation model - the thresholds are calibrated against real
 * NBA 2K ratings (true superstars 90+, All-Star-caliber 80-89, solid
 * starters 72-79, rotation players 65-71, deep bench/fringe below that),
 * so a caller never needs to know the underlying cap-fraction math to
 * understand "is this guy expensive."
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
  if (overallRating >= 90) return "SUPERSTAR";
  if (overallRating >= 80) return "STAR";
  if (overallRating >= 72) return "STARTER";
  if (overallRating >= 65) return "ROTATION";
  return "MINIMUM";
}
