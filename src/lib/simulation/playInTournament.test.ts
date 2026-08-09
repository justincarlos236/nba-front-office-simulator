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
    // Outcomes are forced by strength, not by rng internals. A team this far
    // ahead effectively never loses a single game, so the bracket logic is
    // what is under test rather than how many rng values simulateGame happens
    // to consume - which is what these assertions used to depend on.
    const strength = new Map([
      ["seed7", 200],
      ["seed8", 20],
      ["seed9", 190],
      ["seed10", 10],
    ]);
    const result = simulatePlayIn(seeds, strength, Math.random);
    expect(result.finalSeventhSeed).toBe("seed7");
    // Game A's loser drops into game C, hosted by them against game B's winner.
    expect(result.games[2].homeTeamId).toBe("seed8");
    expect(result.games[2].awayTeamId).toBe("seed9");
  });

  it("a 9/10 winner can still claim the final 8-seed by winning game C", () => {
    // seed9 is overwhelming: it wins game B, then beats seed8 in game C.
    const strength = new Map([
      ["seed7", 200],
      ["seed8", 20],
      ["seed9", 190],
      ["seed10", 10],
    ]);
    const result = simulatePlayIn(seeds, strength, Math.random);
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
