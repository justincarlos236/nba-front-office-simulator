import { describe, it, expect } from "vitest";
import {
  loanAmountCents,
  computeAnnualInterestCents,
  DEBT_ANNUAL_INTEREST_RATE,
  capitalCallAmountCents,
  capitalCallConfidenceCost,
  distressedFinancingAmountCents,
  isDistressedFinancingEligible,
} from "./financing";

const M = 1_000_000 * 100;

describe("loanAmountCents", () => {
  it("increases with tier", () => {
    expect(loanAmountCents("SMALL")).toBeLessThan(loanAmountCents("MEDIUM"));
    expect(loanAmountCents("MEDIUM")).toBeLessThan(loanAmountCents("LARGE"));
  });
});

describe("computeAnnualInterestCents", () => {
  it("charges the flat annual rate on the balance", () => {
    expect(computeAnnualInterestCents(100 * M)).toBe(
      Math.round(100 * M * DEBT_ANNUAL_INTEREST_RATE),
    );
  });

  it("is zero with no debt", () => {
    expect(computeAnnualInterestCents(0)).toBe(0);
  });

  it("never goes negative even with a bogus negative balance", () => {
    expect(computeAnnualInterestCents(-5 * M)).toBe(0);
  });
});

describe("capitalCallAmountCents / capitalCallConfidenceCost", () => {
  it("bigger asks cost proportionally more cash and more confidence", () => {
    expect(capitalCallAmountCents("LARGE")).toBeGreaterThan(capitalCallAmountCents("SMALL"));
    expect(capitalCallConfidenceCost("LARGE")).toBeGreaterThan(capitalCallConfidenceCost("SMALL"));
  });

  it("every tier costs real confidence - never free money", () => {
    for (const tier of ["SMALL", "MEDIUM", "LARGE"] as const) {
      expect(capitalCallConfidenceCost(tier)).toBeGreaterThan(0);
    }
  });
});

describe("distressed financing", () => {
  it("is not eligible with a healthy cash reserve", () => {
    expect(isDistressedFinancingEligible(10 * M)).toBe(false);
  });

  it("is eligible only once cash is genuinely, deeply negative", () => {
    expect(isDistressedFinancingEligible(-30 * M)).toBe(true);
  });

  it("provides a real but modest amount", () => {
    expect(distressedFinancingAmountCents()).toBeGreaterThan(0);
  });
});
