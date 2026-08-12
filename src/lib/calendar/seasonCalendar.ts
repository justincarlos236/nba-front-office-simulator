/**
 * Maps the simulation's own sequential `Game.dayIndex` (1, 2, 3, ... from
 * the start of that season's generated schedule - see
 * `generateRoundRobinSchedule`, `src/lib/simulation/generateSchedule.ts`)
 * onto a real calendar date, and names the fixed points on that axis.
 *
 * **This module used to be display-only. It is now load-bearing**, because the
 * trade deadline and the All-Star break are real positions on the calendar
 * rather than proxies for games played. It still never writes simulation
 * state - it reads `season`/`dayIndex` and returns dates and booleans - but
 * `validateTrade` and the schedule generator now both depend on it, so the
 * anchor below is no longer a free cosmetic choice.
 *
 * **There is deliberately only one calendar.** `dayIndex` was already the
 * spine: it is persisted on `Game`, `LeagueTransaction`, `FanSentimentEvent`,
 * `BusinessDecision` and `BusinessLedgerEntry`, and business decisions already
 * carry a `deadlineDayIndex`. A second calendar would have to be reconciled
 * with the first, and two sources of truth is the failure mode this codebase
 * avoids everywhere else.
 *
 * **In-season events are date-driven; the postseason is not.** The deadline
 * and the break are fixed points here and are enforced against them. The
 * play-in, playoffs, lottery, draft and free agency stay chained to
 * progression, because the draft cannot happen before the Finals end - real
 * NBA postseason dates float for exactly the same reason. Those carry nominal
 * labels for display and are never gated on a date.
 */

/** Day indices are 1-based: day 1 is opening night. */
export const OPENING_NIGHT_DAY_INDEX = 1;

// Opening night is the Tuesday on or after October 21 of the season's start
// year. Checked against three real openers: 2023-24 opened Oct 24 2023,
// 2024-25 opened Oct 22 2024, 2025-26 opened Oct 21 2025 - this rule
// reproduces all three, where a fixed date or "fourth Tuesday" does not.
//
// The old anchor was a fixed October 24, documented as cosmetic. It no longer
// is: the deadline and the All-Star break are defined as offsets from opening
// night and land on the right weekdays only because day 1 is always a Tuesday.
const ANCHOR_MONTH = 9; // JS Date months are 0-indexed - 9 = October
const ANCHOR_EARLIEST_DAY = 21;
const TUESDAY = 2;

export function seasonStartDate(season: number): Date {
  const d = new Date(season, ANCHOR_MONTH, ANCHOR_EARLIEST_DAY);
  d.setDate(d.getDate() + ((TUESDAY - d.getDay() + 7) % 7));
  return d;
}

export function dayIndexToDate(season: number, dayIndex: number): Date {
  const result = seasonStartDate(season);
  result.setDate(result.getDate() + (dayIndex - OPENING_NIGHT_DAY_INDEX));
  return result;
}

/** 0 = Sunday, matching `Date.getDay`. */
export function weekdayForDayIndex(season: number, dayIndex: number): number {
  return dayIndexToDate(season, dayIndex).getDay();
}

/**
 * All-Star Sunday. Measured, not chosen: the 2024-25 season opened Oct 22 and
 * held All-Star Sunday on Feb 16, which is 117 days later - day index 118.
 * Because opening night is always a Tuesday this lands on a Sunday every
 * season by construction: (118 - 1) mod 7 = 5, and Tuesday + 5 = Sunday.
 */
export const ALL_STAR_SUNDAY_DAY_INDEX = 118;

/**
 * Teams are idle from the Friday before All-Star Sunday through the Wednesday
 * after - six days with no games at all, which is the gap a real schedule
 * leaves. Previously the break was a pause in *simulation* only, so games
 * either side of it sat on consecutive days and the calendar had no gap.
 */
export const ALL_STAR_BREAK_START_DAY_INDEX = ALL_STAR_SUNDAY_DAY_INDEX - 2;
export const ALL_STAR_BREAK_END_DAY_INDEX = ALL_STAR_SUNDAY_DAY_INDEX + 3;

