import { describe, expect, it } from "vitest";
import { planLeaguePlayer } from "./planLeaguePlayer";

const STAR_STATS = {
  pointsPerGame: 27,
  reboundsPerGame: 8,
  assistsPerGame: 6,
  stealsPerGame: 1.3,
  blocksPerGame: 0.7,
  turnoversPerGame: 3,
  minutesPerGame: 35,
  trueShootingPct: 0.6,
};

describe("planLeaguePlayer", () => {
  it("produces a consistent rating/contract bundle for a young star", () => {
    const plan = planLeaguePlayer({
      season: 2025,
      age: 23,
      yearsOfExperience: 3,
      stats: STAR_STATS,
      seed: "player-abc",
    });

    expect(plan.overallRating).toBeGreaterThan(70);
    expect(plan.potentialRating).toBeGreaterThanOrEqual(plan.overallRating);
    expect(plan.contract.years.length).toBeGreaterThan(0);
    expect(plan.contract.years[0].salaryCents).toBeGreaterThan(0n);
  });

  it("gives a young star a below-market rookie-scale contract", () => {
    const plan = planLeaguePlayer({
      season: 2025,
      age: 22,
      yearsOfExperience: 2,
      stats: STAR_STATS,
      seed: "player-abc",
    });
    const veteranPlan = planLeaguePlayer({
      season: 2025,
      age: 22,
      yearsOfExperience: 8,
      stats: STAR_STATS,
      seed: "player-abc",
    });

    expect(Number(plan.contract.years[0].salaryCents)).toBeLessThan(
      Number(veteranPlan.contract.years[0].salaryCents),
    );
  });

  it("is deterministic for the same seed and inputs", () => {
    const a = planLeaguePlayer({
      season: 2025,
      age: 28,
      yearsOfExperience: 6,
      stats: STAR_STATS,
      seed: "player-xyz",
    });
    const b = planLeaguePlayer({
      season: 2025,
      age: 28,
      yearsOfExperience: 6,
      stats: STAR_STATS,
      seed: "player-xyz",
    });
    expect(a).toEqual(b);
  });
});
