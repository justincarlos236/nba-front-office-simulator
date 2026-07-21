import { describe, expect, it } from "vitest";
import { computeMultiYearProjection } from "./multiYearProjection";
import { getSeasonCapRules } from "./constants";

describe("computeMultiYearProjection", () => {
  it("sums committed salary per season and computes remaining cap space", () => {
    const rules2025 = getSeasonCapRules(2025);
    const result = computeMultiYearProjection(
      [
        { season: 2025, salaryCents: 30_000_000_00n },
        { season: 2025, salaryCents: 20_000_000_00n },
        { season: 2026, salaryCents: 30_000_000_00n },
      ],
      2025,
      4,
    );

    expect(result).toHaveLength(4);
    expect(result[0].season).toBe(2025);
    expect(result[0].committedSalaryCents).toBe(50_000_000_00n);
    expect(result[0].playersUnderContract).toBe(2);
    expect(result[0].projectedCapSpaceCents).toBe(rules2025.salaryCapCents - 50_000_000_00n);
  });

  it("shows a season tapering off as contracts expire", () => {
    const result = computeMultiYearProjection(
      [
        { season: 2025, salaryCents: 40_000_000_00n },
        { season: 2026, salaryCents: 40_000_000_00n },
      ],
      2025,
      4,
    );
    // 2027/2028 have no contract years at all - fully expired.
    expect(result[2].committedSalaryCents).toBe(0n);
    expect(result[3].committedSalaryCents).toBe(0n);
    expect(result[2].playersUnderContract).toBe(0);
  });

  it("clamps projected cap space at 0 once committed salary exceeds the cap", () => {
    const rules = getSeasonCapRules(2025);
    const result = computeMultiYearProjection(
      [{ season: 2025, salaryCents: rules.salaryCapCents + 50_000_000_00n }],
      2025,
      1,
    );
    expect(result[0].projectedCapSpaceCents).toBe(0n);
  });

  it("returns exactly yearsAhead entries starting at startSeason", () => {
    const result = computeMultiYearProjection([], 2030, 3);
    expect(result.map((r) => r.season)).toEqual([2030, 2031, 2032]);
  });
});
