import { describe, expect, it } from "vitest";
import { computePerformanceScore, evaluatePlayer } from "./playerValue";

const AVERAGE_STATLINE = {
  pointsPerGame: 15,
  reboundsPerGame: 5,
  assistsPerGame: 3,
  stealsPerGame: 1,
  blocksPerGame: 0.5,
  turnoversPerGame: 1.5,
  minutesPerGame: 24,
  trueShootingPct: 0.56,
};

const ELITE_STATLINE = {
  pointsPerGame: 30,
  reboundsPerGame: 11,
  assistsPerGame: 8,
  stealsPerGame: 1.5,
  blocksPerGame: 1,
  turnoversPerGame: 3,
  minutesPerGame: 35,
  trueShootingPct: 0.63,
};

describe("computePerformanceScore", () => {
  it("scores a league-average statline near the 72 baseline", () => {
    expect(computePerformanceScore(AVERAGE_STATLINE)).toBeCloseTo(72, 0);
  });

  it("scores an elite statline well above average", () => {
    expect(computePerformanceScore(ELITE_STATLINE)).toBeGreaterThan(90);
  });

  it("clamps to the 60-99 NBA-2K-style range for extreme inputs", () => {
    expect(
      computePerformanceScore({
        pointsPerGame: 0,
        reboundsPerGame: 0,
        assistsPerGame: 0,
        stealsPerGame: 0,
        blocksPerGame: 0,
        turnoversPerGame: 10,
        minutesPerGame: 0,
        trueShootingPct: 0,
      }),
    ).toBe(60);
    expect(
      computePerformanceScore({
        pointsPerGame: 60,
        reboundsPerGame: 25,
        assistsPerGame: 20,
        stealsPerGame: 5,
        blocksPerGame: 5,
        turnoversPerGame: 0,
        minutesPerGame: 48,
        trueShootingPct: 0.75,
      }),
    ).toBe(99);
  });
});

describe("evaluatePlayer", () => {
  it("flags a star player on a below-market rookie deal as a large surplus", () => {
    const result = evaluatePlayer({
      season: 2025,
      age: 24,
      stats: ELITE_STATLINE,
      actualSalaryCents: 12_000_000_00n,
    });

    expect(result.surplusValueCents).toBeGreaterThan(0n);
    expect(result.surplusValuePct).toBeGreaterThan(0.5);
  });

  it("flags an aging, overpaid, declining player as negative surplus", () => {
    const result = evaluatePlayer({
      season: 2025,
      age: 37,
      stats: {
        pointsPerGame: 10,
        reboundsPerGame: 3,
        assistsPerGame: 2,
        stealsPerGame: 0.5,
        blocksPerGame: 0.2,
        turnoversPerGame: 1.5,
        minutesPerGame: 18,
        trueShootingPct: 0.52,
      },
      actualSalaryCents: 40_000_000_00n,
    });

    expect(result.surplusValueCents).toBeLessThan(0n);
  });

  it("values the same production lower for an older player than a younger one", () => {
    const young = evaluatePlayer({
      season: 2025,
      age: 23,
      stats: AVERAGE_STATLINE,
      actualSalaryCents: 10_000_000_00n,
    });
    const old = evaluatePlayer({
      season: 2025,
      age: 35,
      stats: AVERAGE_STATLINE,
      actualSalaryCents: 10_000_000_00n,
    });

    expect(young.estimatedMarketValueCents).toBeGreaterThan(old.estimatedMarketValueCents);
  });

  it("caps estimated market value below the max-contract ceiling even for max stats", () => {
    const result = evaluatePlayer({
      season: 2025,
      age: 27,
      stats: {
        pointsPerGame: 60,
        reboundsPerGame: 25,
        assistsPerGame: 20,
        stealsPerGame: 5,
        blocksPerGame: 5,
        turnoversPerGame: 0,
        minutesPerGame: 48,
        trueShootingPct: 0.75,
      },
      actualSalaryCents: 0n,
    });
    const salaryCapCents = 154_647_000_00n;
    expect(Number(result.estimatedMarketValueCents)).toBeLessThan(Number(salaryCapCents) * 0.36);
  });
});
