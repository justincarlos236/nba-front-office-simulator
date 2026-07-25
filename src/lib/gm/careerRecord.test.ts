import { describe, expect, it } from "vitest";
import {
  computeReputationDelta,
  computeCareerTitle,
  describeBestPlayoffFinish,
  type ReputationDeltaInput,
} from "./careerRecord";

function input(overrides: Partial<ReputationDeltaInput> = {}): ReputationDeltaInput {
  return {
    seasons: 1,
    wins: 41,
    losses: 41,
    championships: 0,
    playoffAppearances: 0,
    endReason: "RETIRED",
    ...overrides,
  };
}

describe("computeReputationDelta", () => {
  it("is neutral (near 0) for an average .500 team with no playoff history", () => {
    expect(computeReputationDelta(input())).toBe(0);
  });

  it("rewards championships heavily", () => {
    const withTitle = computeReputationDelta(input({ championships: 1, playoffAppearances: 1 }));
    const without = computeReputationDelta(input());
    expect(withTitle).toBeGreaterThan(without);
  });

  it("rewards a winning record and penalizes a losing one", () => {
    const winning = computeReputationDelta(input({ wins: 60, losses: 22 }));
    const losing = computeReputationDelta(input({ wins: 22, losses: 60 }));
    expect(winning).toBeGreaterThan(0);
    expect(losing).toBeLessThan(0);
  });

  it("applies a flat penalty for ending in FIRED vs RETIRED, all else equal", () => {
    const fired = computeReputationDelta(input({ endReason: "FIRED" }));
    const retired = computeReputationDelta(input({ endReason: "RETIRED" }));
    expect(fired).toBeLessThan(retired);
    expect(retired - fired).toBe(20);
  });

  it("clamps extreme results into a bounded range", () => {
    const extremeGood = computeReputationDelta(
      input({ championships: 10, playoffAppearances: 10, wins: 82, losses: 0 }),
    );
    const extremeBad = computeReputationDelta(input({ wins: 0, losses: 82, endReason: "FIRED" }));
    expect(extremeGood).toBeLessThanOrEqual(60);
    expect(extremeBad).toBeGreaterThanOrEqual(-40);
  });

  it("treats a team with no games played as .500, not a divide-by-zero", () => {
    expect(() => computeReputationDelta(input({ wins: 0, losses: 0 }))).not.toThrow();
  });
});

describe("computeCareerTitle", () => {
  it("buckets reputation into the right title at each tier boundary", () => {
    expect(computeCareerTitle(95)).toBe("HALL_OF_FAME_EXECUTIVE");
    expect(computeCareerTitle(80)).toBe("RESPECTED_EXECUTIVE");
    expect(computeCareerTitle(65)).toBe("STEADY_HAND");
    expect(computeCareerTitle(45)).toBe("JOURNEYMAN_GM");
    expect(computeCareerTitle(25)).toBe("UNDER_SCRUTINY");
    expect(computeCareerTitle(5)).toBe("CAUTIONARY_TALE");
  });
});

describe("describeBestPlayoffFinish", () => {
  it("describes every finish honestly", () => {
    expect(describeBestPlayoffFinish(null, false)).toBe("Missed the Playoffs");
    expect(describeBestPlayoffFinish(1, false)).toBe("First Round");
    expect(describeBestPlayoffFinish(2, false)).toBe("Conference Semifinals");
    expect(describeBestPlayoffFinish(3, false)).toBe("Conference Finals");
    expect(describeBestPlayoffFinish(4, false)).toBe("NBA Finals");
    expect(describeBestPlayoffFinish(4, true)).toBe("NBA Champion");
  });
});
