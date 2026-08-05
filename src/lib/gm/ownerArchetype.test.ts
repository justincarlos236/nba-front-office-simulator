import { describe, it, expect } from "vitest";
import {
  archetypeConfidenceDeltaMultiplier,
  archetypeExpectationLevelShift,
  archetypeDirectiveConfidenceThreshold,
  archetypeShouldIssueFinancialMandate,
  rollOwnerArchetype,
  shouldOwnershipChange,
  confidenceAfterOwnershipChange,
  describeOwnershipChange,
  OWNER_ARCHETYPE_LABEL,
} from "./ownerArchetype";
import type { OwnerArchetype } from "@/generated/prisma/client";

const ALL_ARCHETYPES: OwnerArchetype[] = [
  "WIN_NOW_BILLIONAIRE",
  "PENNY_PINCHER",
  "PATIENT_BUILDER",
  "ABSENTEE",
  "MEDDLER",
];

describe("archetypeConfidenceDeltaMultiplier", () => {
  it("every archetype has a defined, positive multiplier", () => {
    for (const a of ALL_ARCHETYPES) {
      expect(archetypeConfidenceDeltaMultiplier(a)).toBeGreaterThan(0);
    }
  });

  it("Meddler reacts more strongly than Absentee", () => {
    expect(archetypeConfidenceDeltaMultiplier("MEDDLER")).toBeGreaterThan(
      archetypeConfidenceDeltaMultiplier("ABSENTEE"),
    );
  });

  it("Win-Now Billionaire reacts more strongly than Patient Builder", () => {
    expect(archetypeConfidenceDeltaMultiplier("WIN_NOW_BILLIONAIRE")).toBeGreaterThan(
      archetypeConfidenceDeltaMultiplier("PATIENT_BUILDER"),
    );
  });
});

describe("archetypeExpectationLevelShift", () => {
  it("Win-Now Billionaire sets a higher bar than Patient Builder for the same roster", () => {
    expect(archetypeExpectationLevelShift("WIN_NOW_BILLIONAIRE")).toBeGreaterThan(
      archetypeExpectationLevelShift("PATIENT_BUILDER"),
    );
  });
});

describe("archetypeDirectiveConfidenceThreshold", () => {
  it("Penny-Pincher's effective threshold is higher (triggers more readily) than Absentee's", () => {
    const base = 35;
    expect(archetypeDirectiveConfidenceThreshold("PENNY_PINCHER", base)).toBeGreaterThan(
      archetypeDirectiveConfidenceThreshold("ABSENTEE", base),
    );
  });
});

describe("archetypeShouldIssueFinancialMandate", () => {
  it("Absentee never issues a mandate, even when the base check says yes", () => {
    expect(archetypeShouldIssueFinancialMandate("ABSENTEE", "DISTRESSED", true)).toBe(false);
  });

  it("Penny-Pincher issues a mandate a season earlier - at STRAINED, not just DISTRESSED", () => {
    expect(archetypeShouldIssueFinancialMandate("PENNY_PINCHER", "STRAINED", false)).toBe(true);
  });

  it("every other archetype defers to the base check", () => {
    expect(archetypeShouldIssueFinancialMandate("PATIENT_BUILDER", "DISTRESSED", true)).toBe(true);
    expect(archetypeShouldIssueFinancialMandate("PATIENT_BUILDER", "STABLE", false)).toBe(false);
  });
});

describe("rollOwnerArchetype", () => {
  it("covers all 5 archetypes across enough rolls", () => {
    const seen = new Set<OwnerArchetype>();
    for (let i = 0; i < 200; i++) {
      seen.add(rollOwnerArchetype(() => i / 200));
    }
    expect(seen.size).toBe(ALL_ARCHETYPES.length);
  });
});

describe("shouldOwnershipChange", () => {
  it("never fires before the minimum tenure, regardless of the roll", () => {
    expect(shouldOwnershipChange(0, () => 0)).toBe(false);
    expect(shouldOwnershipChange(2, () => 0)).toBe(false);
  });

  it("can fire once past the minimum tenure", () => {
    expect(shouldOwnershipChange(5, () => 0)).toBe(true);
    expect(shouldOwnershipChange(5, () => 0.999)).toBe(false);
  });
});

describe("confidenceAfterOwnershipChange", () => {
  it("pulls a very low confidence up toward neutral, not to zero", () => {
    const result = confidenceAfterOwnershipChange(5);
    expect(result).toBeGreaterThan(5);
    expect(result).toBeLessThan(65);
  });

  it("pulls a very high confidence down toward neutral, not to 100", () => {
    const result = confidenceAfterOwnershipChange(95);
    expect(result).toBeLessThan(95);
    expect(result).toBeGreaterThan(65);
  });
});

describe("describeOwnershipChange", () => {
  it("names the new archetype in the message", () => {
    const message = describeOwnershipChange("MEDDLER");
    expect(message).toContain(OWNER_ARCHETYPE_LABEL.MEDDLER.toLowerCase());
  });
});
