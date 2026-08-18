import { describe, expect, it } from "vitest";
import { currentSeasonSalaryCents } from "./currentSeasonSalary";

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
