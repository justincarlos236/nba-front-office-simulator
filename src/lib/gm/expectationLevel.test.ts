import { describe, expect, it } from "vitest";
import { computeExpectationLevel, EXPECTATION_LEVEL_ORDER } from "./expectationLevel";

/**
 * These are TEAM-STRENGTH values, not player ratings, and the two live on
 * different scales - a team strength is a weighted roster average and clusters
 * far more tightly than any one player's rating. The league runs roughly
 * 75.5-85.0 (see docs/audits/TEAM_STRENGTH_AUDIT.md), so "elite" is about 82.6 and
 * "weak" about 78.7.
 *
 * The old fixtures used 60/72/82/85, which read as player ratings and are what
 * hid the bug this file now guards: against the previous weights the thresholds
 * sat at 80/65 and the league only ever spanned 73-79, so neither could fire
 * and every team in every save got its payroll tier's base expectation.
 */
const ELITE = 83.5;
const AVERAGE = 80.5;
const WEAK = 77.0;

describe("computeExpectationLevel", () => {
  it("gives a modest-payroll, average-quality roster the lowest expectation", () => {
    expect(computeExpectationLevel("MODEST", AVERAGE)).toBe("DEVELOP_YOUNG_PLAYERS");
  });

  it("bumps a modest-payroll team up a level if the roster is elite", () => {
    expect(computeExpectationLevel("MODEST", ELITE)).toBe("COMPETE_FOR_PLAY_IN");
  });

  it("gives an extreme-payroll, elite roster the highest expectation", () => {
    expect(computeExpectationLevel("EXTREME", ELITE)).toBe("CHAMPIONSHIP_CONTENTION");
  });

  it("gives an extreme-payroll but weak roster some benefit of the doubt", () => {
    expect(computeExpectationLevel("EXTREME", WEAK)).toBe("WIN_PLAYOFF_SERIES");
  });

  it("never goes below the lowest or above the highest expectation level", () => {
    expect(computeExpectationLevel("MODEST", 10)).toBe(EXPECTATION_LEVEL_ORDER[0]);
    expect(computeExpectationLevel("EXTREME", 99)).toBe(
      EXPECTATION_LEVEL_ORDER[EXPECTATION_LEVEL_ORDER.length - 1],
    );
  });

  it("orders significant-tax teams above moderate-payroll teams at equal roster quality", () => {
    const moderate = EXPECTATION_LEVEL_ORDER.indexOf(computeExpectationLevel("MODERATE", AVERAGE));
    const significant = EXPECTATION_LEVEL_ORDER.indexOf(
      computeExpectationLevel("SIGNIFICANT", AVERAGE),
    );
    expect(significant).toBeGreaterThan(moderate);
  });

  // The regression this file exists for now.
  it("actually distinguishes rosters on the team-strength scale", () => {
    const weak = EXPECTATION_LEVEL_ORDER.indexOf(computeExpectationLevel("MODERATE", WEAK));
    const average = EXPECTATION_LEVEL_ORDER.indexOf(computeExpectationLevel("MODERATE", AVERAGE));
    const elite = EXPECTATION_LEVEL_ORDER.indexOf(computeExpectationLevel("MODERATE", ELITE));
    expect(weak).toBeLessThan(average);
    expect(average).toBeLessThan(elite);
  });
});
