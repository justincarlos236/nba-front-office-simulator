import { describe, expect, it } from "vitest";
import {
  isHigherSeedHomeGame,
  simulateNextSeriesGame,
  simulateSeriesToCompletion,
} from "./simulateSeries";

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("isHigherSeedHomeGame", () => {
  it("follows the real 2-2-1-1-1 best-of-7 pattern", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(isHigherSeedHomeGame)).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
      true,
    ]);
  });
});

describe("simulateNextSeriesGame", () => {
  it("increments the higher seed's win count when they win their home game", () => {
    const { newState } = simulateNextSeriesGame(
      { higherSeedWins: 0, lowerSeedWins: 0 },
      90,
      50,
      fixedRng([0.01]),
    );
    expect(newState).toEqual({ higherSeedWins: 1, lowerSeedWins: 0 });
  });

  it("increments the lower seed's win count when they win on the road", () => {
    const { newState } = simulateNextSeriesGame(
      { higherSeedWins: 0, lowerSeedWins: 0 },
      50,
      90,
      fixedRng([0.99]),
    );
    expect(newState).toEqual({ higherSeedWins: 0, lowerSeedWins: 1 });
  });
});

describe("simulateSeriesToCompletion", () => {
  it("stops as soon as one side reaches winsNeeded", () => {
    // Higher seed wins every game.
    const result = simulateSeriesToCompletion(90, 40, 4, undefined, fixedRng([0.01]));
    expect(result.finalState.higherSeedWins).toBe(4);
    expect(result.finalState.lowerSeedWins).toBeLessThan(4);
    expect(result.winnerIsHigherSeed).toBe(true);
    expect(result.games.length).toBeGreaterThanOrEqual(4);
    expect(result.games.length).toBeLessThanOrEqual(7);
  });

  it("never plays more than 7 games for a best-of-7", () => {
    for (let i = 0; i < 25; i++) {
      const result = simulateSeriesToCompletion(75, 73, 4, undefined, Math.random);
      expect(result.games.length).toBeLessThanOrEqual(7);
      expect(Math.max(result.finalState.higherSeedWins, result.finalState.lowerSeedWins)).toBe(4);
    }
  });

  it("resumes correctly from a partially-played state", () => {
    const result = simulateSeriesToCompletion(
      90,
      40,
      4,
      { higherSeedWins: 3, lowerSeedWins: 1 },
      fixedRng([0.01]),
    );
    expect(result.finalState).toEqual({ higherSeedWins: 4, lowerSeedWins: 1 });
    expect(result.games).toHaveLength(1);
  });

  it("is deterministic for a given rng sequence", () => {
    const values = [0.3, 0.6, 0.2, 0.8, 0.1, 0.9, 0.4];
    expect(simulateSeriesToCompletion(80, 78, 4, undefined, fixedRng(values))).toEqual(
      simulateSeriesToCompletion(80, 78, 4, undefined, fixedRng(values)),
    );
  });
});
