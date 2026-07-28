import { describe, it, expect } from "vitest";
import {
  computeFranchiseIconScore,
  getFranchiseIconLevel,
  computeIconDepartureImpact,
  iconValuePremiumFraction,
} from "./franchiseIcon";

describe("computeFranchiseIconScore", () => {
  it("rates a homegrown, long-tenured, decorated superstar far above a fresh acquisition", () => {
    const legend = computeFranchiseIconScore({
      starTier: "SUPERSTAR",
      tenureSeasons: 11,
      homegrown: true,
      careerAwards: 6,
    });
    const rental = computeFranchiseIconScore({
      starTier: "SUPERSTAR",
      tenureSeasons: 0,
      homegrown: false,
      careerAwards: 0,
    });
    expect(legend).toBeGreaterThan(rental);
    expect(getFranchiseIconLevel(legend)).toBe("LEGEND");
  });

  it("each of tenure, homegrown, and awards independently raises the score", () => {
    const base = { starTier: "STAR" as const, tenureSeasons: 2, homegrown: false, careerAwards: 0 };
    expect(computeFranchiseIconScore({ ...base, tenureSeasons: 8 })).toBeGreaterThan(
      computeFranchiseIconScore(base),
    );
    expect(computeFranchiseIconScore({ ...base, homegrown: true })).toBeGreaterThan(
      computeFranchiseIconScore(base),
    );
    expect(computeFranchiseIconScore({ ...base, careerAwards: 5 })).toBeGreaterThan(
      computeFranchiseIconScore(base),
    );
  });

  it("a role player is never a franchise icon", () => {
    const score = computeFranchiseIconScore({
      starTier: "ROTATION",
      tenureSeasons: 3,
      homegrown: false,
      careerAwards: 0,
    });
    expect(getFranchiseIconLevel(score)).toBe("REGULAR");
  });
});

describe("computeIconDepartureImpact", () => {
  it("does nothing for a below-threshold player", () => {
    const impact = computeIconDepartureImpact(30);
    expect(impact.notable).toBe(false);
    expect(impact.franchiseValueHitCents).toBe(0);
    expect(impact.fanHappinessHit).toBe(0);
  });

  it("hits harder the more iconic the departing player", () => {
    const cornerstone = computeIconDepartureImpact(55);
    const legend = computeIconDepartureImpact(95);
    expect(cornerstone.notable).toBe(true);
    expect(legend.franchiseValueHitCents).toBeGreaterThan(cornerstone.franchiseValueHitCents);
    expect(legend.fanHappinessHit).toBeLessThan(cornerstone.fanHappinessHit); // more negative
  });
});

describe("iconValuePremiumFraction", () => {
  it("is zero below Core level and grows with icon score", () => {
    expect(iconValuePremiumFraction(20)).toBe(0);
    expect(iconValuePremiumFraction(90)).toBeGreaterThan(iconValuePremiumFraction(50));
    expect(iconValuePremiumFraction(100)).toBeLessThanOrEqual(0.18);
  });
});
