import { describe, it, expect } from "vitest";
import type { CanonicalSeasonStat } from "./canonical";
import {
  computeSeedOverallRating,
  computeSeedPotentialRating,
  sampleConfidence,
  seedProductionScore,
} from "./seedRating";

function stat(over: Partial<CanonicalSeasonStat>): CanonicalSeasonStat {
  return {
    season: 2025,
    team: "XXX",
    gamesPlayed: 70,
    minutesPerGame: 30,
    pointsPerGame: 15,
    reboundsPerGame: 5,
    assistsPerGame: 3,
    stealsPerGame: 1,
    blocksPerGame: 0.5,
    turnoversPerGame: 1.6,
    fgPct: 0.47,
    fg3Pct: 0.36,
    ftPct: 0.8,
    trueShootingPct: 0.57,
    usagePct: null,
    winSharesPer48: null,
    boxPlusMinus: null,
    valueOverReplacement: null,
    ...over,
  };
}

// A superstar-shaped, full-season line (Jokic-ish).
const STAR = stat({
  gamesPlayed: 66,
  minutesPerGame: 34,
  pointsPerGame: 27,
  reboundsPerGame: 12.5,
  assistsPerGame: 10,
  stealsPerGame: 1.4,
  blocksPerGame: 0.7,
  turnoversPerGame: 3.2,
  trueShootingPct: 0.66,
});

// An efficient but low-minute, deep-bench big - the archetype the old model
// wrongly inflated to 99.
const BENCH_BIG = stat({
  gamesPlayed: 40,
  minutesPerGame: 14,
  pointsPerGame: 5,
  reboundsPerGame: 5,
  assistsPerGame: 0.7,
  stealsPerGame: 0.4,
  blocksPerGame: 1.0,
  turnoversPerGame: 0.9,
  trueShootingPct: 0.66,
});

describe("computeSeedOverallRating", () => {
  it("rates a full-season superstar as elite (>=90)", () => {
    expect(computeSeedOverallRating(STAR)).toBeGreaterThanOrEqual(90);
  });

  it("does not inflate an efficient low-minute bench big (the old 99 bug)", () => {
    const r = computeSeedOverallRating(BENCH_BIG);
    expect(r).toBeLessThan(80);
    expect(computeSeedOverallRating(STAR)).toBeGreaterThan(r + 12);
  });

  it("regresses a tiny sample toward the fringe baseline even with gaudy rates", () => {
    const gaudyButTiny = stat({
      gamesPlayed: 6,
      minutesPerGame: 12,
      pointsPerGame: 22,
      trueShootingPct: 0.7,
    });
    // A 6-game hot streak should not read as a star.
    expect(computeSeedOverallRating(gaudyButTiny)).toBeLessThan(80);
  });

  it("stays within the 60-99 band at both extremes", () => {
    const absurd = stat({
      pointsPerGame: 60,
      assistsPerGame: 15,
      reboundsPerGame: 20,
      minutesPerGame: 42,
    });
    const empty = stat({
      pointsPerGame: 1,
      reboundsPerGame: 0.5,
      assistsPerGame: 0.2,
      minutesPerGame: 5,
      gamesPlayed: 12,
      trueShootingPct: 0.4,
    });
    expect(computeSeedOverallRating(absurd)).toBeLessThanOrEqual(99);
    expect(computeSeedOverallRating(empty)).toBeGreaterThanOrEqual(60);
  });

  it("falls back to a league-average TS when it is missing, without throwing", () => {
    expect(() => computeSeedOverallRating(stat({ trueShootingPct: null }))).not.toThrow();
  });
});

describe("sampleConfidence", () => {
  it("is high for a full workload and low for a sparse one", () => {
    expect(sampleConfidence(70, 32)).toBeGreaterThan(0.9);
    expect(sampleConfidence(8, 10)).toBeLessThan(0.3);
  });
});

describe("seedProductionScore top-end compression", () => {
  it("compresses above the knee so elite lines do not run away", () => {
    const elite = seedProductionScore(STAR);
    const superElite = seedProductionScore(
      stat({
        pointsPerGame: 40,
        assistsPerGame: 12,
        reboundsPerGame: 14,
        minutesPerGame: 38,
        trueShootingPct: 0.7,
      }),
    );
    // A far gaudier line is only modestly higher, not linearly higher.
    expect(superElite - elite).toBeLessThan(10);
  });
});

describe("computeSeedPotentialRating", () => {
  it("gives youth headroom and none to veterans", () => {
    expect(computeSeedPotentialRating(75, 20)).toBeGreaterThan(75);
    expect(computeSeedPotentialRating(75, 31)).toBe(75);
    expect(computeSeedPotentialRating(95, 19)).toBeLessThanOrEqual(99);
  });
});
