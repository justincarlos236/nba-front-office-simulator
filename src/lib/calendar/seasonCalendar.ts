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

// Opening night is the Tuesday on or after October 20 of the season's start
// year. Checked against four real openers: Oct 24 2023, Oct 22 2024,
// Oct 21 2025 and Oct 20 2026 - this reproduces all four.
//
// **It was October 21, and 2026 is exactly the year that breaks.** Oct 21 2026
// falls on a Wednesday, so "on or after the 21st" skipped a full week to Oct 27
// - three days later than any real opening night has ever been, dragging the
// whole season with it. Real openers sit in a tight Oct 20-24 window; an anchor
// of 20 keeps every generated one inside it.
const ANCHOR_MONTH = 9; // JS Date months are 0-indexed - 9 = October
const ANCHOR_EARLIEST_DAY = 20;
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

/** Inverse of `dayIndexToDate`. May return values outside the season. */
export function dayIndexForDate(season: number, date: Date): number {
  const start = seasonStartDate(season);
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) /
      86_400_000,
  );
  return days + OPENING_NIGHT_DAY_INDEX;
}

/** 0 = Sunday, matching `Date.getDay`. */
export function weekdayForDayIndex(season: number, dayIndex: number): number {
  return dayIndexToDate(season, dayIndex).getDay();
}

/**
 * All-Star Sunday: the third Sunday of February in the season's END year.
 *
 * **Derived from the calendar, not from an offset, and that distinction is the
 * whole point.** This used to be a fixed `dayIndex` of 118, which quietly
 * assumed the gap between opening night and February is constant. It is not:
 * measured, the deadline lands on day 108 of the 2024-25 season and day 115 of
 * 2026-27, because the All-Star break is anchored to a February week while
 * opening night drifts across late October. A fixed index can only ever be
 * right for the one season it was measured on.
 *
 * Checked against every real date available: Feb 18 2024, Feb 16 2025 and
 * Feb 21 2027 - all three reproduced exactly.
 */
export function allStarSundayDate(season: number): Date {
  const endYear = season + 1;
  const feb = new Date(endYear, 1, 1);
  const firstSunday = 1 + ((7 - feb.getDay()) % 7);
  return new Date(endYear, 1, firstSunday + 14);
}

export function allStarSundayDayIndex(season: number): number {
  return dayIndexForDate(season, allStarSundayDate(season));
}

/**
 * Teams are idle from the Friday before All-Star Sunday through the Wednesday
 * after - six days with no games at all, which is the gap a real schedule
 * leaves. Previously the break was a pause in *simulation* only, so games
 * either side of it sat on consecutive days and the calendar had no gap.
 */
export function allStarBreakDayRange(season: number): { start: number; end: number } {
  const sunday = allStarSundayDayIndex(season);
  return { start: sunday - 2, end: sunday + 3 };
}

export function isAllStarBreakDay(season: number, dayIndex: number): boolean {
  const { start, end } = allStarBreakDayRange(season);
  return dayIndex >= start && dayIndex <= end;
}

/**
 * The trade deadline: ten days before All-Star Sunday, which puts it on a
 * Thursday. Measured rather than picked - Feb 8 2024, Feb 6 2025 and Feb 11
 * 2027 were each exactly ten days before that season's All-Star Sunday.
 */
export function tradeDeadlineDayIndex(season: number): number {
  return allStarSundayDayIndex(season) - 10;
}

/** True once the deadline has passed and trades are closed for the season. */
export function isAfterTradeDeadline(season: number, dayIndex: number): boolean {
  return dayIndex > tradeDeadlineDayIndex(season);
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
  season: number,
  games: { dayIndex: number | null; playedAt: Date | null }[],
): boolean {
  const today = currentRegularSeasonDayIndex(games);
  return today !== null && isAfterTradeDeadline(season, today);
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
  if (isAllStarBreakDay(season, dayIndex)) return 0;
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
  const deadline = tradeDeadlineDayIndex(season);
  const brk = allStarBreakDayRange(season);
  const breakEnds = at(brk.end);
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
      dayIndex: deadline,
      date: at(deadline),
      dateDriven: true,
      detail: "Last day to make a trade. Trading reopens after the regular season.",
    },
    {
      kind: "ALL_STAR_BREAK",
      label: "All-Star Break",
      dayIndex: brk.start,
      date: at(brk.start),
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
