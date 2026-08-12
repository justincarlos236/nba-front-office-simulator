import { describe, expect, it } from "vitest";
import { getSeasonCapRules } from "../cap/constants";
import { generateContract } from "./generateContract";

describe("generateContract", () => {
  it("is deterministic for the same seed", () => {
    const a = generateContract({
      season: 2025,
      overallRating: 75,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 5,
      seed: "player-1",
    });
    const b = generateContract({
      season: 2025,
      overallRating: 75,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 5,
      seed: "player-1",
    });
    expect(a).toEqual(b);
  });

  it("produces a different salary for a different seed at the same score", () => {
    const a = generateContract({
      season: 2025,
      overallRating: 75,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 5,
      seed: "player-1",
    });
    const b = generateContract({
      season: 2025,
      overallRating: 75,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 5,
      seed: "player-2",
    });
    expect(a.years[0].salaryCents).not.toBe(b.years[0].salaryCents);
  });

  it("pays a veteran star close to real market value", () => {
    const rules = getSeasonCapRules(2025);
    const contract = generateContract({
      season: 2025,
      overallRating: 90,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 8,
      seed: "star-veteran",
    });
    const firstYearFraction = Number(contract.years[0].salaryCents) / Number(rules.salaryCapCents);
    expect(firstYearFraction).toBeGreaterThan(0.2);
  });

  it("heavily discounts a rookie relative to a veteran with the same score", () => {
    const rookie = generateContract({
      season: 2025,
      overallRating: 85,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 0,
      seed: "rookie-star",
    });
    const veteran = generateContract({
      season: 2025,
      overallRating: 85,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 8,
      seed: "rookie-star", // same seed to isolate the experience effect
    });
    expect(Number(rookie.years[0].salaryCents)).toBeLessThan(Number(veteran.years[0].salaryCents));
  });

  it("never pays below the salary floor", () => {
    const rules = getSeasonCapRules(2025);
    const contract = generateContract({
      season: 2025,
      overallRating: 5,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 10,
      seed: "bench-fringe",
    });
    expect(contract.years[0].salaryCents).toBeGreaterThanOrEqual(rules.emptyRosterChargeCents);
  });

  it("produces a contract length between 1 and 5 years matching start/end season", () => {
    const contract = generateContract({
      season: 2025,
      overallRating: 60,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 4,
      seed: "role-player",
    });
    const length = contract.endSeason - contract.startSeason + 1;
    expect(length).toBeGreaterThanOrEqual(1);
    expect(length).toBeLessThanOrEqual(5);
    expect(contract.years).toHaveLength(length);
  });

  it("gives modest year-over-year raises", () => {
    const contract = generateContract({
      season: 2025,
      overallRating: 70,
      performanceScore: null,
      gamesPlayed: 0,
      age: 27,
      yearsOfExperience: 6,
      seed: "raise-check",
    });
    for (let i = 1; i < contract.years.length; i++) {
      expect(contract.years[i].salaryCents).toBeGreaterThan(contract.years[i - 1].salaryCents);
    }
  });
});

/**
 * The regression that motivated splitting age out of the score.
 *
 * `ageValueMultiplier` is a discount on market *value*, but it used to be
 * multiplied into the score before `scoreToCapFraction` - a logistic - saw
 * it. The two compounded, so a modest age discount became a near-total pay
 * cut. Measured against the seeded roster, this paid Kevin Durant $1.7M,
 * Stephen Curry $2.3M and LeBron James $1.3M.
 */
describe("age discounts the money, not the score", () => {
  const star = (age: number) =>
    Number(
      generateContract({
        season: 2025,
        overallRating: 92,
        performanceScore: null,
        gamesPlayed: 0,
        age,
        yearsOfExperience: 12,
        seed: "aging-star",
      }).years[0].salaryCents,
    );

  it("still pays an ageing superstar like a starter, not the minimum", () => {
    const rules = getSeasonCapRules(2025);
    // The old formulation produced roughly the veteran minimum here.
    expect(star(37)).toBeGreaterThan(Number(rules.emptyRosterChargeCents) * 10);
  });

  it("discounts with age, but proportionally rather than off a cliff", () => {
    const prime = star(27);
    const old = star(37);
    expect(old).toBeLessThan(prime);
    // ageValueMultiplier bottoms out at 0.4, so no age may cost more than
    // 60% of a player's value. The bug cost 96%.
    expect(old).toBeGreaterThan(prime * 0.35);
  });

  it("keeps ageing stars on shorter deals - the age signal still shapes length", () => {
    // Length is drawn from a band rather than fixed, so a single seed can go
    // either way. The property is about the distribution, not one contract.
    const meanLength = (age: number, experience: number) => {
      const lengths = Array.from(
        { length: 200 },
        (_, i) =>
          generateContract({
            season: 2025,
            overallRating: 92,
            performanceScore: null,
            gamesPlayed: 0,
            age,
            yearsOfExperience: experience,
            seed: `length-${i}`,
          }).years.length,
      );
      return lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
    };
    expect(meanLength(38, 16)).toBeLessThan(meanLength(25, 4));
  });
});
