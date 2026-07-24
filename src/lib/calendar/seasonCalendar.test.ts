import { describe, expect, it } from "vitest";
import { dayIndexToDate, buildMonthGrid, getSeasonMonthRange, isSameDate } from "./seasonCalendar";

describe("dayIndexToDate", () => {
  it("maps day 1 to the October 24 anchor date for that season", () => {
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
