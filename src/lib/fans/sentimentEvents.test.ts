import { describe, expect, it } from "vitest";
import {
  applyFanHappinessDelta,
  computeTradeSentimentDelta,
  computeSigningSentimentDelta,
  computeStreakSentimentDelta,
  computeInjurySentimentDelta,
  computeInjuryRecoverySentimentDelta,
  computeStaffChangeSentimentDelta,
  computeRotationChangeSentimentDelta,
  computeLotteryResultSentimentDelta,
} from "./sentimentEvents";

describe("applyFanHappinessDelta", () => {
  it("adds the delta and clamps to 0-100", () => {
    expect(applyFanHappinessDelta(65, 5)).toBe(70);
    expect(applyFanHappinessDelta(98, 10)).toBe(100);
    expect(applyFanHappinessDelta(2, -10)).toBe(0);
  });
});

describe("computeTradeSentimentDelta", () => {
  it("nets close to zero for a fair trade of similar-tier players", () => {
    const delta = computeTradeSentimentDelta({
      perspectiveScore: 1.0,
      acquiredStarTier: "STARTER",
      sentStarTier: "STARTER",
    });
    expect(Math.abs(delta)).toBeLessThanOrEqual(1);
  });

  it("swings strongly positive for a lopsided win that also brings in a superstar", () => {
    const delta = computeTradeSentimentDelta({
      perspectiveScore: 2.5,
      acquiredStarTier: "SUPERSTAR",
      sentStarTier: "MINIMUM",
    });
    expect(delta).toBeGreaterThan(4);
  });

  it("swings negative when this team gives up a superstar for little in return", () => {
    const delta = computeTradeSentimentDelta({
      perspectiveScore: 0.3,
      acquiredStarTier: "MINIMUM",
      sentStarTier: "SUPERSTAR",
    });
    expect(delta).toBeLessThan(-4);
  });

  it("never exceeds the cap regardless of how extreme the inputs are", () => {
    const delta = computeTradeSentimentDelta({
      perspectiveScore: 100,
      acquiredStarTier: "SUPERSTAR",
      sentStarTier: "MINIMUM",
    });
    expect(delta).toBeLessThanOrEqual(6);
    expect(delta).toBeGreaterThanOrEqual(-6);
  });
});

describe("computeSigningSentimentDelta", () => {
  it("gives a bigger bump for a star signing than a minimum-level one", () => {
    const star = computeSigningSentimentDelta({ signedStarTier: "SUPERSTAR", isReSigning: false });
    const minimum = computeSigningSentimentDelta({ signedStarTier: "MINIMUM", isReSigning: false });
    expect(star).toBeGreaterThan(minimum);
  });

  it("never goes negative - signing someone is never itself bad news", () => {
    expect(
      computeSigningSentimentDelta({ signedStarTier: "MINIMUM", isReSigning: false }),
    ).toBeGreaterThanOrEqual(0);
  });

  it("re-signing your own player gets a small extra bump over an identical outside signing", () => {
    const reSign = computeSigningSentimentDelta({ signedStarTier: "STAR", isReSigning: true });
    const outside = computeSigningSentimentDelta({ signedStarTier: "STAR", isReSigning: false });
    expect(reSign).toBeGreaterThan(outside);
  });
});

describe("computeStreakSentimentDelta", () => {
  it("returns 0 for a MINOR importance (below any real streak threshold)", () => {
    expect(computeStreakSentimentDelta("MINOR", 1)).toBe(0);
  });

  it("scales up from STANDARD to BREAKING", () => {
    const standard = computeStreakSentimentDelta("STANDARD", 1);
    const major = computeStreakSentimentDelta("MAJOR", 1);
    const breaking = computeStreakSentimentDelta("BREAKING", 1);
    expect(major).toBeGreaterThan(standard);
    expect(breaking).toBeGreaterThan(major);
  });

  it("a losing streak produces the mirrored negative delta", () => {
    expect(computeStreakSentimentDelta("MAJOR", -1)).toBe(-computeStreakSentimentDelta("MAJOR", 1));
  });
});

describe("computeInjurySentimentDelta / computeInjuryRecoverySentimentDelta", () => {
  it("a star's season-ending injury hurts more than a role player's day-to-day tweak", () => {
    const starSeasonEnding = computeInjurySentimentDelta({
      starTier: "SUPERSTAR",
      severity: "SEASON_ENDING",
    });
    const roleDayToDay = computeInjurySentimentDelta({
      starTier: "ROTATION",
      severity: "DAY_TO_DAY",
    });
    expect(starSeasonEnding).toBeLessThan(roleDayToDay);
  });

  it("injury deltas are never positive, recovery deltas are never negative", () => {
    expect(
      computeInjurySentimentDelta({ starTier: "STARTER", severity: "OUT" }),
    ).toBeLessThanOrEqual(0);
    expect(computeInjuryRecoverySentimentDelta("STARTER")).toBeGreaterThanOrEqual(0);
  });
});

describe("computeStaffChangeSentimentDelta", () => {
  it("only Head Coach changes register with fans", () => {
    expect(
      computeStaffChangeSentimentDelta({ role: "MEDICAL_STAFF", quality: 95, isHire: true }),
    ).toBe(0);
  });

  it("hiring a high-quality Head Coach is positive, firing one is negative", () => {
    expect(
      computeStaffChangeSentimentDelta({ role: "HEAD_COACH", quality: 95, isHire: true }),
    ).toBeGreaterThan(0);
    expect(
      computeStaffChangeSentimentDelta({ role: "HEAD_COACH", quality: 95, isHire: false }),
    ).toBeLessThan(0);
  });
});

describe("computeRotationChangeSentimentDelta", () => {
  it("a promotion is positive, a demotion is negative, symmetric magnitude", () => {
    const promoted = computeRotationChangeSentimentDelta({ starTier: "STAR", promoted: true });
    const demoted = computeRotationChangeSentimentDelta({ starTier: "STAR", promoted: false });
    expect(promoted).toBeGreaterThan(0);
    expect(demoted).toBe(-promoted);
  });
});

describe("computeLotteryResultSentimentDelta", () => {
  it("is positive for a jump and negative for a fall", () => {
    expect(computeLotteryResultSentimentDelta(5, false)).toBeGreaterThan(0);
    expect(computeLotteryResultSentimentDelta(-5, false)).toBeLessThan(0);
    expect(computeLotteryResultSentimentDelta(0, false)).toBe(0);
  });

  it("winning the #1 pick adds extra excitement on top of movement", () => {
    const withoutWin = computeLotteryResultSentimentDelta(2, false);
    const withWin = computeLotteryResultSentimentDelta(2, true);
    expect(withWin).toBeGreaterThan(withoutWin);
  });

  it("clamps extreme movement into a bounded range", () => {
    expect(computeLotteryResultSentimentDelta(13, true)).toBeLessThanOrEqual(5);
    expect(computeLotteryResultSentimentDelta(-13, false)).toBeGreaterThanOrEqual(-5);
  });
});
