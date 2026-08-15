import { describe, expect, it } from "vitest";
import {
  contractYearSalaries,
  maxRaiseFor,
  BIRD_RIGHTS_MAX_RAISE,
  STANDARD_MAX_RAISE,
} from "./contractRaises";

const FIRST_YEAR = 20_000_000_00n;
const usd = (cents: bigint) => Number(cents) / 100 / 1_000_000;

describe("maxRaiseFor", () => {
  it("gives Bird rights the higher ceiling", () => {
    expect(maxRaiseFor("BIRD_RIGHTS")).toBe(BIRD_RIGHTS_MAX_RAISE);
    expect(BIRD_RIGHTS_MAX_RAISE).toBeGreaterThan(STANDARD_MAX_RAISE);
  });

  it("gives every other mechanism the standard ceiling", () => {
    for (const mechanism of [
      "NONE",
      "VETERAN_MINIMUM",
      "MID_LEVEL_NON_TAXPAYER",
      "MID_LEVEL_TAXPAYER",
    ] as const) {
      expect(maxRaiseFor(mechanism)).toBe(STANDARD_MAX_RAISE);
    }
  });

  it("falls back to the conservative ceiling for an unknown mechanism", () => {
    // Wrongly granting 8% inflates payrolls league-wide; wrongly granting 5%
    // understates one deal.
    expect(maxRaiseFor(null)).toBe(STANDARD_MAX_RAISE);
    expect(maxRaiseFor(undefined)).toBe(STANDARD_MAX_RAISE);
  });
});

describe("contractYearSalaries", () => {
  it("starts at the agreed first-year salary", () => {
    expect(contractYearSalaries(FIRST_YEAR, 4, "NONE")[0]).toBe(FIRST_YEAR);
  });

  it("raises off the first year rather than compounding", () => {
    // The real CBA rule: each raise is a percentage of year one, so the
    // increments are equal. Compounding would make them grow.
    const years = contractYearSalaries(FIRST_YEAR, 4, "NONE").map(Number);
    const steps = [years[1] - years[0], years[2] - years[1], years[3] - years[2]];
    expect(steps[0]).toBeCloseTo(steps[1], -2);
    expect(steps[1]).toBeCloseTo(steps[2], -2);
  });

  it("pays a Bird re-signing more by the final year than a cap-space deal", () => {
    const bird = contractYearSalaries(FIRST_YEAR, 5, "BIRD_RIGHTS");
    const capSpace = contractYearSalaries(FIRST_YEAR, 5, "NONE");
    expect(bird[0]).toBe(capSpace[0]);
    expect(usd(bird[4])).toBeCloseTo(usd(FIRST_YEAR) * 1.32, 1);
    expect(usd(capSpace[4])).toBeCloseTo(usd(FIRST_YEAR) * 1.2, 1);
  });

  /**
   * The regression this exists for. CPU re-signings and CPU free-agent
   * signings wrote the same figure into every year, so a CPU club's payroll
   * never grew across a deal and its future apron position was too healthy.
   * See docs/CONTRACT_AUDIT.md C-P2-3.
   */
  it("never produces a flat schedule for a multi-year deal", () => {
    for (const mechanism of ["BIRD_RIGHTS", "NONE", "VETERAN_MINIMUM"] as const) {
      const years = contractYearSalaries(FIRST_YEAR, 3, mechanism);
      expect(years[2]).toBeGreaterThan(years[0]);
    }
  });

  it("returns exactly the requested number of years", () => {
    for (const years of [1, 2, 3, 4, 5]) {
      expect(contractYearSalaries(FIRST_YEAR, years, "NONE")).toHaveLength(years);
    }
  });

  it("treats a zero or negative term as a single year rather than an empty deal", () => {
    // A contract with no years is invisible to every cap sheet in the product.
    expect(contractYearSalaries(FIRST_YEAR, 0, "NONE")).toHaveLength(1);
    expect(contractYearSalaries(FIRST_YEAR, -2, "NONE")).toHaveLength(1);
  });
});
