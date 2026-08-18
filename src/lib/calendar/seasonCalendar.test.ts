import { describe, expect, it } from "vitest";
import {
  dayIndexToDate,
  buildMonthGrid,
  getSeasonMonthRange,
  isSameDate,
  seasonStartDate,
  weekdayForDayIndex,
  allStarSundayDate,
  allStarSundayDayIndex,
  allStarBreakDayRange,
  isAllStarBreakDay,
  tradeDeadlineDayIndex,
  isAfterTradeDeadline,
  currentRegularSeasonDayIndex,
  tradesAreClosed,
  targetGamesForDayIndex,
  GAMES_BY_WEEKDAY,
} from "./seasonCalendar";

describe("dayIndexToDate", () => {
  // Opening night is now "the Tuesday on or after October 21" rather than a
  // fixed October 24 - see seasonStartDate. For 2023 the two rules coincide
  // (Oct 24 2023 was a Tuesday), which is why this case is unchanged; 2024
  // and 2025 are covered by the opening-night tests below.
  it("maps day 1 to that season's opening night", () => {
    const date = dayIndexToDate(2023, 1);
    expect(date.getFullYear()).toBe(2023);
    expect(date.getMonth()).toBe(9); // October
    expect(date.getDate()).toBe(24);
  });

  it("increments one calendar day per dayIndex", () => {
    const day2 = dayIndexToDate(2023, 2);
    expect(day2.getMonth()).toBe(9);
    expect(day2.getDate()).toBe(25);
  });

  it("crosses a month boundary correctly", () => {
    // Oct 24 + 7 days = Oct 31; +8 days = Nov 1
    const day8 = dayIndexToDate(2023, 8);
    expect(day8.getMonth()).toBe(9);
    expect(day8.getDate()).toBe(31);
    const day9 = dayIndexToDate(2023, 9);
    expect(day9.getMonth()).toBe(10); // November
    expect(day9.getDate()).toBe(1);
  });

  it("crosses a year boundary correctly", () => {
    // Oct 24 2023 + 69 days = Jan 1 2024
    const date = dayIndexToDate(2023, 70);
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(1);
  });
});

describe("buildMonthGrid", () => {
  it("produces a correct grid for a month starting on Sunday (October 2023)", () => {
    const grid = buildMonthGrid(2023, 9);
    expect(grid[0][0].date?.getDate()).toBe(1);
    expect(grid[0][0].date?.getDay()).toBe(0);
    // 31 days starting on Sunday needs 5 rows, 4 trailing blanks.
    expect(grid).toHaveLength(5);
    const flat = grid.flat();
    expect(flat.filter((c) => c.date === null)).toHaveLength(4);
    expect(flat.filter((c) => c.date !== null)).toHaveLength(31);
  });

  it("produces a correct grid for a month starting on Saturday (April 2023)", () => {
    const grid = buildMonthGrid(2023, 3);
    expect(grid[0].slice(0, 6).every((c) => c.date === null)).toBe(true);
    expect(grid[0][6].date?.getDate()).toBe(1);
    // 30 days with 6 leading blanks needs 6 rows, 6 trailing blanks.
    expect(grid).toHaveLength(6);
    const flat = grid.flat();
    expect(flat.filter((c) => c.date === null)).toHaveLength(12);
    expect(flat.filter((c) => c.date !== null)).toHaveLength(30);
  });

  it("every row has exactly 7 cells", () => {
    const grid = buildMonthGrid(2024, 1); // February 2024 (leap year)
    for (const week of grid) expect(week).toHaveLength(7);
  });
});

describe("getSeasonMonthRange", () => {
  it("returns the (year, month) pairs a season's games actually span", () => {
    const games = [{ dayIndex: 1 }, { dayIndex: 100 }, { dayIndex: 50 }];
    const months = getSeasonMonthRange(games, 2023);
    expect(months[0]).toEqual({ year: 2023, month: 9 }); // October (day 1)
    expect(months[months.length - 1].year).toBeGreaterThanOrEqual(2023);
  });

  it("returns an empty array for no games", () => {
    expect(getSeasonMonthRange([], 2023)).toEqual([]);
  });

  it("is a contiguous month-by-month sequence with no gaps", () => {
    const games = [{ dayIndex: 1 }, { dayIndex: 200 }];
    const months = getSeasonMonthRange(games, 2023);
    for (let i = 1; i < months.length; i++) {
      const prev = new Date(months[i - 1].year, months[i - 1].month, 1);
      prev.setMonth(prev.getMonth() + 1);
      expect(prev.getFullYear()).toBe(months[i].year);
      expect(prev.getMonth()).toBe(months[i].month);
    }
  });
});

describe("isSameDate", () => {
  it("matches same year/month/day regardless of time", () => {
    expect(isSameDate(new Date(2023, 9, 24, 3), new Date(2023, 9, 24, 22))).toBe(true);
  });

  it("does not match a different day", () => {
    expect(isSameDate(new Date(2023, 9, 24), new Date(2023, 9, 25))).toBe(false);
  });
});

const SUNDAY = 0;
const TUESDAY = 2;
const THURSDAY = 4;

