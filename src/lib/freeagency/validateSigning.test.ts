import { describe, expect, it } from "vitest";
import { ApronLevel } from "../cap/apron";
import { getSeasonCapRules } from "../cap/constants";
import { validateSigning } from "./validateSigning";

const rules = getSeasonCapRules(2025);

describe("validateSigning", () => {
  it("always allows a minimum-salary offer, regardless of apron level", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: rules.emptyRosterChargeCents,
      team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
    });
    expect(result.isValid).toBe(true);
    expect(result.mechanism).toBe("VETERAN_MINIMUM");
  });

  it("lets a cap-space team sign up to its available room", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: 10_000_000_00n,
      team: { apronLevel: ApronLevel.UNDER_CAP, capSpaceCents: 15_000_000_00n },
    });
    expect(result.isValid).toBe(true);
    expect(result.mechanism).toBe("CAP_SPACE");
  });

  it("rejects a cap-space team offering more than its room", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: 20_000_000_00n,
      team: { apronLevel: ApronLevel.UNDER_CAP, capSpaceCents: 15_000_000_00n },
    });
    expect(result.isValid).toBe(false);
    expect(result.violation).toBeTruthy();
  });

  it("lets an over-the-cap, under-first-apron team use the full non-taxpayer MLE", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: rules.nonTaxpayerMLECents,
      team: { apronLevel: ApronLevel.TAXPAYER, capSpaceCents: 0n },
    });
    expect(result.isValid).toBe(true);
    expect(result.mechanism).toBe("NON_TAXPAYER_MLE");
  });

  it("limits a first-apron team to the smaller taxpayer MLE", () => {
    const overTaxpayerMle = rules.taxpayerMLECents + 1_00n;
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: overTaxpayerMle,
      team: { apronLevel: ApronLevel.FIRST_APRON, capSpaceCents: 0n },
    });
    expect(result.isValid).toBe(false);
  });

  it("hard-caps a second-apron team out of any exception above the minimum", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: rules.emptyRosterChargeCents + 1_00n,
      team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
    });
    expect(result.isValid).toBe(false);
    expect(result.violation).toMatch(/hard-capped/);
  });
});
