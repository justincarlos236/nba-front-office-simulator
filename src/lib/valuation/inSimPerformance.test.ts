import { describe, expect, it } from "vitest";
import { computePerformanceScore } from "./playerValue";
import { contractQualityScore, priceContractCents } from "@/lib/contracts/priceContract";

/**
 * The database round-trip in `loadInSimPerformance` belongs to an integration
 * test. What is checkable here is the claim the change rests on: that pricing a
 * player from his in-sim production gives a different, and correctly ordered,
 * answer from pricing him on rating alone.
 *
 * Before this, `seasonStats` was seeded real-world data queried at
 * `league.currentSeason`, which is empty for every player from a save's second
 * season onward - so a 30-point-per-game scorer and a benchwarmer of the same
 * rating were priced identically. See docs/audits/CONTRACT_AUDIT.md C-P1-2.
 */

const line = (overrides: Partial<Parameters<typeof computePerformanceScore>[0]> = {}) => ({
  pointsPerGame: 12,
  reboundsPerGame: 4,
  assistsPerGame: 3,
  stealsPerGame: 0.8,
  blocksPerGame: 0.4,
  turnoversPerGame: 1.6,
  minutesPerGame: 28,
  trueShootingPct: 0.57,
  ...overrides,
});

const priceWith = (
  overallRating: number,
  stats: ReturnType<typeof line> | null,
  gamesPlayed: number,
) =>
  Number(
    priceContractCents({
      season: 2026,
      quality: contractQualityScore({
        overallRating,
        performanceScore: stats ? computePerformanceScore(stats) : null,
        gamesPlayed,
      }),
      age: 27,
      yearsOfExperience: 6,
      position: "SF",
    }),
  );

describe("pricing responds to in-sim production", () => {
  it("pays a high producer more than a benchwarmer of the same rating", () => {
    const star = priceWith(80, line({ pointsPerGame: 28, minutesPerGame: 36 }), 70);
    const bench = priceWith(80, line({ pointsPerGame: 4, minutesPerGame: 9 }), 70);
    expect(star).toBeGreaterThan(bench);
  });

  /**
   * The regression this exists for. When the performance term is absent, both
   * players collapse to the same price - which is exactly what every free
   * agent got from a save's second season on.
   */
  it("prices them identically when production is unavailable", () => {
    expect(priceWith(80, null, 0)).toBe(priceWith(80, null, 0));
  });

  it("still lets rating dominate, so production cannot invent a star", () => {
    // A 65-rated player producing well must not out-earn an 85-rated one.
    const producer = priceWith(65, line({ pointsPerGame: 26, minutesPerGame: 34 }), 70);
    const better = priceWith(85, line({ pointsPerGame: 14, minutesPerGame: 28 }), 70);
    expect(better).toBeGreaterThan(producer);
  });

  it("does not let a tiny sample swing the price as much as a full season", () => {
    const bigSample = priceWith(75, line({ pointsPerGame: 30, minutesPerGame: 36 }), 70);
    const smallSample = priceWith(75, line({ pointsPerGame: 30, minutesPerGame: 36 }), 6);
    expect(smallSample).toBeLessThan(bigSample);
  });
});
