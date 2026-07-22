import { describe, expect, it } from "vitest";
import { shouldStaffRetire, staffRetirementProbability } from "./staffRetirement";

describe("staffRetirementProbability", () => {
  it("is zero below the risk-start age", () => {
    expect(staffRetirementProbability(50)).toBe(0);
    expect(staffRetirementProbability(64)).toBe(0);
  });

  it("rises with age past the risk-start age", () => {
    const at66 = staffRetirementProbability(66);
    const at75 = staffRetirementProbability(75);
    expect(at66).toBeGreaterThan(0);
    expect(at75).toBeGreaterThan(at66);
  });

  it("is a certainty at/above the forced retirement age", () => {
    expect(staffRetirementProbability(78)).toBe(1);
    expect(staffRetirementProbability(85)).toBe(1);
  });

  it("never exceeds 1", () => {
    expect(staffRetirementProbability(120)).toBeLessThanOrEqual(1);
  });
});

describe("shouldStaffRetire", () => {
  it("never retires a young staff member", () => {
    expect(shouldStaffRetire(45, () => 0)).toBe(false);
  });

  it("always retires at the forced retirement age", () => {
    expect(shouldStaffRetire(78, () => 0.999)).toBe(true);
  });
});
