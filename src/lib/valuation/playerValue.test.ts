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

// A real 2023-24 rotation player who plays modest minutes but is
// genuinely productive on a per-minute basis - the case the minutes
// double-penalty used to crush unfairly (see the fix comment in
// playerValue.ts). Loosely modeled on Simone Fontecchio's real stat line.
const LEGITIMATE_ROTATION_STATLINE = {
  pointsPerGame: 10.5,
  reboundsPerGame: 3.7,
  assistsPerGame: 1.5,
  stealsPerGame: 0.7,
  blocksPerGame: 0.35,
  turnoversPerGame: 1.0,
  minutesPerGame: 25,
  trueShootingPct: 0.6,
};

// A true deep-bench/end-of-roster player with very limited minutes and
// weak per-minute production either way - should still land near the
// floor, unlike LEGITIMATE_ROTATION_STATLINE above.
const DEEP_BENCH_STATLINE = {
  pointsPerGame: 2.5,
  reboundsPerGame: 1.5,
  assistsPerGame: 0.4,
  stealsPerGame: 0.15,
  blocksPerGame: 0.1,
  turnoversPerGame: 0.4,
  minutesPerGame: 8,
  trueShootingPct: 0.5,
};

describe("computePerformanceScore", () => {
  it("scores a league-average-paced statline as a solid, not elite, rating", () => {
    // The old per-game-only formula anchored this exact statline to 72 by
    // construction; the minutes-normalized formula (correctly) recognizes
    // real per-36 production at a 24-minute pace as above a flat "average"
    // read, so this no longer nets to exactly 72 - it should still read as
    // a good-not-great player, not elite and not bottom-of-roster.
    const score = computePerformanceScore(AVERAGE_STATLINE);
    expect(score).toBeGreaterThan(72);
    expect(score).toBeLessThan(88);
  });

  it("scores an elite statline well above average", () => {
    expect(computePerformanceScore(ELITE_STATLINE)).toBeGreaterThan(90);
  });

  it("does not crush a legitimate low-minutes rotation player to the floor", () => {
    // The exact bug this fix addresses: a real, productive-per-minute
    // rotation player should score meaningfully above the 60 floor, not
    // get lumped in with true deep-bench players just for playing fewer
    // minutes than a starter.
    const score = computePerformanceScore(LEGITIMATE_ROTATION_STATLINE);
    expect(score).toBeGreaterThan(65);
  });

  it("still scores a true deep-bench player near the floor", () => {
    const score = computePerformanceScore(DEEP_BENCH_STATLINE);
    expect(score).toBeLessThan(68);
  });

  it("scores a legitimate rotation player higher than a true deep-bench player", () => {
    expect(computePerformanceScore(LEGITIMATE_ROTATION_STATLINE)).toBeGreaterThan(
      computePerformanceScore(DEEP_BENCH_STATLINE),
    );
  });

  it("blends a zero-minutes (no evidence) input toward replacement level, not the absolute floor", () => {
    expect(
      computePerformanceScore({
        pointsPerGame: 0,
        reboundsPerGame: 0,
        assistsPerGame: 0,
        stealsPerGame: 0,
        blocksPerGame: 0,
        turnoversPerGame: 0,
        minutesPerGame: 0,
        trueShootingPct: 0,
      }),
    ).toBe(65);
  });

  it("clamps a genuinely bad statline at real minutes to the 60 floor", () => {
    expect(
      computePerformanceScore({
        pointsPerGame: 2,
        reboundsPerGame: 1,
        assistsPerGame: 0,
        stealsPerGame: 0,
        blocksPerGame: 0,
        turnoversPerGame: 3,
        minutesPerGame: 20,
        trueShootingPct: 0.3,
      }),
    ).toBe(60);
  });

  it("clamps to 99 for an extreme, maxed-out statline", () => {
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

/**
 * The defect these exist for, found by docs/FINANCE_AUDIT.md P0-1 and measured
 * over the seeded roster: the efficiency term carried full weight regardless of
 * shot volume, and per-36 rates were extrapolated without limit. Together they
 * scored rim-running backup centres at a clamped 99.0 - level with Jokić and
 * SGA - and the contract generator paid them accordingly. League-wide payroll
 * came out 28% above the real NBA's, with 16 of 30 teams over the second apron.
 *
 * Nothing in the suite caught it: every case here played starter minutes or was
 * bad at everything, so the one combination that broke the model - few minutes,
 * few shots, excellent percentages - was never asked about.
 */
describe("computePerformanceScore - efficiency without volume", () => {
  // A real archetype: the rim-running backup centre who only ever shoots
  // dunks and putbacks, so his true shooting is elite on almost no volume.
  // Modelled on Jaxson Hayes' and Ryan Kalkbrenner's real lines.
  const RIM_RUNNER = {
    pointsPerGame: 7.5,
    reboundsPerGame: 5.0,
    assistsPerGame: 0.8,
    stealsPerGame: 0.5,
    blocksPerGame: 1.0,
    turnoversPerGame: 1.0,
    minutesPerGame: 18,
    trueShootingPct: 0.76,
  };

  const MVP = {
    pointsPerGame: 27.3,
    reboundsPerGame: 12.5,
    assistsPerGame: 8.7,
    stealsPerGame: 1.4,
    blocksPerGame: 0.7,
    turnoversPerGame: 3.2,
    minutesPerGame: 34.4,
    trueShootingPct: 0.669,
  };

  it("does not rate a low-volume, high-efficiency backup as an MVP", () => {
    const gap = computePerformanceScore(MVP) - computePerformanceScore(RIM_RUNNER);
    // Both used to clamp to exactly 99.0, so the gap was 0.
    expect(gap).toBeGreaterThan(10);
  });

  it("weights shooting efficiency by how much a player actually shoots", () => {
    // Isolates the efficiency term itself: how much is a player's score moved
    // by going from poor to elite percentages, at low volume vs high volume?
    // The old formula moved both by exactly the same amount, because the term
    // ignored volume entirely. Comparing raw scores instead would not have
    // caught that - the scoring term alone separates them.
    const at = (pointsPerGame: number, trueShootingPct: number) =>
      computePerformanceScore({
        ...RIM_RUNNER,
        minutesPerGame: 30,
        pointsPerGame,
        trueShootingPct,
      });
    const swingAtLowVolume = at(6, 0.76) - at(6, 0.5);
    const swingAtHighVolume = at(24, 0.76) - at(24, 0.5);
    expect(swingAtHighVolume).toBeGreaterThan(swingAtLowVolume * 1.5);
  });

  it("gives no efficiency bonus at all to a player who never shoots", () => {
    const base = { ...RIM_RUNNER, pointsPerGame: 0, minutesPerGame: 24 };
    expect(computePerformanceScore({ ...base, trueShootingPct: 0.9 })).toBe(
      computePerformanceScore({ ...base, trueShootingPct: 0.2 }),
    );
  });

  it("bounds how large the per-36 bonus can get", () => {
    // The same per-game line in a third of the minutes is genuinely better
    // per minute, and the model should say so - but only so far. Uncapped,
    // this produced a 3x extrapolation and a double-digit bonus for playing
    // less. The bonus survives; its size is bounded.
    const sameLineAt = (minutesPerGame: number) =>
      computePerformanceScore({
        ...RIM_RUNNER,
        pointsPerGame: 12,
        minutesPerGame,
        trueShootingPct: 0.58,
      });
    const bonusForPlayingLess = sameLineAt(12) - sameLineAt(36);
    expect(bonusForPlayingLess).toBeGreaterThan(0);
    expect(bonusForPlayingLess).toBeLessThan(3);
  });
});

describe("computePerformanceScore - real anchor players (2023-24 season lines)", () => {
  // Verified against real NBA 2K24 ratings, spanning archetypes (not just
  // top scorers) - a prior tuning pass found that weighting steals/blocks
  // far higher than points over-rewarded shot-blocking bigs relative to
  // high-usage scoring wings, invisible only because both used to clamp to
  // the same ceiling. Tolerance is generous (this is a hand-tuned box-score
  // heuristic, not a fitted regression - see docs/SYSTEMS.md).
  const anchors: [string, Parameters<typeof computePerformanceScore>[0], number][] = [
    [
      "Nikola Jokic (playmaking big, 2K 98)",
      {
        pointsPerGame: 26.39,
        reboundsPerGame: 12.35,
        assistsPerGame: 8.96,
        stealsPerGame: 1.37,
        blocksPerGame: 0.86,
        turnoversPerGame: 3,
        minutesPerGame: 34.64,
        trueShootingPct: 0.65,
      },
      98,
    ],
    [
      "Jayson Tatum (scoring wing, 2K 95)",
      {
        pointsPerGame: 26.85,
        reboundsPerGame: 8.12,
        assistsPerGame: 4.92,
        stealsPerGame: 1.01,
        blocksPerGame: 0.58,
        turnoversPerGame: 2.54,
        minutesPerGame: 35.75,
        trueShootingPct: 0.604,
      },
      95,
    ],
    [
      "Stephen Curry (shooting guard, 2K 96)",
      {
        pointsPerGame: 26.43,
        reboundsPerGame: 4.46,
        assistsPerGame: 5.12,
        stealsPerGame: 0.73,
        blocksPerGame: 0.38,
        turnoversPerGame: 2.84,
        minutesPerGame: 32.72,
        trueShootingPct: 0.616,
      },
      96,
    ],
  ];

  for (const [label, stats] of anchors) {
    it(`scores ${label} solidly in Superstar territory`, () => {
      // All three anchors are real MVP/All-NBA-caliber players - the fix
      // must not regress any of them out of the top tier while fixing the
      // bench-floor pileup.
      const score = computePerformanceScore(stats);
      expect(score).toBeGreaterThanOrEqual(90);
      expect(score).toBeLessThanOrEqual(99);
    });
  }
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
