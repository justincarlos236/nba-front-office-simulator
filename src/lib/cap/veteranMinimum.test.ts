import { describe, expect, it } from "vitest";
import { veteranMinimumCents, leagueMinimumCents } from "./veteranMinimum";
import { getSeasonCapRules } from "./constants";

const usd = (cents: bigint) => Number(cents) / 100 / 1_000_000;

describe("veteranMinimumCents", () => {
  it("reproduces the real 2025-26 scale", () => {
    // Published: about $1.27M for a rookie, about $3.64M at ten years.
    expect(usd(veteranMinimumCents(2025, 0))).toBeCloseTo(1.27, 1);
    expect(usd(veteranMinimumCents(2025, 10))).toBeCloseTo(3.64, 1);
  });

  it("never decreases with service", () => {
    for (let years = 1; years <= 12; years++) {
      expect(veteranMinimumCents(2025, years)).toBeGreaterThanOrEqual(
        veteranMinimumCents(2025, years - 1),
      );
    }
  });

  it("flattens above ten years rather than growing forever", () => {
    expect(veteranMinimumCents(2025, 20)).toBe(veteranMinimumCents(2025, 10));
  });

  it("scales with the cap across seasons", () => {
    // The CBA ties the minimum scale to the cap, which is why this is stored
    // as a fraction rather than a second table of dollar figures.
    const ratio =
      Number(getSeasonCapRules(2025).salaryCapCents) /
      Number(getSeasonCapRules(2023).salaryCapCents);
    expect(Number(veteranMinimumCents(2025, 5)) / Number(veteranMinimumCents(2023, 5))).toBeCloseTo(
      ratio,
      5,
    );
  });

  it("treats an unknown service length as a rookie, the lowest rung", () => {
    expect(leagueMinimumCents(2025)).toBe(veteranMinimumCents(2025, 0));
    expect(veteranMinimumCents(2025, -3)).toBe(veteranMinimumCents(2025, 0));
  });

  /**
   * C-P2-1: the minimum used to be `emptyRosterChargeCents`, the cap hold for
   * an empty roster spot - a different rule, and about a third of a ten-year
   * veteran's real minimum.
   */
  it("pays a ten-year veteran well above the empty-roster cap hold", () => {
    const hold = getSeasonCapRules(2025).emptyRosterChargeCents;
    expect(Number(veteranMinimumCents(2025, 10))).toBeGreaterThan(Number(hold) * 2.5);
  });
});
