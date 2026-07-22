import { describe, expect, it } from "vitest";
import { computeHomeWinProbability, simulateGame } from "./simulateGame";

describe("computeHomeWinProbability", () => {
  it("gives the home team better than 50% with equal strength (home court)", () => {
    expect(computeHomeWinProbability(70, 70)).toBeGreaterThan(0.5);
  });

  it("favors the stronger team", () => {
    expect(computeHomeWinProbability(90, 50)).toBeGreaterThan(computeHomeWinProbability(50, 90));
  });

  it("stays within (0, 1)", () => {
    expect(computeHomeWinProbability(100, 0)).toBeLessThan(1);
    expect(computeHomeWinProbability(0, 100)).toBeGreaterThan(0);
  });

  it("a Head Coach bonus (Phase 15a) nudges win probability without it, unchanged", () => {
    const baseline = computeHomeWinProbability(70, 70);
    expect(computeHomeWinProbability(70, 70, 0, 0)).toBe(baseline);
    expect(computeHomeWinProbability(70, 70, 3, 0)).toBeGreaterThan(baseline);
    expect(computeHomeWinProbability(70, 70, 0, 3)).toBeLessThan(baseline);
  });
});

describe("simulateGame", () => {
  it("is deterministic for a given rng sequence", () => {
    const fixedRng = (() => {
      const values = [0.1, 0.5, 0.5];
      let i = 0;
      return () => values[i++ % values.length];
    })();
    const fixedRng2 = (() => {
      const values = [0.1, 0.5, 0.5];
      let i = 0;
      return () => values[i++ % values.length];
    })();
    expect(simulateGame(80, 60, fixedRng)).toEqual(simulateGame(80, 60, fixedRng2));
  });

  it("always produces a positive-margin final score", () => {
    for (let i = 0; i < 50; i++) {
      const result = simulateGame(75, 65, Math.random);
      const winnerScore = result.homeWon ? result.homeScore : result.awayScore;
      const loserScore = result.homeWon ? result.awayScore : result.homeScore;
      expect(winnerScore).toBeGreaterThan(loserScore);
    }
  });

  it("a much stronger home team wins more often over many simulations", () => {
    let homeWins = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      if (simulateGame(90, 40, Math.random).homeWon) homeWins++;
    }
    expect(homeWins / trials).toBeGreaterThan(0.85);
  });
});
