import { describe, expect, it } from "vitest";
import {
  rookieScaleFraction,
  rookieScaleSalaryCents,
  LAST_ROOKIE_SCALE_PICK,
  ROOKIE_CONTRACT_YEARS,
} from "./rookieScale";
import { generateContract } from "./generateContract";
import { getSeasonCapRules } from "../cap/constants";

const SEASON = 2026;
const CAP = getSeasonCapRules(SEASON).salaryCapCents;
const pctOfCap = (cents: bigint) => (Number(cents) / Number(CAP)) * 100;

describe("rookieScaleFraction", () => {
  it("reproduces the published scale at its anchors", () => {
    expect(rookieScaleFraction(1)).toBeCloseTo(0.0807, 4);
    expect(rookieScaleFraction(10)).toBeCloseTo(0.0372, 4);
    expect(rookieScaleFraction(30)).toBeCloseTo(0.0174, 4);
  });

  it("pays the first pick about 4.6x the thirtieth", () => {
    // The defining property of a real rookie scale, and the one the old
    // service-year-only discount erased entirely.
    expect(rookieScaleFraction(1)! / rookieScaleFraction(30)!).toBeCloseTo(4.6, 1);
  });

  it("decreases monotonically across the first round", () => {
    for (let pick = 2; pick <= LAST_ROOKIE_SCALE_PICK; pick++) {
      expect(rookieScaleFraction(pick)!).toBeLessThanOrEqual(rookieScaleFraction(pick - 1)!);
    }
  });

  it("interpolates between anchors rather than stepping", () => {
    const four = rookieScaleFraction(4)!;
    expect(four).toBeLessThan(rookieScaleFraction(3)!);
    expect(four).toBeGreaterThan(rookieScaleFraction(5)!);
  });

  it("has no scale for the second round", () => {
    expect(rookieScaleFraction(31)).toBeNull();
    expect(rookieScaleFraction(60)).toBeNull();
  });

  it("clamps a nonsensical slot instead of throwing or paying nothing", () => {
    expect(rookieScaleFraction(0)).toBe(rookieScaleFraction(1));
    expect(rookieScaleFraction(-5)).toBe(rookieScaleFraction(1));
    expect(rookieScaleFraction(Number.NaN)).toBeNull();
  });
});

describe("rookie contracts as generated", () => {
  const rookie = (pick: number | null, overallRating = 70) =>
    generateContract({
      season: SEASON,
      overallRating,
      performanceScore: null,
      gamesPlayed: 0,
      age: 20,
      yearsOfExperience: 0,
      position: "SF",
      overallPickNumber: pick,
      seed: `pick-${pick}`,
    });

  /**
   * The regression this exists for. docs/audits/SALARY_SYSTEM_AUDIT.md P1-2: every
   * rookie took the same service-year discount, so the first pick earned 4.0%
   * of the cap against a real 8.1% and slot was nearly irrelevant.
   */
  it("pays the first pick roughly the real 8% of the cap", () => {
    expect(pctOfCap(rookie(1).years[0].salaryCents)).toBeCloseTo(8.1, 1);
  });

  it("separates the top of the draft from the end of the first round", () => {
    const first = Number(rookie(1).years[0].salaryCents);
    const thirtieth = Number(rookie(30).years[0].salaryCents);
    expect(first / thirtieth).toBeGreaterThan(4);
  });

  it("gives first-rounders the four-year rookie term", () => {
    for (const pick of [1, 15, 30]) {
      expect(rookie(pick).years).toHaveLength(ROOKIE_CONTRACT_YEARS);
    }
  });

  it("does not apply the scale to a second-round pick", () => {
    // No scale, so he prices normally. Compared at the ratings the draft curve
    // actually produces for these slots - roughly 67 at pick 30 and 65 at 45 -
    // the second-rounder costs less.
    //
    // Note the two are compared at REALISTIC ratings, not equal ones: at an
    // equal 70 the second-rounder would cost slightly more, because generic
    // rookie pricing sits just above the pick-30 scale. That inversion never
    // arises in play, since the draft curve does not put a 70 at pick 45, but
    // it is why this test does not hold rating constant.
    expect(Number(rookie(45, 65).years[0].salaryCents)).toBeLessThan(
      Number(rookie(30, 67).years[0].salaryCents),
    );
    // And his rating still moves his price, which is what "no scale" means.
    expect(rookie(45, 62).years[0].salaryCents).toBeLessThan(rookie(45, 72).years[0].salaryCents);
  });

  it("is unaffected by rating, because a scale is a scale", () => {
    // A pick-1 prospect who scouts better does not earn more; the slot pays.
    expect(rookie(1, 65).years[0].salaryCents).toBe(rookie(1, 80).years[0].salaryCents);
  });

  it("still prices normally when no pick number is supplied", () => {
    // Every non-draft caller omits it and must be untouched.
    expect(rookie(null).years[0].salaryCents).toBeGreaterThan(0n);
  });
});
