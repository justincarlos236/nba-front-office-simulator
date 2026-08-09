import { describe, expect, it } from "vitest";
import { isSeriesDecided, nextGameNumber } from "./seriesDecided";

const BEST_OF_SEVEN = 4;

describe("series clinch", () => {
  it("treats the reported 4-3 case as decided", () => {
    // The bug: a best-of-seven finished 4-3 rendered a header for "Game 8"
    // above "You lead 4-3", describing a series that was already over.
    expect(isSeriesDecided(4, 3, BEST_OF_SEVEN)).toBe(true);
    expect(nextGameNumber(4, 3, BEST_OF_SEVEN)).toBeNull();
  });

  it("has no next game once either side clinches", () => {
    for (const [a, b] of [
      [4, 0],
      [4, 1],
      [4, 2],
      [4, 3],
      [0, 4],
      [1, 4],
      [2, 4],
      [3, 4],
    ]) {
      expect(isSeriesDecided(a, b, BEST_OF_SEVEN), `${a}-${b}`).toBe(true);
      expect(nextGameNumber(a, b, BEST_OF_SEVEN), `${a}-${b}`).toBeNull();
    }
  });

  it("numbers the next game correctly while the series is live", () => {
    expect(nextGameNumber(0, 0, BEST_OF_SEVEN)).toBe(1);
    expect(nextGameNumber(1, 0, BEST_OF_SEVEN)).toBe(2);
    expect(nextGameNumber(3, 3, BEST_OF_SEVEN)).toBe(7);
  });

  it("never numbers a game beyond the series maximum", () => {
    // A best-of-seven cannot reach game 8. Exhaustive over every reachable
    // scoreline, because that is the invariant the bug violated.
    for (let a = 0; a <= BEST_OF_SEVEN; a += 1) {
      for (let b = 0; b <= BEST_OF_SEVEN; b += 1) {
        const next = nextGameNumber(a, b, BEST_OF_SEVEN);
        if (next !== null) {
          expect(next, `${a}-${b}`).toBeLessThanOrEqual(BEST_OF_SEVEN * 2 - 1);
        }
      }
    }
  });

  it("works for series lengths other than seven", () => {
    // A best-of-five (winsNeeded 3), in case shorter rounds are ever added.
    expect(isSeriesDecided(3, 2, 3)).toBe(true);
    expect(nextGameNumber(2, 2, 3)).toBe(5);
    expect(nextGameNumber(3, 2, 3)).toBeNull();
  });
});
