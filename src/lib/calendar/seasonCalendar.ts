/**
 * Maps the simulation's own sequential `Game.dayIndex` (1, 2, 3, ... from
 * the start of that season's generated schedule - see
 * `generateRoundRobinSchedule`, `src/lib/simulation/generateSchedule.ts`)
 * onto a real calendar date, purely for display. `dayIndex` itself is not,
 * and has never been, a real date - this module never writes to it or any
 * other simulation state; it only reads `season`/`dayIndex`, both already
 * stored on every `Game` row today.
 */

// October 24 is a realistic real-NBA opening-night anchor. A cosmetic
// choice, not a rule the simulation depends on - changing this constant
// only shifts what date every game *displays* as, never simulation order.
const SEASON_START_MONTH = 9; // JS Date months are 0-indexed - 9 = October
const SEASON_START_DAY = 24;

export function dayIndexToDate(season: number, dayIndex: number): Date {
  const start = new Date(season, SEASON_START_MONTH, SEASON_START_DAY);
  const result = new Date(start);
  result.setDate(result.getDate() + (dayIndex - 1));
  return result;
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
