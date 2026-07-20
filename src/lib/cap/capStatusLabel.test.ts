import { describe, expect, it } from "vitest";
import { ApronLevel } from "./apron";
import { simplifyCapStatus } from "./capStatusLabel";

describe("simplifyCapStatus", () => {
  it("maps UNDER_CAP to UNDER_CAP", () => {
    expect(simplifyCapStatus(ApronLevel.UNDER_CAP)).toBe("UNDER_CAP");
  });

  it("maps BETWEEN_CAP_AND_TAX to OVER_CAP", () => {
    expect(simplifyCapStatus(ApronLevel.BETWEEN_CAP_AND_TAX)).toBe("OVER_CAP");
  });

  it("collapses taxpayer/first apron/second apron into LUXURY_TAX", () => {
    expect(simplifyCapStatus(ApronLevel.TAXPAYER)).toBe("LUXURY_TAX");
    expect(simplifyCapStatus(ApronLevel.FIRST_APRON)).toBe("LUXURY_TAX");
    expect(simplifyCapStatus(ApronLevel.SECOND_APRON)).toBe("LUXURY_TAX");
  });
});
