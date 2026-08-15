import { describe, expect, it } from "vitest";
import {
  simulateGame,
  computeHomeWinProbability,
  PLAYOFF_HOME_COURT_ADVANTAGE,
} from "./simulateGame";
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

/**
 * docs/PLAYOFF_AUDIT.md PO-P2-1. The postseason used to call `simulateGame`
 * with the regular season's home advantage, so a playoff game differed from a
 * February one by nothing at all - home teams won 58.2%, the top of the
 * engine's own regular-season band rather than above it.
 */
describe("postseason home court is larger than the regular season's", () => {
  it("uses a bigger advantage in the playoffs", () => {
    expect(PLAYOFF_HOME_COURT_ADVANTAGE).toBeGreaterThan(1.1);
  });

  it("gives the home side a better chance in a playoff game than a league one", () => {
    const evenly = 78;
    const regular = computeHomeWinProbability(evenly, evenly);
    const playoff = standardPlayoffHomeWinProbability(evenly, evenly);
    expect(playoff).toBeGreaterThan(regular);
  });

  it("lands the postseason home win rate near the real 60%", () => {
    // Measured over a full seven-game slate between a 1 and an 8 seed, which
    // is how the calibration was taken - the higher seed hosts four games and
    // is also the better team, so the two effects mix.
    let s = 99;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    let homeWins = 0;
    let games = 0;
    for (let trial = 0; trial < 4000; trial++) {
      for (let gameNumber = 1; gameNumber <= 7; gameNumber++) {
        const higherHome = isHigherSeedHomeGame(gameNumber);
        const result = simulateGame(
          higherHome ? 82 : 76,
          higherHome ? 76 : 82,
          rng,
          0,
          0,
          PLAYOFF_HOME_COURT_ADVANTAGE,
        );
        if (result.homeWon) homeWins += 1;
        games += 1;
      }
    }
    expect(homeWins / games).toBeGreaterThan(0.56);
    expect(homeWins / games).toBeLessThan(0.65);
  });
});

function standardPlayoffHomeWinProbability(home: number, away: number): number {
  let s = 1;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let wins = 0;
  const N = 20_000;
  for (let i = 0; i < N; i++) {
    if (simulateGame(home, away, rng, 0, 0, PLAYOFF_HOME_COURT_ADVANTAGE).homeWon) wins += 1;
  }
  return wins / N;
}
