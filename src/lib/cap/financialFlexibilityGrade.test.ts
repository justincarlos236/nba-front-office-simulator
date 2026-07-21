import { describe, expect, it } from "vitest";
import { ApronLevel } from "./apron";
import { getSeasonCapRules } from "./constants";
import { computeFinancialFlexibilityGrade } from "./financialFlexibilityGrade";
import { computeMultiYearProjection } from "./multiYearProjection";

const capCents = getSeasonCapRules(2025).salaryCapCents;

describe("computeFinancialFlexibilityGrade", () => {
  it("gives a clean cap-space team with no future commitments an A", () => {
    const result = computeFinancialFlexibilityGrade(
      ApronLevel.UNDER_CAP,
      computeMultiYearProjection([], 2026, 4),
      [],
      capCents,
    );
    expect(result.grade).toBe("A");
    expect(result.score).toBe(100);
  });

  it("penalizes a worse current apron level, all else equal", () => {
    const projections = computeMultiYearProjection([], 2026, 4);
    const underCap = computeFinancialFlexibilityGrade(
      ApronLevel.UNDER_CAP,
      projections,
      [],
      capCents,
    );
    const secondApron = computeFinancialFlexibilityGrade(
      ApronLevel.SECOND_APRON,
      projections,
      [],
      capCents,
    );
    expect(secondApron.score).toBeLessThan(underCap.score);
  });

  it("penalizes heavy future committed salary", () => {
    const lightFuture = computeMultiYearProjection(
      [{ season: 2026, salaryCents: 10_000_000_00n }],
      2026,
      4,
    );
    const heavyFuture = computeMultiYearProjection(
      [
        { season: 2026, salaryCents: capCents },
        { season: 2027, salaryCents: capCents },
        { season: 2028, salaryCents: capCents },
        { season: 2029, salaryCents: capCents },
      ],
      2026,
      4,
    );
    const light = computeFinancialFlexibilityGrade(ApronLevel.UNDER_CAP, lightFuture, [], capCents);
    const heavy = computeFinancialFlexibilityGrade(ApronLevel.UNDER_CAP, heavyFuture, [], capCents);
    expect(heavy.score).toBeLessThan(light.score);
    expect(heavy.grade).not.toBe("A");
  });

  it("penalizes a single large long-term (albatross) contract", () => {
    const projections = computeMultiYearProjection([], 2026, 4);
    const noAlbatross = computeFinancialFlexibilityGrade(
      ApronLevel.UNDER_CAP,
      projections,
      [],
      capCents,
    );
    const withAlbatross = computeFinancialFlexibilityGrade(
      ApronLevel.UNDER_CAP,
      projections,
      [{ currentSalaryCents: (capCents * 25n) / 100n, yearsRemaining: 4 }],
      capCents,
    );
    expect(withAlbatross.score).toBeLessThan(noAlbatross.score);
  });

  it("doesn't penalize a short-term or small contract as an albatross", () => {
    const projections = computeMultiYearProjection([], 2026, 4);
    const base = computeFinancialFlexibilityGrade(ApronLevel.UNDER_CAP, projections, [], capCents);
    const shortTerm = computeFinancialFlexibilityGrade(
      ApronLevel.UNDER_CAP,
      projections,
      [{ currentSalaryCents: (capCents * 25n) / 100n, yearsRemaining: 1 }],
      capCents,
    );
    const smallSalary = computeFinancialFlexibilityGrade(
      ApronLevel.UNDER_CAP,
      projections,
      [{ currentSalaryCents: (capCents * 5n) / 100n, yearsRemaining: 4 }],
      capCents,
    );
    expect(shortTerm.score).toBe(base.score);
    expect(smallSalary.score).toBe(base.score);
  });

  it("never scores below 0 or above 100", () => {
    const crushingFuture = computeMultiYearProjection(
      [
        { season: 2026, salaryCents: capCents * 3n },
        { season: 2027, salaryCents: capCents * 3n },
        { season: 2028, salaryCents: capCents * 3n },
        { season: 2029, salaryCents: capCents * 3n },
      ],
      2026,
      4,
    );
    const manyAlbatrosses = Array.from({ length: 10 }, () => ({
      currentSalaryCents: (capCents * 25n) / 100n,
      yearsRemaining: 4,
    }));
    const result = computeFinancialFlexibilityGrade(
      ApronLevel.SECOND_APRON,
      crushingFuture,
      manyAlbatrosses,
      capCents,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.grade).toBe("F");
  });
});