export function isAllStarBreakDay(dayIndex: number): boolean {
  return dayIndex >= ALL_STAR_BREAK_START_DAY_INDEX && dayIndex <= ALL_STAR_BREAK_END_DAY_INDEX;
}

/**
 * The trade deadline: ten days before All-Star Sunday, which puts it on a
 * Thursday. Measured rather than picked - the last three real deadlines were
 * Feb 9 2023, Feb 8 2024 and Feb 6 2025, every one a Thursday, every one ten
 * days before that season's All-Star Sunday.
 */
export const TRADE_DEADLINE_DAY_INDEX = ALL_STAR_SUNDAY_DAY_INDEX - 10;

/** True once the deadline has passed and trades are closed for the season. */
export function isAfterTradeDeadline(dayIndex: number): boolean {
  return dayIndex > TRADE_DEADLINE_DAY_INDEX;
}

/**
 * What day the league is currently sitting on: the day of its next unplayed
 * regular-season game.
 *
 * Returns `null` once every game has been played, which is how "the regular
 * season is over" is expressed - and that matters, because the deadline only
 * binds during the season. Trading reopens for the playoffs and offseason,
 * as it does in reality.
 */
export function currentRegularSeasonDayIndex(
  games: { dayIndex: number | null; playedAt: Date | null }[],
): number | null {
  let earliestUnplayed: number | null = null;
  for (const g of games) {
    if (g.playedAt !== null || g.dayIndex === null) continue;
    if (earliestUnplayed === null || g.dayIndex < earliestUnplayed) earliestUnplayed = g.dayIndex;
  }
  return earliestUnplayed;
}

/**
 * Whether an in-season trade is currently blocked, given the league's own
 * schedule. `false` outside the regular season rather than throwing - the
 * playoffs, draft night and the offseason all trade freely.
 */
export function tradesAreClosed(
  games: { dayIndex: number | null; playedAt: Date | null }[],
): boolean {
  const today = currentRegularSeasonDayIndex(games);
  return today !== null && isAfterTradeDeadline(today);
}

/**
 * Target length of the regular season in days, All-Star break included. The
 * real 2024-25 season ran Oct 22 to Apr 13, which is 174 days.
 *
 * A target, not a guarantee - `assignDays` overruns it rather than fail to
 * schedule a game. What it must not do is finish far short, which is what
 * happened when the per-day cap was a flat `ceil(1230 / 175) = 8`.
 */
export const REGULAR_SEASON_TARGET_DAYS = 174;

/**
 * How many games a real NBA night carries, by weekday (0 = Sunday).
 *
 * The old scheduler put the same eight games on every date, so a Thursday and
 * a Saturday were identical and the league never had a big night. Real slates
 * swing from about 2 games to about 13: Thursday is light because of the
 * national doubleheader, midweek and Friday are heavy. These sum to 52 a week,
 * which spreads 1,230 games across roughly 166 playing days - about 172 once
 * the six-day All-Star break is added back.
 */
export const GAMES_BY_WEEKDAY: readonly number[] = [
  7, // Sunday
  6, // Monday
  8, // Tuesday
  9, // Wednesday
  4, // Thursday - national doubleheader night
  10, // Friday
  8, // Saturday
];

export function targetGamesForDayIndex(season: number, dayIndex: number): number {
  if (isAllStarBreakDay(dayIndex)) return 0;
  return GAMES_BY_WEEKDAY[weekdayForDayIndex(season, dayIndex)];
}

export interface MonthGridCell {
  date: Date | null;
}

/**
 * A generic, domain-agnostic Sun-Sat month grid (up to 6 rows x 7 columns) -
 * `null` cells are days outside `month` (leading days from the prior month,
 * trailing days from the next), so callers can render them blank/greyed
 * rather than as another month's real date.
 */
export function buildMonthGrid(year: number, month: number): MonthGridCell[][] {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 (Sun) - 6 (Sat)

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null });
  for (let day = 1; day <= daysInMonth; day++) cells.push({ date: new Date(year, month, day) });
  while (cells.length % 7 !== 0) cells.push({ date: null });

  const weeks: MonthGridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface SeasonMonth {
  year: number;
  month: number; // 0-indexed, matching JS Date
}

