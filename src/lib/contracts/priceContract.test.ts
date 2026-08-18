import { describe, expect, it } from "vitest";
import {
  contractQualityScore,
  pickContractLength,
  positionalMarketFactor,
  priceContractCents,
  RATING_TO_PRODUCTION_SCALE,
  rookieScaleDiscount,
} from "./priceContract";
import { getSeasonCapRules } from "../cap/constants";
import { maxSalaryFractionForAge, maxSalaryFractionFor } from "../cap/maxSalary";

const SEASON = 2025;
const CAP = Number(getSeasonCapRules(SEASON).salaryCapCents);
const price = (quality: number, age = 27, experience = 6) =>
  priceContractCents({ season: SEASON, quality, age, yearsOfExperience: experience });

/**
 * Every test here guards a finding in docs/audits/CONTRACT_AUDIT.md. The audit's
 * criticism of the previous test suite was that it checked the generator was
 * deterministic and bounded but never that a better player earns more than a
 * worse one - so a backup centre could outearn a franchise wing with the whole
 * suite green.
 */

describe("contractQualityScore - sample size (C-P0-2)", () => {
  const scouted = 70;
  const hotStreak = 92;

  it("trusts a full season outright", () => {
    expect(
      contractQualityScore({
        overallRating: scouted,
        performanceScore: hotStreak,
        gamesPlayed: 82,
      }),
    ).toBeGreaterThan(
      contractQualityScore({
        overallRating: scouted,
        performanceScore: hotStreak,
        gamesPlayed: 11,
      }),
    );
  });

  it("holds an eleven-game hot streak close to the scouting rating", () => {
    const q = contractQualityScore({
      overallRating: scouted,
      performanceScore: hotStreak,
      gamesPlayed: 11,
    });
    // Ty Jerome played 15 games and was priced as a 91.5, which bought him the
    // third-highest salary in the league. The small tolerance is the
    // rating-to-production scale translation, not evidence.
    expect(q).toBeLessThan(scouted + 2 + RATING_TO_PRODUCTION_SCALE);
  });

  it("never lets production alone carry a player to a superstar price", () => {
    // A 70-rated player posting a 99 for a whole season is still not a max guy.
    const q = contractQualityScore({ overallRating: 70, performanceScore: 99, gamesPlayed: 82 });
    expect(q).toBeLessThan(80);
  });

  it("prices off the rating alone when there is no season behind the player", () => {
    const q = contractQualityScore({ overallRating: 77, performanceScore: null, gamesPlayed: 0 });
    expect(q).toBeCloseTo(77 + RATING_TO_PRODUCTION_SCALE, 6);
  });

  it("orders unproven players by rating", () => {
    const q = (r: number) =>
      contractQualityScore({ overallRating: r, performanceScore: null, gamesPlayed: 0 });
    expect(q(85)).toBeGreaterThan(q(70));
  });

  it("treats a negative game count as no evidence rather than as a season", () => {
    expect(
      contractQualityScore({ overallRating: 70, performanceScore: 99, gamesPlayed: -5 }),
    ).toBeCloseTo(70 + RATING_TO_PRODUCTION_SCALE, 6);
  });

  it("caps confidence at a full season, so an absurd game count adds nothing", () => {
    expect(
      contractQualityScore({ overallRating: 70, performanceScore: 99, gamesPlayed: 10_000 }),
    ).toBe(contractQualityScore({ overallRating: 70, performanceScore: 99, gamesPlayed: 82 }));
  });
});

describe("priceContractCents - bounds (C-P0-3)", () => {
  it("never exceeds the individual maximum, at any quality", () => {
    // Age and service are paired plausibly - a 21-year-old with 12 years of
    // service is not a player. The tiers are set by SERVICE (the real CBA
    // rule); age is only the fallback when a draft year is unknown.
    for (const [age, experience] of [
      [21, 1],
      [27, 6],
      [30, 9],
      [36, 14],
    ] as const) {
      const max = CAP * maxSalaryFractionFor({ age, yearsOfExperience: experience });
      for (const quality of [80, 90, 99, 150]) {
        expect(price(quality, age, experience)).toBeLessThanOrEqual(Math.round(max));
      }
    }
  });

  it("never falls below the league minimum, at any quality", () => {
    const floor = Number(getSeasonCapRules(SEASON).emptyRosterChargeCents);
    for (const quality of [0, 40, 60]) expect(price(quality)).toBeGreaterThanOrEqual(floor);
  });

  it("holds the clamp even against negotiation noise at its maximum", () => {
    const max = CAP * maxSalaryFractionFor({ age: 27, yearsOfExperience: 8 });
    const withNoise = priceContractCents({
      season: SEASON,
      quality: 99,
      age: 27,
      yearsOfExperience: 8,
      noise: 1.15,
    });
    expect(withNoise).toBeLessThanOrEqual(Math.round(max));
  });

  it("gives a longer-serving player a higher ceiling, as the real tiers do", () => {
    expect(maxSalaryFractionFor({ age: 31, yearsOfExperience: 11 })).toBeGreaterThan(
      maxSalaryFractionFor({ age: 24, yearsOfExperience: 3 }),
    );
  });

  it("tiers on service rather than age when both are known", () => {
    // The bug this replaced: Lauri Markkanen (9 years, rated 89) drew the 35%
    // tier on age while Shai Gilgeous-Alexander (8 years, rated 98) was held
    // to 30% - a worse player permitted a bigger maximum for being older.
    expect(maxSalaryFractionFor({ age: 30, yearsOfExperience: 9 })).toBe(
      maxSalaryFractionFor({ age: 28, yearsOfExperience: 8 }),
    );
  });

  it("falls back to the age proxy when service is unknown", () => {
    expect(maxSalaryFractionFor({ age: 31 })).toBe(maxSalaryFractionForAge(31));
    expect(maxSalaryFractionFor({ age: 24, yearsOfExperience: null })).toBe(
      maxSalaryFractionForAge(24),
    );
  });
});

