import { ALL_STAR_BREAK_START_DAY_INDEX as CALENDAR_ALL_STAR_BREAK_START_DAY_INDEX } from "../calendar/seasonCalendar";

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
 * **The break is a date now, not a game count.**
 *
 * It used to fire on the user's 41st game, documented as deliberately early
 * because "a save's pacing is driven by how often the user stops to make
 * decisions". Once the break became a real six-day gap on the season calendar
 * (`seasonCalendar.ts`) that stopped being a pacing choice and became a
 * contradiction: measured, game 41 falls around January 10, while the calendar
 * - and the schedule page the user is looking at - puts the break on
 * February 13. Two parts of the same UI disagreed by a month.
 *
 * Keying off the schedule fixes it for free, because no games are scheduled
 * inside the break window at all. The next unplayed game therefore jumps
 * straight from the day before the break to the day after it, so "the next
 * game falls on or after the break" is true exactly when every pre-break game
 * has been played. Teams reach it having played ~57 of 82, against a real ~55.
 */
export const ALL_STAR_BREAK_START_DAY_INDEX = CALENDAR_ALL_STAR_BREAK_START_DAY_INDEX;

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
  /** Day of the league's next unplayed regular-season game; null once none remain. */
  nextGameDayIndex: number | null;
  weekendState: AllStarWeekendState;
}): AllStarBreakDecision {
  // No games left - the season is over and the break cannot still be ahead.
  if (args.nextGameDayIndex === null) return "continue";
  if (args.nextGameDayIndex < ALL_STAR_BREAK_START_DAY_INDEX) return "continue";
  if (args.weekendState === null) return "generate-and-pause";
  if (args.weekendState === "PENDING") return "pause";
  // RESOLVED - the break is behind us and stops blocking the season.
  return "continue";
}
