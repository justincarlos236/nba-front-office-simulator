/**
 * Derives a single team-strength number (roughly the same 0-100 scale as
 * `overallRating`) from a roster, weighting the top ~9 rotation players
 * more heavily than deep bench - a starter's rating should matter more to
 * a team's competitiveness than the 15th man's. Heuristic, not a fitted
 * model; see docs/SYSTEMS.md.
 */
const ROTATION_SIZE = 9;
const ROTATION_WEIGHTS = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
const BENCH_WEIGHT = 0.4;

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
