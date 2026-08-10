/**
 * Whether the All-Star break should stop a run of regular-season simulation.
 *
 * The rule is that the season does not roll past the break until the weekend
 * has been resolved. The subtlety - and the source of a real bug - is that
 * "has the break happened" and "is the break still blocking" are different
 * questions. Once the weekend is RESOLVED the break is over, and the second
 * half of the season should simulate exactly like the first.
 *
 * The loop in `simulateGamesAction` originally decided this by checking
 * whether an `AllStarWeekend` row *existed*, and stopped whenever one did.
 * That is true for the entire back half of every season, so every "Sim next
 * 10" after game 41 stopped after a single chunk - about three of the user's
 * games - and, because nothing had actually been triggered, reported it with
 * the ordinary "played N games" message rather than explaining the stop.
 *
 * Existence is the wrong signal; status is the right one, which is what
 * `actionCenter.ts` and `attention.ts` already used.
 */

/**
 * Games the user's own team must have played for the All-Star break to land.
 * Real NBA teams reach it around game 55 of 82; this sits earlier because a
 * save's pacing is driven by how often the user stops to make decisions.
 */
export const ALL_STAR_BREAK_GAMES_PLAYED = 41;

/** `null` means no weekend row exists for this season yet. */
export type AllStarWeekendState = "PENDING" | "RESOLVED" | null;

export type AllStarBreakDecision =
  /** Keep simulating toward the target. */
  | "continue"
  /** The break has just been reached: create the weekend, then stop. */
  | "generate-and-pause"
  /** A weekend is already waiting on the user. Stop without regenerating. */
  | "pause";

export function decideAllStarBreak(args: {
  userGamesPlayed: number;
  weekendState: AllStarWeekendState;
}): AllStarBreakDecision {
  if (args.userGamesPlayed < ALL_STAR_BREAK_GAMES_PLAYED) return "continue";
  if (args.weekendState === null) return "generate-and-pause";
  if (args.weekendState === "PENDING") return "pause";
  // RESOLVED - the break is behind us and stops blocking the season.
  return "continue";
}
