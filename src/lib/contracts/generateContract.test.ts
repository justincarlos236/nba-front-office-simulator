import { describe, expect, it } from "vitest";
import { getSeasonCapRules } from "../cap/constants";
import { generateContract } from "./generateContract";

describe("generateContract", () => {
  it("is deterministic for the same seed", () => {
    const a = generateContract({
      season: 2025,
      ageAdjustedScore: 75,
      yearsOfExperience: 5,
      seed: "player-1",
    });
    const b = generateContract({
      season: 2025,
      ageAdjustedScore: 75,
      yearsOfExperience: 5,
      seed: "player-1",
    });
    expect(a).toEqual(b);
  });

  it("produces a different salary for a different seed at the same score", () => {
    const a = generateContract({
      season: 2025,
      ageAdjustedScore: 75,
      yearsOfExperience: 5,
      seed: "player-1",
    });
    const b = generateContract({
      season: 2025,
      ageAdjustedScore: 75,
      yearsOfExperience: 5,
      seed: "player-2",
    });
    expect(a.years[0].salaryCents).not.toBe(b.years[0].salaryCents);
  });

  it("pays a veteran star close to real market value", () => {
    const rules = getSeasonCapRules(2025);
    const contract = generateContract({
      season: 2025,
      ageAdjustedScore: 90,
      yearsOfExperience: 8,
      seed: "star-veteran",
    });
    const firstYearFraction = Number(contract.years[0].salaryCents) / Number(rules.salaryCapCents);
    expect(firstYearFraction).toBeGreaterThan(0.2);
  });

  it("heavily discounts a rookie relative to a veteran with the same score", () => {
    const rookie = generateContract({
      season: 2025,
      ageAdjustedScore: 85,
      yearsOfExperience: 0,
      seed: "rookie-star",
    });
    const veteran = generateContract({
      season: 2025,
      ageAdjustedScore: 85,
      yearsOfExperience: 8,
      seed: "rookie-star", // same seed to isolate the experience effect
    });
    expect(Number(rookie.years[0].salaryCents)).toBeLessThan(Number(veteran.years[0].salaryCents));
  });

  it("never pays below the salary floor", () => {
    const rules = getSeasonCapRules(2025);
    const contract = generateContract({
      season: 2025,
      ageAdjustedScore: 5,
      yearsOfExperience: 10,
      seed: "bench-fringe",
    });
    expect(contract.years[0].salaryCents).toBeGreaterThanOrEqual(rules.emptyRosterChargeCents);
  });

  it("produces a contract length between 1 and 5 years matching start/end season", () => {
    const contract = generateContract({
      season: 2025,
      ageAdjustedScore: 60,
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
      ageAdjustedScore: 70,
      yearsOfExperience: 6,
      seed: "raise-check",
    });
    for (let i = 1; i < contract.years.length; i++) {
      expect(contract.years[i].salaryCents).toBeGreaterThan(contract.years[i - 1].salaryCents);
    }
  });
});