describe("priceContractCents - a better player earns more", () => {
  it("orders pay by quality across the whole range", () => {
    // A tenured player, so the maximum-salary clamp does not flatten the top
    // of the range - the point here is the ordering, not the ceiling, which
    // the bounds tests above cover.
    //
    // The range starts at 74 rather than 62: after the pricing curve was refit
    // (docs/audits/SALARY_SYSTEM_AUDIT.md P0-1), an 11-year veteran below ~70 quality
    // prices at the veteran minimum, and two players both on the minimum
    // correctly earn the same. That floor is covered by its own test below.
    const qualities = [74, 80, 86, 92, 98];
    const salaries = qualities.map((q) => price(q, 30, 11));
    for (let i = 1; i < salaries.length; i++) expect(salaries[i]).toBeGreaterThan(salaries[i - 1]);
  });

  it("pays a superstar materially more than a rotation player", () => {
    expect(price(92)).toBeGreaterThan(price(70) * 3);
  });

  it("discounts for age on every path, not just at bootstrap (C-P1-3)", () => {
    const ages = [27, 30, 33, 36, 39];
    const salaries = ages.map((a) => price(85, a, 12));
    for (let i = 1; i < salaries.length; i++) expect(salaries[i]).toBeLessThan(salaries[i - 1]);
  });

  it("discounts a rookie-scale player below an identical veteran", () => {
    expect(price(85, 24, 0)).toBeLessThan(price(85, 24, 8));
    expect(rookieScaleDiscount(0)).toBeLessThan(rookieScaleDiscount(4));
  });
});

describe("pickContractLength (C-P1-5)", () => {
  // Length is drawn from a band, so these are distribution properties.
  const meanLength = (quality: number, age: number) => {
    let total = 0;
    for (let i = 0; i < 400; i++) {
      let seed = i * 2654435761;
      const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      total += pickContractLength(quality, age, rng);
    }
    return total / 400;
  };

  it("gives better players longer deals", () => {
    const bands = [64, 72, 80, 88].map((q) => meanLength(q, 27));
    for (let i = 1; i < bands.length; i++) expect(bands[i]).toBeGreaterThan(bands[i - 1]);
  });

  it("shortens deals as a player ages, even for a star", () => {
    const ages = [27, 31, 33, 35].map((a) => meanLength(90, a));
    for (let i = 1; i < ages.length; i++) expect(ages[i]).toBeLessThan(ages[i - 1]);
  });

  it("never gives a fringe player a long guaranteed deal", () => {
    for (let i = 0; i < 200; i++) {
      let seed = i * 40503;
      const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      expect(pickContractLength(65, 29, rng)).toBeLessThanOrEqual(2);
    }
  });

  it("stays within one and five years for every input", () => {
    for (const quality of [60, 70, 80, 90, 99]) {
      for (const age of [20, 27, 34, 40]) {
        let seed = quality * age;
        const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        const length = pickContractLength(quality, age, rng);
        expect(length).toBeGreaterThanOrEqual(1);
        expect(length).toBeLessThanOrEqual(5);
      }
    }
  });
});

/**
 * docs/audits/RATING_AUDIT.md R-P1-1. The rating model measures quality correctly -
 * within each position its correlation with real salary is 0.73-0.88, and
 * centres and power forwards rank best of all five. What differs is what the
 * league *pays* a position, so the correction lives in the price.
 */
describe("positional market factor", () => {
  it("pays a centre less than a small forward of identical quality and age", () => {
    const centre = priceContractCents({ ...base(), position: "C" });
    const wing = priceContractCents({ ...base(), position: "SF" });
    expect(centre).toBeLessThan(wing);
  });

  it("leaves an unknown or missing position unadjusted", () => {
    const plain = priceContractCents(base());
    expect(priceContractCents({ ...base(), position: null })).toBe(plain);
    expect(priceContractCents({ ...base(), position: "XX" })).toBe(plain);
    expect(positionalMarketFactor(undefined)).toBe(1);
  });

  it("is case-insensitive, since providers disagree on casing", () => {
    expect(positionalMarketFactor("c")).toBe(positionalMarketFactor("C"));
  });

  it("stays a modest adjustment - it reprices positions, it does not re-rank players", () => {
    for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
      const f = positionalMarketFactor(pos);
      expect(f).toBeGreaterThan(0.85);
      expect(f).toBeLessThan(1.2);
    }
    // A better player at the cheapest position still outearns a worse one at
    // the dearest - the factor must never invert quality.
    const goodCentre = priceContractCents({
      season: SEASON,
      quality: 90,
      age: 27,
      yearsOfExperience: 8,
      position: "C",
    });
    const weakWing = priceContractCents({
      season: SEASON,
      quality: 78,
      age: 27,
      yearsOfExperience: 8,
      position: "SF",
    });
    expect(goodCentre).toBeGreaterThan(weakWing);
  });

  it("never lets a position premium break the individual maximum", () => {
    const max = CAP * maxSalaryFractionForAge(31);
    expect(
      priceContractCents({
        season: SEASON,
        quality: 99,
        age: 31,
        yearsOfExperience: 12,
        position: "SF",
        noise: 1.15,
      }),
    ).toBeLessThanOrEqual(Math.round(max));
  });
});

function base() {
  return { season: SEASON, quality: 82, age: 27, yearsOfExperience: 8 };
}
