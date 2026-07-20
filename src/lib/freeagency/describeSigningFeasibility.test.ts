import { describe, expect, it } from "vitest";
import { describeSigningFeasibility } from "./describeSigningFeasibility";

describe("describeSigningFeasibility", () => {
  it("labels a cap-space signing as Cap Space", () => {
    const summary = describeSigningFeasibility({
      isValid: true,
      mechanism: "CAP_SPACE",
      maxAllowedCents: 20_000_000_00n,
      violation: null,
    });
    expect(summary.isValid).toBe(true);
    expect(summary.headline).toContain("Legal via Cap Space");
  });

  it("collapses both MLE variants into Signing Exception", () => {
    const nonTaxpayer = describeSigningFeasibility({
      isValid: true,
      mechanism: "NON_TAXPAYER_MLE",
      maxAllowedCents: 12_405_000_00n,
      violation: null,
    });
    const taxpayer = describeSigningFeasibility({
      isValid: true,
      mechanism: "TAXPAYER_MLE",
      maxAllowedCents: 5_000_000_00n,
      violation: null,
    });
    expect(nonTaxpayer.headline).toContain("Legal via Signing Exception");
    expect(taxpayer.headline).toContain("Legal via Signing Exception");
  });

  it("labels a veteran-minimum signing as Minimum Contract", () => {
    const summary = describeSigningFeasibility({
      isValid: true,
      mechanism: "VETERAN_MINIMUM",
      maxAllowedCents: 2_000_000_00n,
      violation: null,
    });
    expect(summary.headline).toContain("Legal via Minimum Contract");
  });

  it("gives a simple explanation when the offer isn't legal", () => {
    const summary = describeSigningFeasibility({
      isValid: false,
      mechanism: null,
      maxAllowedCents: 5_000_000_00n,
      violation: "Team's non-taxpayer mid-level exception caps at 1240500000 cents.",
    });
    expect(summary.isValid).toBe(false);
    expect(summary.headline).not.toContain("cents");
  });
});