describe("seasonStartDate", () => {
  // The rule has to reproduce real openers, because every other fixed point on
  // the calendar is defined as an offset from opening night and only lands on
  // the right weekday if this does.
  it("reproduces four real NBA opening nights", () => {
    expect(seasonStartDate(2023).toDateString()).toBe("Tue Oct 24 2023");
    expect(seasonStartDate(2024).toDateString()).toBe("Tue Oct 22 2024");
    expect(seasonStartDate(2025).toDateString()).toBe("Tue Oct 21 2025");
    // The one that caught the old anchor: Oct 21 2026 is a Wednesday, so
    // "on or after the 21st" skipped a week to Oct 27.
    expect(seasonStartDate(2026).toDateString()).toBe("Tue Oct 20 2026");
  });

  it("never opens later than any real opening night has", () => {
    for (let season = 2020; season <= 2050; season++) {
      const d = seasonStartDate(season);
      expect(d.getMonth(), `season ${season}`).toBe(9); // October
      expect(d.getDate(), `season ${season} opened ${d.toDateString()}`).toBeLessThanOrEqual(26);
    }
  });

  it("always opens on a Tuesday", () => {
    for (let season = 2020; season <= 2050; season++) {
      expect(seasonStartDate(season).getDay(), `season ${season}`).toBe(TUESDAY);
    }
  });
});

describe("fixed calendar points", () => {
  it("puts All-Star Sunday on a Sunday, every season", () => {
    for (let season = 2020; season <= 2050; season++) {
      expect(weekdayForDayIndex(season, allStarSundayDayIndex(season)), `season ${season}`).toBe(
        SUNDAY,
      );
    }
  });

  it("puts the trade deadline on a Thursday, every season", () => {
    for (let season = 2020; season <= 2050; season++) {
      expect(weekdayForDayIndex(season, tradeDeadlineDayIndex(season)), `season ${season}`).toBe(
        THURSDAY,
      );
    }
  });

  it("reproduces real All-Star Sundays", () => {
    expect(allStarSundayDate(2023).toDateString()).toBe("Sun Feb 18 2024");
    expect(allStarSundayDate(2024).toDateString()).toBe("Sun Feb 16 2025");
    expect(allStarSundayDate(2026).toDateString()).toBe("Sun Feb 21 2027");
  });

  it("reproduces real trade deadlines", () => {
    // Each is exactly ten days before that season's All-Star Sunday.
    expect(dayIndexToDate(2023, tradeDeadlineDayIndex(2023)).toDateString()).toBe(
      "Thu Feb 08 2024",
    );
    expect(dayIndexToDate(2024, tradeDeadlineDayIndex(2024)).toDateString()).toBe(
      "Thu Feb 06 2025",
    );
    expect(dayIndexToDate(2026, tradeDeadlineDayIndex(2026)).toDateString()).toBe(
      "Thu Feb 11 2027",
    );
  });

  it("does not use a fixed day offset - the gap to February moves with the season", () => {
    // The bug this replaced: a constant dayIndex assumed opening night sits a
    // fixed distance from the All-Star break. It does not.
    expect(tradeDeadlineDayIndex(2024)).not.toBe(tradeDeadlineDayIndex(2026));
  });

  it("keeps the deadline strictly before the All-Star break", () => {
    for (const season of [2024, 2025, 2026, 2027]) {
      expect(tradeDeadlineDayIndex(season)).toBeLessThan(allStarBreakDayRange(season).start);
    }
  });

  it("marks exactly six days as the All-Star break", () => {
    const range = allStarBreakDayRange(2026);
    const breakDays = [];
    for (let d = 1; d <= 220; d++) if (isAllStarBreakDay(2026, d)) breakDays.push(d);
    expect(breakDays).toHaveLength(6);
    expect(breakDays[0]).toBe(range.start);
    expect(breakDays[breakDays.length - 1]).toBe(range.end);
  });

  it("schedules no games during the break and a real slate either side", () => {
    const r = allStarBreakDayRange(2025);
    for (let d = r.start; d <= r.end; d++) expect(targetGamesForDayIndex(2025, d)).toBe(0);
    expect(targetGamesForDayIndex(2025, r.start - 1)).toBeGreaterThan(0);
    expect(targetGamesForDayIndex(2025, r.end + 1)).toBeGreaterThan(0);
  });

  it("gives Thursday the lightest slate and Friday the heaviest, as the real league does", () => {
    const lightest = Math.min(...GAMES_BY_WEEKDAY);
    const heaviest = Math.max(...GAMES_BY_WEEKDAY);
    expect(GAMES_BY_WEEKDAY[THURSDAY]).toBe(lightest);
    expect(GAMES_BY_WEEKDAY[5]).toBe(heaviest); // Friday
  });
});

describe("trade window", () => {
  const SEASON = 2026;
  const DEADLINE = tradeDeadlineDayIndex(SEASON);
  const game = (dayIndex: number, played: boolean) => ({
    dayIndex,
    playedAt: played ? new Date() : null,
  });

  it("is open before the deadline and shut after it", () => {
    expect(isAfterTradeDeadline(SEASON, DEADLINE - 1)).toBe(false);
    // The deadline day itself is still a trading day.
    expect(isAfterTradeDeadline(SEASON, DEADLINE)).toBe(false);
    expect(isAfterTradeDeadline(SEASON, DEADLINE + 1)).toBe(true);
  });

  it("reads the current day as the next unplayed game", () => {
    const games = [game(1, true), game(2, true), game(9, false), game(4, false)];
    expect(currentRegularSeasonDayIndex(games)).toBe(4);
  });

  it("reopens trading once the regular season is complete", () => {
    // Every game played: past the deadline by day index, but the season is
    // over, so the playoffs and offseason trade freely - as in reality.
    const finished = [game(DEADLINE + 40, true)];
    expect(currentRegularSeasonDayIndex(finished)).toBeNull();
    expect(tradesAreClosed(SEASON, finished)).toBe(false);
  });

  it("closes trading mid-season once the deadline has passed", () => {
    const midSeason = [game(DEADLINE, true), game(DEADLINE + 1, false)];
    expect(tradesAreClosed(SEASON, midSeason)).toBe(true);
  });

  it("keeps trading open the day before the deadline", () => {
    const before = [game(DEADLINE - 1, false), game(DEADLINE + 5, false)];
    expect(tradesAreClosed(SEASON, before)).toBe(false);
  });
});
