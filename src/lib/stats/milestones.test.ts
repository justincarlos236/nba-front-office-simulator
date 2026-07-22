import { describe, expect, it } from "vitest";
import { computeCareerHighs, isDoubleDouble, isTripleDouble, scoringMilestone } from "./milestones";

function line(
  overrides: Partial<Record<"points" | "rebounds" | "assists" | "steals" | "blocks", number>>,
) {
  return { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, ...overrides };
}

describe("isDoubleDouble", () => {
  it("is true with exactly two double-digit categories", () => {
    expect(isDoubleDouble(line({ points: 22, rebounds: 11 }))).toBe(true);
  });

  it("is false with only one double-digit category", () => {
    expect(isDoubleDouble(line({ points: 22, rebounds: 9 }))).toBe(false);
  });
});

describe("isTripleDouble", () => {
  it("is true with three double-digit categories", () => {
    expect(isTripleDouble(line({ points: 15, rebounds: 11, assists: 10 }))).toBe(true);
  });

  it("is false with only two double-digit categories", () => {
    expect(isTripleDouble(line({ points: 25, rebounds: 11, assists: 9 }))).toBe(false);
  });

  it("counts steals and blocks toward the total, not just the classic three", () => {
    expect(isTripleDouble(line({ points: 12, steals: 10, blocks: 10 }))).toBe(true);
  });
});

describe("scoringMilestone", () => {
  it("returns null below any milestone", () => {
    expect(scoringMilestone(35)).toBeNull();
  });

  it("returns the highest milestone reached", () => {
    expect(scoringMilestone(41)).toBe(40);
    expect(scoringMilestone(52)).toBe(50);
    expect(scoringMilestone(61)).toBe(60);
  });
});

describe("computeCareerHighs", () => {
  it("returns null for an empty game log", () => {
    expect(computeCareerHighs([])).toBeNull();
  });

  it("takes the max of each category independently across games", () => {
    const highs = computeCareerHighs([
      line({ points: 30, rebounds: 5, assists: 12 }),
      line({ points: 18, rebounds: 14, assists: 4 }),
    ]);
    expect(highs).toEqual({ points: 30, rebounds: 14, assists: 12, steals: 0, blocks: 0 });
  });
});
