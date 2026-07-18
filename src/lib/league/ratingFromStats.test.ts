import { describe, expect, it } from "vitest";
import { deriveOverallRating, derivePotentialRating } from "./ratingFromStats";

describe("deriveOverallRating", () => {
  it("rates a league-average statline near 50", () => {
    expect(
      deriveOverallRating({
        pointsPerGame: 15,
        reboundsPerGame: 5,
        assistsPerGame: 3,
        stealsPerGame: 1,
        blocksPerGame: 0.5,
        turnoversPerGame: 1.5,
        minutesPerGame: 24,
        trueShootingPct: 0.56,
      }),
    ).toBeCloseTo(50, 0);
  });

  it("rates an elite statline highly", () => {
    expect(
      deriveOverallRating({
        pointsPerGame: 30,
        reboundsPerGame: 11,
        assistsPerGame: 8,
        stealsPerGame: 1.5,
        blocksPerGame: 1,
        turnoversPerGame: 3,
        minutesPerGame: 35,
        trueShootingPct: 0.63,
      }),
    ).toBeGreaterThan(85);
  });
});

describe("derivePotentialRating", () => {
  it("gives a young player real headroom above their current rating", () => {
    expect(derivePotentialRating(60, 20)).toBeGreaterThan(60);
  });

  it("gives a player at or past prime age little to no headroom", () => {
    expect(derivePotentialRating(70, 33)).toBe(70);
  });

  it("never exceeds the 99 rating ceiling", () => {
    expect(derivePotentialRating(95, 19)).toBeLessThanOrEqual(99);
  });

  it("gives more headroom the younger the player is", () => {
    const rookie = derivePotentialRating(55, 19);
    const veteran = derivePotentialRating(55, 25);
    expect(rookie).toBeGreaterThan(veteran);
  });
});
