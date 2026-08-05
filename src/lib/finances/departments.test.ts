import { describe, it, expect } from "vitest";
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_BUDGET_TOTAL,
  NEUTRAL_DEPARTMENT_BUDGET,
  departmentBudgetTotal,
  isValidDepartmentBudget,
  departmentQualityDelta,
  departmentAnnualCostCents,
  totalDepartmentBudgetCostCents,
  departmentLevelIndex,
  departmentLevelFromIndex,
  type DepartmentBudget,
} from "./departments";

describe("departmentBudgetTotal / isValidDepartmentBudget", () => {
  it("the neutral budget (every department STANDARD) sums to the total", () => {
    expect(departmentBudgetTotal(NEUTRAL_DEPARTMENT_BUDGET)).toBe(DEPARTMENT_BUDGET_TOTAL);
    expect(isValidDepartmentBudget(NEUTRAL_DEPARTMENT_BUDGET)).toBe(true);
  });

  it("raising one department without lowering another is invalid - the zero-sum constraint", () => {
    const overBudget: DepartmentBudget = { ...NEUTRAL_DEPARTMENT_BUDGET, scouting: "MAXIMUM" };
    expect(isValidDepartmentBudget(overBudget)).toBe(false);
  });

  it("a valid reallocation (raise one, lower another by the same amount) stays valid", () => {
    const reallocated: DepartmentBudget = {
      ...NEUTRAL_DEPARTMENT_BUDGET,
      scouting: "MAXIMUM", // +2 from STANDARD
      marketing: "MINIMAL", // -2 from STANDARD
    };
    expect(departmentBudgetTotal(reallocated)).toBe(DEPARTMENT_BUDGET_TOTAL);
    expect(isValidDepartmentBudget(reallocated)).toBe(true);
  });

  it("every department key is covered by the total", () => {
    const allMinimal: DepartmentBudget = {
      scouting: "MINIMAL",
      playerDevelopment: "MINIMAL",
      sportsScience: "MINIMAL",
      analytics: "MINIMAL",
      marketing: "MINIMAL",
      coachingSupport: "MINIMAL",
    };
    expect(departmentBudgetTotal(allMinimal)).toBe(0);
    expect(DEPARTMENT_KEYS.length).toBe(6);
  });
});

describe("departmentLevelIndex / departmentLevelFromIndex", () => {
  it("round-trips every level", () => {
    for (const level of ["MINIMAL", "LOW", "STANDARD", "HIGH", "MAXIMUM"] as const) {
      expect(departmentLevelFromIndex(departmentLevelIndex(level))).toBe(level);
    }
  });

  it("clamps out-of-range indices", () => {
    expect(departmentLevelFromIndex(-5)).toBe("MINIMAL");
    expect(departmentLevelFromIndex(99)).toBe("MAXIMUM");
  });
});

describe("departmentQualityDelta", () => {
  it("STANDARD is neutral (0)", () => {
    expect(departmentQualityDelta("STANDARD")).toBe(0);
  });

  it("strictly increasing across the scale", () => {
    const levels = ["MINIMAL", "LOW", "STANDARD", "HIGH", "MAXIMUM"] as const;
    const deltas = levels.map(departmentQualityDelta);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]).toBeGreaterThan(deltas[i - 1]);
    }
  });
});

describe("departmentAnnualCostCents / totalDepartmentBudgetCostCents", () => {
  it("MINIMAL is free, cost strictly increases with level", () => {
    expect(departmentAnnualCostCents("MINIMAL")).toBe(0);
    const levels = ["MINIMAL", "LOW", "STANDARD", "HIGH", "MAXIMUM"] as const;
    const costs = levels.map(departmentAnnualCostCents);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    }
  });

  it("total cost sums all 6 departments", () => {
    const total = totalDepartmentBudgetCostCents(NEUTRAL_DEPARTMENT_BUDGET);
    expect(total).toBe(departmentAnnualCostCents("STANDARD") * 6);
  });

  it("a reallocated (still valid) budget can cost more or less than neutral, since cost isn't linear in level", () => {
    const specialized: DepartmentBudget = {
      ...NEUTRAL_DEPARTMENT_BUDGET,
      scouting: "MAXIMUM",
      marketing: "MINIMAL",
    };
    expect(isValidDepartmentBudget(specialized)).toBe(true);
    expect(totalDepartmentBudgetCostCents(specialized)).not.toBe(
      totalDepartmentBudgetCostCents(NEUTRAL_DEPARTMENT_BUDGET),
    );
  });
});
