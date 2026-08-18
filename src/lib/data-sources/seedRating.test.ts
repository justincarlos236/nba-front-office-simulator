import { describe, it, expect } from "vitest";
import type { CanonicalSeasonStat } from "./canonical";
import {
  computeSeedOverallRating,
  computeSeedPotentialRating,
  sampleConfidence,
  seedPriorFromSalary,
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

/**
 * The salary prior, added after docs/audits/RATING_AUDIT.md found the regression had
 * none: every unproven line was pulled toward a flat 67, which rated Anthony
 * Davis 76 on a max contract and needed a hand-written override list to rescue
 * fifteen stars one at a time.
 */
describe("seedPriorFromSalary", () => {
  const CAP = 154_647_000_00;

  it("rises with salary", () => {
    const fractions = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
    const priors = fractions.map((f) => seedPriorFromSalary(CAP * f, CAP)!);
    for (let i = 1; i < priors.length; i++) {
      expect(priors[i]).toBeGreaterThanOrEqual(priors[i - 1]);
    }
  });

  it("puts a max-salary player near the top of the scale", () => {
    expect(seedPriorFromSalary(CAP * 0.35, CAP)!).toBeGreaterThanOrEqual(88);
  });

  it("puts a minimum-salary player near the fringe baseline", () => {
    expect(seedPriorFromSalary(CAP * 0.015, CAP)!).toBeLessThanOrEqual(74);
  });

  it("interpolates between the measured anchors rather than stepping", () => {
    const lo = seedPriorFromSalary(CAP * 0.225, CAP)!;
    const mid = seedPriorFromSalary(CAP * 0.25, CAP)!;
    const hi = seedPriorFromSalary(CAP * 0.275, CAP)!;
    expect(mid).toBeGreaterThan(lo);
    expect(mid).toBeLessThan(hi);
  });

  it("is flat outside the measured range rather than extrapolating", () => {
    expect(seedPriorFromSalary(CAP * 0.9, CAP)).toBe(seedPriorFromSalary(CAP * 0.35, CAP));
    expect(seedPriorFromSalary(1, CAP)).toBe(seedPriorFromSalary(CAP * 0.005, CAP));
  });

  it("returns null when there is no salary to read", () => {
    expect(seedPriorFromSalary(0, CAP)).toBeNull();
    expect(seedPriorFromSalary(-1, CAP)).toBeNull();
    expect(seedPriorFromSalary(CAP * 0.2, 0)).toBeNull();
  });
});

describe("computeSeedOverallRating - the prior only applies where evidence is thin", () => {
  const line = (gamesPlayed: number) =>
    ({
      season: 2025,
      team: "BOS",
      gamesPlayed,
      minutesPerGame: 33,
      pointsPerGame: 22,
      reboundsPerGame: 6,
      assistsPerGame: 5,
      stealsPerGame: 1.2,
      blocksPerGame: 0.4,
      turnoversPerGame: 2.4,
      trueShootingPct: 0.58,
    }) as CanonicalSeasonStat;

  it("ignores the prior when a full season stands behind the line", () => {
    expect(computeSeedOverallRating(line(78), 90)).toBe(computeSeedOverallRating(line(78), 60));
  });

  it("leans on the prior when the sample is short", () => {
    expect(computeSeedOverallRating(line(15), 90)).toBeGreaterThan(
      computeSeedOverallRating(line(15), 67),
    );
  });

  /**
   * The regression test for R-P0-1. Jayson Tatum played 16 games and the model,
   * unaided, rated him 74 - a rotation player - which is what the override list
   * existed to undo.
   */
  it("keeps a star on an injury-shortened season near star level", () => {
    const withMarketPrior = computeSeedOverallRating(line(16), 89);
    expect(withMarketPrior).toBeGreaterThan(83);
  });

  it("still regresses an unproven player with no prior", () => {
    expect(computeSeedOverallRating(line(10))).toBeLessThan(computeSeedOverallRating(line(78)));
  });
});
