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

/**
 * How big an injury story is - from *who* as well as *how long*.
 *
 * Duration alone used to decide this, on the reasoning that a multi-week
 * absence is bigger news than a day-to-day tweak. True, but incomplete: it
 * made every 20-game absence MAJOR regardless of whether the player was a
 * franchise cornerstone or a fifteenth man, and a rotation player's stress
 * fracture would lead the news page over a ten-game winning streak and three
 * trades. Losing a superstar for three weeks and a bench player for three
 * weeks are not the same story.
 *
 * Both signals are available at the roll site - the rating is already read
 * there for fan sentiment - so this combines them rather than picking one.
 */
export function importanceForInjury(durationGames: number, overallRating: number): NewsImportance {
  const tier = getPlayerValueTier(overallRating);
  const star = tier === "SUPERSTAR" || tier === "STAR";

  // Losing a superstar for a long stretch reshapes a season.
  if (tier === "SUPERSTAR" && durationGames >= 15) return "BREAKING";
  if (star && durationGames >= 8) return "MAJOR";
  // A long absence is major news for anyone, but the bar is higher than it
  // was: three weeks out for a deep-bench player is not a headline.
  if (durationGames >= 30) return "MAJOR";
  if (star || durationGames >= 12) return "STANDARD";
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
