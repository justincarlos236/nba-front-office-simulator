import { describe, it, expect } from "vitest";
import {
  computeFinancialStanding,
  financialStandingPatienceFactor,
  financialStandingConfidenceBonus,
  ownerBacksTaxSpending,
  shouldIssueFinancialMandate,
} from "./ownershipFinance";

const M = 1_000_000 * 100; // one million dollars in cents

describe("computeFinancialStanding", () => {
  it("is DISTRESSED when cash has gone negative, regardless of the trend", () => {
    expect(computeFinancialStanding([50 * M], -1)).toBe("DISTRESSED");
  });

  it("is DISTRESSED after sustained heavy losses", () => {
    expect(computeFinancialStanding([-40 * M, -40 * M, 10 * M], 5 * M)).toBe("DISTRESSED");
  });

  it("is STRAINED when losing money this year but still solvent", () => {
    expect(computeFinancialStanding([-30 * M, 20 * M], 40 * M)).toBe("STRAINED");
  });

  it("is STRONG with a big profitable track record and a deep cushion", () => {
    expect(computeFinancialStanding([90 * M, 90 * M], 200 * M)).toBe("STRONG");
  });

  it("is SOLID when comfortably profitable but not loaded", () => {
    expect(computeFinancialStanding([30 * M, 25 * M], 60 * M)).toBe("SOLID");
  });

  it("is STABLE around breakeven", () => {
    expect(computeFinancialStanding([5 * M, -3 * M], 30 * M)).toBe("STABLE");
  });

  it("Finances as a Gameplay Pillar (Phase 5) - high debt downgrades an otherwise-STRONG standing", () => {
    const withoutDebt = computeFinancialStanding([90 * M, 90 * M], 200 * M);
    const withHeavyDebt = computeFinancialStanding([90 * M, 90 * M], 200 * M, 100 * M);
    expect(withoutDebt).toBe("STRONG");
    expect(withHeavyDebt).toBe("SOLID");
  });

  it("high debt never improves an already-poor standing", () => {
    expect(computeFinancialStanding([50 * M], -1, 999 * M)).toBe("DISTRESSED");
  });

  it("modest debt (at or under the threshold) has no effect", () => {
    expect(computeFinancialStanding([90 * M, 90 * M], 200 * M, 10 * M)).toBe("STRONG");
  });
});

describe("owner reactions to standing", () => {
  it("gives more patience (smaller loss multiplier) the stronger the standing", () => {
    expect(financialStandingPatienceFactor("STRONG")).toBeLessThan(
      financialStandingPatienceFactor("STABLE"),
    );
    expect(financialStandingPatienceFactor("DISTRESSED")).toBeGreaterThan(
      financialStandingPatienceFactor("STABLE"),
    );
  });

  it("rewards strong finances and erodes on distress via the ongoing bonus", () => {
    expect(financialStandingConfidenceBonus("STRONG")).toBeGreaterThan(0);
    expect(financialStandingConfidenceBonus("STABLE")).toBe(0);
    expect(financialStandingConfidenceBonus("DISTRESSED")).toBeLessThan(0);
  });

  it("backs tax spending only when the franchise is financially strong or solid", () => {
    expect(ownerBacksTaxSpending("STRONG")).toBe(true);
    expect(ownerBacksTaxSpending("SOLID")).toBe(true);
    expect(ownerBacksTaxSpending("STABLE")).toBe(false);
    expect(ownerBacksTaxSpending("STRAINED")).toBe(false);
  });

  it("issues a mandate only when distressed", () => {
    expect(shouldIssueFinancialMandate("DISTRESSED")).toBe(true);
    expect(shouldIssueFinancialMandate("STRAINED")).toBe(false);
    expect(shouldIssueFinancialMandate("STRONG")).toBe(false);
  });
});
