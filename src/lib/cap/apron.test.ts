import { describe, expect, it } from "vitest";
import {
  ApronLevel,
  canUseBiAnnualException,
  eligibleMidLevelException,
  getApronLevel,
} from "./apron";
import { getSeasonCapRules } from "./constants";

const rules = getSeasonCapRules(2025);

describe("getApronLevel", () => {
  it("classifies a team under the cap", () => {
    expect(getApronLevel(rules.salaryCapCents - 1n, rules)).toBe(ApronLevel.UNDER_CAP);
  });

  it("classifies a team between the cap and the tax line", () => {
    expect(getApronLevel(rules.salaryCapCents, rules)).toBe(ApronLevel.BETWEEN_CAP_AND_TAX);
  });

  it("classifies a taxpayer team", () => {
    expect(getApronLevel(rules.luxuryTaxCents, rules)).toBe(ApronLevel.TAXPAYER);
  });

  it("classifies a first-apron team", () => {
    expect(getApronLevel(rules.firstApronCents, rules)).toBe(ApronLevel.FIRST_APRON);
  });

  it("classifies a second-apron team", () => {
    expect(getApronLevel(rules.secondApronCents, rules)).toBe(ApronLevel.SECOND_APRON);
  });
});

describe("eligibleMidLevelException", () => {
  it("gives cap-space teams the room exception", () => {
    expect(eligibleMidLevelException(ApronLevel.UNDER_CAP)).toBe("ROOM");
  });

  it("gives over-the-cap, under-first-apron teams the full non-taxpayer MLE", () => {
    expect(eligibleMidLevelException(ApronLevel.BETWEEN_CAP_AND_TAX)).toBe("NON_TAXPAYER");
    expect(eligibleMidLevelException(ApronLevel.TAXPAYER)).toBe("NON_TAXPAYER");
  });

  it("limits first-apron teams to the taxpayer MLE", () => {
    expect(eligibleMidLevelException(ApronLevel.FIRST_APRON)).toBe("TAXPAYER");
  });

  it("hard-caps second-apron teams out of every mid-level exception", () => {
    expect(eligibleMidLevelException(ApronLevel.SECOND_APRON)).toBeNull();
  });
});

describe("canUseBiAnnualException", () => {
  it("allows it below the second apron", () => {
    expect(canUseBiAnnualException(ApronLevel.FIRST_APRON)).toBe(true);
  });

  it("blocks it at the second apron", () => {
    expect(canUseBiAnnualException(ApronLevel.SECOND_APRON)).toBe(false);
  });
});
