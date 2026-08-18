import { describe, expect, it } from "vitest";
import { currentSeasonSalaryCents, futureSalaryCents } from "./currentSeasonSalary";

describe("currentSeasonSalaryCents", () => {
  it("returns the salary for the requested season, not the first array element", () => {
    // Years deliberately out of order, with the current season in the middle.
    const contract = {
      years: [
        { season: 2025, salaryCents: 10_000_000_00n },
        { season: 2026, salaryCents: 12_000_000_00n },
        { season: 2027, salaryCents: 14_000_000_00n },
      ],
    };

    expect(currentSeasonSalaryCents(contract, 2026)).toBe(12_000_000_00n);
    // The fragile pattern this replaces would have returned the 2025 figure.
    expect(currentSeasonSalaryCents(contract, 2026)).not.toBe(contract.years[0].salaryCents);
  });

  it("resolves the current season even when the array is unordered", () => {
    const contract = {
      years: [
        { season: 2028, salaryCents: 16_000_000_00n },
        { season: 2026, salaryCents: 12_000_000_00n },
        { season: 2027, salaryCents: 14_000_000_00n },
      ],
    };

    expect(currentSeasonSalaryCents(contract, 2026)).toBe(12_000_000_00n);
  });

  it("returns 0 when the contract does not cover the season", () => {
    const contract = { years: [{ season: 2027, salaryCents: 14_000_000_00n }] };
    expect(currentSeasonSalaryCents(contract, 2026)).toBe(0n);
  });

  it("returns 0 for a null or undefined contract", () => {
    expect(currentSeasonSalaryCents(null, 2026)).toBe(0n);
    expect(currentSeasonSalaryCents(undefined, 2026)).toBe(0n);
  });
});

describe("futureSalaryCents", () => {
  const contract = {
    years: [
      { season: 2027, salaryCents: 14_000_000_00n },
      { season: 2025, salaryCents: 10_000_000_00n },
      { season: 2026, salaryCents: 12_000_000_00n },
    ],
  };

  it("returns only the seasons after the one asked for, earliest first", () => {
    expect(futureSalaryCents(contract, 2025)).toEqual([12_000_000_00n, 14_000_000_00n]);
  });

  it("does not depend on the order the years were loaded in", () => {
    // The pattern this replaces was `years.slice(1)`, which is only correct
    // when the query filtered to `season >= current` and ordered ascending.
    const reversed = { years: [...contract.years].reverse() };
    expect(futureSalaryCents(reversed, 2025)).toEqual(futureSalaryCents(contract, 2025));
  });

  it("keeps a year that starts after the season asked for", () => {
    // A deal that has not begun yet. `slice(1)` treated its first year as the
    // current one and dropped it, so the whole first season vanished from
    // valuation - the current-season read returns 0 for it too.
    const notYetStarted = { years: [{ season: 2027, salaryCents: 9_000_000_00n }] };
    expect(currentSeasonSalaryCents(notYetStarted, 2025)).toBe(0n);
    expect(notYetStarted.years.slice(1)).toEqual([]);
    expect(futureSalaryCents(notYetStarted, 2025)).toEqual([9_000_000_00n]);
  });

  it("returns nothing for an expiring deal or no contract at all", () => {
    expect(futureSalaryCents({ years: [{ season: 2025, salaryCents: 1n }] }, 2025)).toEqual([]);
    expect(futureSalaryCents(null, 2025)).toEqual([]);
    expect(futureSalaryCents(undefined, 2025)).toEqual([]);
  });
});
