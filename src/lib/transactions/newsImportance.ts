import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import type { NewsImportance } from "@/generated/prisma/client";

const IMPORTANCE_ORDER: NewsImportance[] = ["MINOR", "STANDARD", "MAJOR", "BREAKING"];

/**
 * A single player's rating tier decides how big a story about them reads -
 * a superstar trade/signing/retirement/injury is real news, a
 * minimum-level move is routine. Reuses the same tier boundaries
 * `getPlayerValueTier` already uses everywhere else, rather than a second
 * set of thresholds.
 */
export function importanceForRating(overallRating: number): NewsImportance {
  const tier = getPlayerValueTier(overallRating);
  if (tier === "SUPERSTAR") return "MAJOR";
  if (tier === "STAR") return "STANDARD";
  return "MINOR";
}

/** For a story involving several players (a multi-player trade), the story is as big as its biggest piece. */
export function highestImportance(levels: NewsImportance[]): NewsImportance {
  return levels.reduce(
    (best, level) =>
      IMPORTANCE_ORDER.indexOf(level) > IMPORTANCE_ORDER.indexOf(best) ? level : best,
    "MINOR" as NewsImportance,
  );
}
