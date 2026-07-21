import { describe, expect, it } from "vitest";
import { ApronLevel } from "../cap/apron";
import { computePayrollTier } from "./payrollTier";

describe("computePayrollTier", () => {
  it("maps each apron level to the expected tier", () => {
    expect(computePayrollTier(ApronLevel.UNDER_CAP)).toBe("MODEST");
    expect(computePayrollTier(ApronLevel.BETWEEN_CAP_AND_TAX)).toBe("MODERATE");
    expect(computePayrollTier(ApronLevel.TAXPAYER)).toBe("SIGNIFICANT");
    expect(computePayrollTier(ApronLevel.FIRST_APRON)).toBe("EXTREME");
    expect(computePayrollTier(ApronLevel.SECOND_APRON)).toBe("EXTREME");
  });
});
