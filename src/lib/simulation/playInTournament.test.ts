import { describe, expect, it } from "vitest";
import { simulatePlayIn, type PlayInSeeds } from "./playInTournament";

const seeds: PlayInSeeds = { seven: "seed7", eight: "seed8", nine: "seed9", ten: "seed10" };

function fixedRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("simulatePlayIn", () => {
  it("plays exactly 3 games", () => {
    const strength = new Map([
      ["seed7", 80],
      ["seed8", 78],
      ["seed9", 76],
      ["seed10", 74],
    ]);
    const result = simulatePlayIn(seeds, strength, Math.random);
    expect(result.games).toHaveLength(3);
  });

  it("game A is hosted by the 7-seed, game B by the 9-seed", () => {
    const strength = new Map([
      ["seed7", 80],
      ["seed8", 78],
      ["seed9", 76],
      ["seed10", 74],
    ]);
    const result = simulatePlayIn(seeds, strength, Math.random);
    expect(result.games[0].homeTeamId).toBe("seed7");
    expect(result.games[0].awayTeamId).toBe("seed8");
    expect(result.games[1].homeTeamId).toBe("seed9");
    expect(result.games[1].awayTeamId).toBe("seed10");
  });

  it("7-seed winning game A becomes final 7-seed; loser gets a second chance in game C", () => {
    // rng < homeWinProbability means home wins - use very low values so the home team always wins.
    const strength = new Map([
      ["seed7", 80],
      ["seed8", 78],
      ["seed9", 76],
      ["seed10", 74],
    ]);
    const result = simulatePlayIn(seeds, strength, fixedRng([0.01, 0.5, 0.5]));
    // Game A: seed7 (home) wins -> finalSeventhSeed = seed7, gameALoser = seed8
    expect(result.finalSeventhSeed).toBe("seed7");
    expect(result.games[2].homeTeamId).toBe("seed8");
  });

  it("a 9/10 winner can still claim the final 8-seed by winning game C", () => {
    const strength = new Map([
      ["seed7", 80],
      ["seed8", 78],
      ["seed9", 76],
      ["seed10", 74],
    ]);
    // simulateGame consumes 3 rng() calls per game (homeWon draw, then two for
    // score); each game's "homeWon" draw is the first call in its group of 3.
    // Game A: home (seed7) wins. Game B: home (seed9) wins. Game C: home
    // (seed8) loses (rng high -> away/seed9 wins).
    const result = simulatePlayIn(
      seeds,
      strength,
      fixedRng([0.01, 0.5, 0.5, 0.01, 0.5, 0.5, 0.99, 0.5, 0.5]),
    );
    expect(result.finalEighthSeed).toBe("seed9");
  });

  it("is deterministic for a given rng sequence", () => {
    const strength = new Map([
      ["seed7", 80],
      ["seed8", 78],
      ["seed9", 76],
      ["seed10", 74],
    ]);
    const values = [0.2, 0.4, 0.6];
    expect(simulatePlayIn(seeds, strength, fixedRng(values))).toEqual(
      simulatePlayIn(seeds, strength, fixedRng(values)),
    );
  });
});
