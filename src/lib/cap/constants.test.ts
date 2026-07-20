import { describe, expect, it } from "vitest";
import { getSeasonCapRules, SEASON_CAP_RULES } from "./constants";

describe("getSeasonCapRules", () => {
  it("returns exact hand-entered figures for a known season", () => {
    const rules = getSeasonCapRules(2024);
    expect(rules).toEqual(SEASON_CAP_RULES.find((r) => r.season === 2024));
  });

  it("projects the cap forward with growth for seasons past the known table", () => {
    const latest = SEASON_CAP_RULES[SEASON_CAP_RULES.length - 1];
    const projected = getSeasonCapRules(latest.season + 1);
    expect(projected.season).toBe(latest.season + 1);
    expect(projected.salaryCapCents).toBeGreaterThan(latest.salaryCapCents);
  });

  it("compounds growth for multiple seasons out", () => {
    const latest = SEASON_CAP_RULES[SEASON_CAP_RULES.length - 1];
    const oneYearOut = getSeasonCapRules(latest.season + 1);
    const twoYearsOut = getSeasonCapRules(latest.season + 2);
    expect(twoYearsOut.salaryCapCents).toBeGreaterThan(oneYearOut.salaryCapCents);
  });

  it("falls back to the closest known season for a season before the table", () => {
    const earliest = SEASON_CAP_RULES[0];
    const rules = getSeasonCapRules(earliest.season - 5);
    expect(rules).toEqual(earliest);
  });
});
