import { describe, expect, it } from "vitest";
import { computeExpectationLevel, EXPECTATION_LEVEL_ORDER } from "./expectationLevel";

describe("computeExpectationLevel", () => {
  it("gives a modest-payroll, average-quality roster the lowest expectation", () => {
    expect(computeExpectationLevel("MODEST", 72)).toBe("DEVELOP_YOUNG_PLAYERS");
  });

  it("bumps a modest-payroll team up a level if the roster is elite", () => {
    expect(computeExpectationLevel("MODEST", 82)).toBe("COMPETE_FOR_PLAY_IN");
  });

  it("gives an extreme-payroll, elite roster the highest expectation", () => {
    expect(computeExpectationLevel("EXTREME", 85)).toBe("CHAMPIONSHIP_CONTENTION");
  });

  it("gives an extreme-payroll but weak roster some benefit of the doubt", () => {
    expect(computeExpectationLevel("EXTREME", 60)).toBe("WIN_PLAYOFF_SERIES");
  });

  it("never goes below the lowest or above the highest expectation level", () => {
    expect(computeExpectationLevel("MODEST", 10)).toBe(EXPECTATION_LEVEL_ORDER[0]);
    expect(computeExpectationLevel("EXTREME", 99)).toBe(
      EXPECTATION_LEVEL_ORDER[EXPECTATION_LEVEL_ORDER.length - 1],
    );
  });

  it("orders significant-tax teams above moderate-payroll teams at equal roster quality", () => {
    const moderate = EXPECTATION_LEVEL_ORDER.indexOf(computeExpectationLevel("MODERATE", 72));
    const significant = EXPECTATION_LEVEL_ORDER.indexOf(computeExpectationLevel("SIGNIFICANT", 72));
    expect(significant).toBeGreaterThan(moderate);
  });
});