/** The real (year, month) pairs a season's games actually span, earliest to latest - bounds month navigation so the UI can't page into a month with no season data. */
export function getSeasonMonthRange(games: { dayIndex: number }[], season: number): SeasonMonth[] {
  if (games.length === 0) return [];

  const dayIndexes = games.map((g) => g.dayIndex);
  const minDate = dayIndexToDate(season, Math.min(...dayIndexes));
  const maxDate = dayIndexToDate(season, Math.max(...dayIndexes));

  const months: SeasonMonth[] = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  while (cursor <= end) {
    months.push({ year: cursor.getFullYear(), month: cursor.getMonth() });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type CalendarEventKind =
  | "OPENING_NIGHT"
  | "TRADE_DEADLINE"
  | "ALL_STAR_BREAK"
  | "SEASON_END"
  | "PLAY_IN"
  | "PLAYOFFS"
  | "DRAFT_LOTTERY"
  | "DRAFT"
  | "OFFSEASON";

export interface CalendarEvent {
  kind: CalendarEventKind;
  label: string;
  /** Null for postseason events, which are unlocked by progression, not by a date. */
  dayIndex: number | null;
  date: Date | null;
  /** False means "happens when the previous stage finishes", not "happens on this date". */
  dateDriven: boolean;
  detail: string;
}

/**
 * Everything the user should be able to see coming, in order.
 *
 * `regularSeasonEndDayIndex` is passed in from the generated schedule rather
 * than read off a constant, because the day-assignment loop is allowed to
 * overrun its target and the real end date is whatever it produced.
 */
export function seasonCalendarEvents(
  season: number,
  regularSeasonEndDayIndex: number,
): CalendarEvent[] {
  const at = (dayIndex: number) => dayIndexToDate(season, dayIndex);
  const breakEnds = at(ALL_STAR_BREAK_END_DAY_INDEX);
  return [
    {
      kind: "OPENING_NIGHT",
      label: "Opening Night",
      dayIndex: OPENING_NIGHT_DAY_INDEX,
      date: at(OPENING_NIGHT_DAY_INDEX),
      dateDriven: true,
      detail: "The regular season begins.",
    },
    {
      kind: "TRADE_DEADLINE",
      label: "Trade Deadline",
      dayIndex: TRADE_DEADLINE_DAY_INDEX,
      date: at(TRADE_DEADLINE_DAY_INDEX),
      dateDriven: true,
      detail: "Last day to make a trade. Trading reopens after the regular season.",
    },
    {
      kind: "ALL_STAR_BREAK",
      label: "All-Star Break",
      dayIndex: ALL_STAR_BREAK_START_DAY_INDEX,
      date: at(ALL_STAR_BREAK_START_DAY_INDEX),
      dateDriven: true,
      detail: `No games until ${breakEnds.toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`,
    },
    {
      kind: "SEASON_END",
      label: "Regular Season Ends",
      dayIndex: regularSeasonEndDayIndex,
      date: at(regularSeasonEndDayIndex),
      dateDriven: true,
      detail: "Final standings are set and trading reopens.",
    },
    {
      kind: "PLAY_IN",
      label: "Play-In Tournament",
      dayIndex: null,
      date: null,
      dateDriven: false,
      detail: "Unlocks once every regular-season game has been played.",
    },
    {
      kind: "PLAYOFFS",
      label: "Playoffs",
      dayIndex: null,
      date: null,
      dateDriven: false,
      detail: "Four rounds on a fixed bracket. Unlocks after the play-in.",
    },
    {
      kind: "DRAFT_LOTTERY",
      label: "Draft Lottery",
      dayIndex: null,
      date: null,
      dateDriven: false,
      detail: "Unlocks once a champion is crowned.",
    },
    {
      kind: "DRAFT",
      label: "Draft",
      dayIndex: null,
      date: null,
      dateDriven: false,
      detail: "Unlocks once the lottery has set the order.",
    },
    {
      kind: "OFFSEASON",
      label: "Offseason",
      dayIndex: null,
      date: null,
      dateDriven: false,
      detail: "Re-signings, free agency, and the roll into next season.",
    },
  ];
}
