import { describe, expect, it } from "vitest";
import { computePerformanceScore, evaluatePlayer } from "./playerValue";

describe("computePerformanceScore", () => {
  it("scores a league-average statline near 50", () => {
    const score = computePerformanceScore({
      winSharesPer48: 0.1,
      boxPlusMinus: 0,
      valueOverReplacement: 0,
    });
    expect(score).toBeCloseTo(50, 0);
  });

  it("scores an elite statline well above average", () => {
    const score = computePerformanceScore({
      winSharesPer48: 0.25,
      boxPlusMinus: 9,
      valueOverReplacement: 8,
    });
    expect(score).toBeGreaterThan(80);
  });

  it("clamps to the 0-100 range for extreme inputs", () => {
    expect(
      computePerformanceScore({ winSharesPer48: -1, boxPlusMinus: -30, valueOverReplacement: -10 }),
    ).toBe(0);
    expect(
      computePerformanceScore({ winSharesPer48: 1, boxPlusMinus: 30, valueOverReplacement: 20 }),
    ).toBe(100);
  });
});

describe("evaluatePlayer", () => {
  it("flags a star player on a below-market rookie deal as a large surplus", () => {
    const result = evaluatePlayer({
      season: 2025,
      age: 24,
      stats: { winSharesPer48: 0.22, boxPlusMinus: 7, valueOverReplacement: 6 },
      actualSalaryCents: 12_000_000_00n,
    });

    expect(result.surplusValueCents).toBeGreaterThan(0n);
    expect(result.surplusValuePct).toBeGreaterThan(0.5);
  });

  it("flags an aging, overpaid, declining player as negative surplus", () => {
    const result = evaluatePlayer({
      season: 2025,
      age: 37,
      stats: { winSharesPer48: 0.05, boxPlusMinus: -2, valueOverReplacement: 0.5 },
      actualSalaryCents: 40_000_000_00n,
    });

    expect(result.surplusValueCents).toBeLessThan(0n);
  });

  it("values the same production lower for an older player than a younger one", () => {
    const stats = { winSharesPer48: 0.15, boxPlusMinus: 4, valueOverReplacement: 3 };
    const young = evaluatePlayer({
      season: 2025,
      age: 23,
      stats,
      actualSalaryCents: 10_000_000_00n,
    });
    const old = evaluatePlayer({
      season: 2025,
      age: 35,
      stats,
      actualSalaryCents: 10_000_000_00n,
    });

    expect(young.estimatedMarketValueCents).toBeGreaterThan(old.estimatedMarketValueCents);
  });

  it("caps estimated market value below the max-contract ceiling even for max stats", () => {
    const result = evaluatePlayer({
      season: 2025,
      age: 27,
      stats: { winSharesPer48: 0.3, boxPlusMinus: 12, valueOverReplacement: 10 },
      actualSalaryCents: 0n,
    });
    const rules = { salaryCapCents: 154_647_000_00n };
    expect(Number(result.estimatedMarketValueCents)).toBeLessThan(
      Number(rules.salaryCapCents) * 0.36,
    );
  });
});
