import { describe, expect, it } from "vitest";
import { maxSalaryFractionFor } from "./maxSalary";
import { isSupermaxEligible, type SupermaxAward } from "./supermax";

const SEASON = 2030;
const mvp = (season: number): SupermaxAward => ({ season, category: "MVP" });
const dpoy = (season: number): SupermaxAward => ({
  season,
  category: "DEFENSIVE_PLAYER_OF_THE_YEAR",
});

const eligible = (input: {
  yearsOfExperience: number | null | undefined;
  awards: SupermaxAward[];
}) => isSupermaxEligible({ ...input, currentSeason: SEASON });

describe("isSupermaxEligible", () => {
  describe("the service band", () => {
    it.each([7, 8, 9])("admits %i years of service", (yearsOfExperience) => {
      expect(eligible({ yearsOfExperience, awards: [mvp(SEASON - 1)] })).toBe(true);
    });

    it("rejects 6 years - below the band, no matter the honours", () => {
      expect(eligible({ yearsOfExperience: 6, awards: [mvp(SEASON - 1)] })).toBe(false);
    });

    it("rejects 10 years, because that tier is already 35% without the rule", () => {
      expect(eligible({ yearsOfExperience: 10, awards: [mvp(SEASON - 1)] })).toBe(false);
    });
  });

  describe("the qualifying awards", () => {
    it("admits an MVP anywhere in the three-season window", () => {
      for (const season of [SEASON - 1, SEASON - 2, SEASON - 3]) {
        expect(eligible({ yearsOfExperience: 8, awards: [mvp(season)] })).toBe(true);
      }
    });

    it("admits a Defensive Player of the Year in the season just gone", () => {
      expect(eligible({ yearsOfExperience: 8, awards: [dpoy(SEASON - 1)] })).toBe(true);
    });

    it("rejects a single older Defensive Player of the Year", () => {
      expect(eligible({ yearsOfExperience: 8, awards: [dpoy(SEASON - 2)] })).toBe(false);
    });

    it("admits two Defensive Player of the Year awards in the window", () => {
      expect(eligible({ yearsOfExperience: 8, awards: [dpoy(SEASON - 2), dpoy(SEASON - 3)] })).toBe(
        true,
      );
    });

    it("rejects a player with no awards at all", () => {
      expect(eligible({ yearsOfExperience: 8, awards: [] })).toBe(false);
    });
  });

  describe("the window", () => {
    it("ignores an MVP from four seasons ago", () => {
      expect(eligible({ yearsOfExperience: 8, awards: [mvp(SEASON - 4)] })).toBe(false);
    });

    it("ignores an award from the season being signed for, which has not happened", () => {
      expect(eligible({ yearsOfExperience: 8, awards: [mvp(SEASON)] })).toBe(false);
    });

    it("counts only in-window Defensive Player awards toward the two-of-three test", () => {
      expect(eligible({ yearsOfExperience: 8, awards: [dpoy(SEASON - 3), dpoy(SEASON - 4)] })).toBe(
        false,
      );
    });
  });

  describe("bad input never unlocks the higher ceiling", () => {
    it.each([null, undefined, NaN, Infinity])("rejects service of %s", (yearsOfExperience) => {
      expect(eligible({ yearsOfExperience, awards: [mvp(SEASON - 1)] })).toBe(false);
    });
  });
});

describe("maxSalaryFractionFor guards the band itself", () => {
  it("grants 35% to a supermax-eligible player in the 7-9 band", () => {
    expect(maxSalaryFractionFor({ age: 29, yearsOfExperience: 8, supermaxEligible: true })).toBe(
      0.35,
    );
  });

  it("holds that player to 30% without the flag", () => {
    expect(maxSalaryFractionFor({ age: 29, yearsOfExperience: 8 })).toBe(0.3);
  });

  it("refuses to skip two tiers when a caller passes the flag below the band", () => {
    // `isSupermaxEligible` would never return true here; this is defence in
    // depth for a caller that sets the flag by mistake.
    expect(maxSalaryFractionFor({ age: 24, yearsOfExperience: 4, supermaxEligible: true })).toBe(
      0.25,
    );
  });

  it("changes nothing at 10+ years, where the tier is already 35%", () => {
    expect(maxSalaryFractionFor({ age: 32, yearsOfExperience: 12, supermaxEligible: true })).toBe(
      maxSalaryFractionFor({ age: 32, yearsOfExperience: 12 }),
    );
  });

  it("does not let the flag override the age fallback when service is unknown", () => {
    expect(maxSalaryFractionFor({ age: 24, yearsOfExperience: null, supermaxEligible: true })).toBe(
      maxSalaryFractionFor({ age: 24, yearsOfExperience: null }),
    );
  });
});
