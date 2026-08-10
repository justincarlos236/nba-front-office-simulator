import { describe, expect, it } from "vitest";
import { highestImportance, importanceForRating, importanceForInjury } from "./newsImportance";

describe("importanceForRating", () => {
  it("rates a superstar as MAJOR", () => {
    expect(importanceForRating(94)).toBe("MAJOR");
  });

  it("rates a star as STANDARD", () => {
    expect(importanceForRating(84)).toBe("STANDARD");
  });

  it("rates a starter/rotation/minimum player as MINOR", () => {
    expect(importanceForRating(75)).toBe("MINOR");
    expect(importanceForRating(68)).toBe("MINOR");
    expect(importanceForRating(60)).toBe("MINOR");
  });
});

describe("highestImportance", () => {
  it("picks the biggest level among several", () => {
    expect(highestImportance(["MINOR", "STANDARD", "MINOR"])).toBe("STANDARD");
    expect(highestImportance(["MAJOR", "BREAKING", "MINOR"])).toBe("BREAKING");
  });

  it("defaults to MINOR for an empty list", () => {
    expect(highestImportance([])).toBe("MINOR");
  });
});

/**
 * Duration alone used to decide this, which is how a 21-game absence for a
 * rotation player came to lead the news page over a ten-game winning streak
 * and three trades.
 */
describe("importanceForInjury", () => {
  const SUPERSTAR = 93;
  const STAR = 84;
  const ROTATION = 68;

  it("treats losing a superstar for a long stretch as breaking news", () => {
    expect(importanceForInjury(25, SUPERSTAR)).toBe("BREAKING");
  });

  it("makes a star's multi-week absence major", () => {
    expect(importanceForInjury(12, STAR)).toBe("MAJOR");
  });

  it("no longer headlines a long absence for a bench player", () => {
    // The regression: this was MAJOR purely because 21 >= 20.
    expect(importanceForInjury(21, ROTATION)).not.toBe("MAJOR");
  });

  it("still treats a genuinely season-altering absence as major for anyone", () => {
    expect(importanceForInjury(35, ROTATION)).toBe("MAJOR");
  });

  it("ranks the same absence higher for the better player", () => {
    const order = ["MINOR", "STANDARD", "MAJOR", "BREAKING"];
    const rank = (games: number, r: number) => order.indexOf(importanceForInjury(games, r));
    // Three weeks out separates all three tiers cleanly.
    expect(rank(20, SUPERSTAR)).toBeGreaterThan(rank(20, STAR));
    expect(rank(20, STAR)).toBeGreaterThan(rank(20, ROTATION));
  });

  it("never ranks a worse player's identical absence higher", () => {
    const order = ["MINOR", "STANDARD", "MAJOR", "BREAKING"];
    const rank = (games: number, r: number) => order.indexOf(importanceForInjury(games, r));
    // Monotonic in quality at every duration - equal is fine, inverted is not.
    for (let games = 1; games <= 40; games += 1) {
      expect(rank(games, SUPERSTAR)).toBeGreaterThanOrEqual(rank(games, STAR));
      expect(rank(games, STAR)).toBeGreaterThanOrEqual(rank(games, ROTATION));
    }
  });

  it("keeps a day-to-day knock for a role player out of the news", () => {
    expect(importanceForInjury(2, ROTATION)).toBe("MINOR");
  });

  it("never ignores a star, even for a short absence", () => {
    expect(importanceForInjury(2, STAR)).toBe("STANDARD");
  });
});
