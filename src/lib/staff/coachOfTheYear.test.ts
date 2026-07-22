import { describe, expect, it } from "vitest";
import { computeCoachOfTheYear, type HeadCoachSeasonSnapshot } from "./coachOfTheYear";

function coach(overrides: Partial<HeadCoachSeasonSnapshot>): HeadCoachSeasonSnapshot {
  return {
    staffId: "c",
    teamWinPct: 0.5,
    quality: 75,
    ...overrides,
  };
}

describe("computeCoachOfTheYear", () => {
  it("picks the coach of the best-record team", () => {
    const coaches = [
      coach({ staffId: "a", teamWinPct: 0.65 }),
      coach({ staffId: "b", teamWinPct: 0.8 }),
    ];
    const winner = computeCoachOfTheYear(coaches);
    expect(winner?.staffId).toBe("b");
    expect(winner?.value).toBeCloseTo(0.8);
  });

  it("breaks a tied win% by higher quality", () => {
    const coaches = [
      coach({ staffId: "a", teamWinPct: 0.7, quality: 80 }),
      coach({ staffId: "b", teamWinPct: 0.7, quality: 90 }),
    ];
    const winner = computeCoachOfTheYear(coaches);
    expect(winner?.staffId).toBe("b");
  });

  it("returns null with no eligible coaches", () => {
    expect(computeCoachOfTheYear([])).toBeNull();
  });
});
