import { describe, expect, it } from "vitest";
import { ApronLevel } from "../cap/apron";
import { getSeasonCapRules } from "../cap/constants";
import { validateSigning } from "./validateSigning";
import { veteranMinimumCents } from "../cap/veteranMinimum";

const rules = getSeasonCapRules(2025);

describe("validateSigning", () => {
  it("always allows a minimum-salary offer, regardless of apron level", () => {
    // The real minimum, not `emptyRosterChargeCents`. This fixture used the
    // cap hold because the two were the same number before C-P2-1 - they are
    // different rules, and the rookie minimum is genuinely a little below the
    // hold on the real scale.
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: veteranMinimumCents(2025, 0),
      team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
    });
    expect(result.isValid).toBe(true);
    expect(result.mechanism).toBe("VETERAN_MINIMUM");
  });

  it("holds a veteran to his own higher minimum, not a rookie's", () => {
    // The regression C-P2-1 exists for: one flat figure meant a ten-year
    // veteran could be signed at a rookie's minimum.
    const rookieMinimum = veteranMinimumCents(2025, 0);
    const asVeteran = validateSigning({
      season: 2025,
      offerSalaryCents: rookieMinimum,
      yearsOfExperience: 10,
      team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
    });
    // Still legal - it is below his minimum, so it is a minimum deal - but the
    // ceiling reported back is HIS minimum, which is what a caller prices off.
    expect(asVeteran.mechanism).toBe("VETERAN_MINIMUM");
    expect(asVeteran.maxAllowedCents).toBeGreaterThan(rookieMinimum);
  });

  it("lets a second-apron team pay a veteran his full minimum", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: veteranMinimumCents(2025, 10),
      yearsOfExperience: 10,
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

  it("lets a second-apron team re-sign its own player above every other limit via Re-Signing Rights", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: 30_000_000_00n,
      team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
      reSigningRights: { held: true, maxOfferCents: 35_000_000_00n },
    });
    expect(result.isValid).toBe(true);
    expect(result.mechanism).toBe("RE_SIGNING_RIGHTS");
  });

  it("doesn't grant Re-Signing Rights for a team that doesn't hold them, even under the ceiling", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: 30_000_000_00n,
      team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
      reSigningRights: { held: false, maxOfferCents: 35_000_000_00n },
    });
    expect(result.isValid).toBe(false);
  });

  it("rejects a Re-Signing Rights offer above the player's ceiling, falling through to normal rules", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: 40_000_000_00n,
      team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
      reSigningRights: { held: true, maxOfferCents: 35_000_000_00n },
    });
    expect(result.isValid).toBe(false);
  });

  it("reduces remaining Signing Exception room by what's already been used this season", () => {
    const full = validateSigning({
      season: 2025,
      offerSalaryCents: rules.nonTaxpayerMLECents,
      team: { apronLevel: ApronLevel.TAXPAYER, capSpaceCents: 0n },
    });
    expect(full.isValid).toBe(true);

    const partiallyUsed = validateSigning({
      season: 2025,
      offerSalaryCents: rules.nonTaxpayerMLECents,
      team: {
        apronLevel: ApronLevel.TAXPAYER,
        capSpaceCents: 0n,
        signingExceptionUsedCents: 5_000_000_00n,
      },
    });
    expect(partiallyUsed.isValid).toBe(false);
    expect(partiallyUsed.maxAllowedCents).toBe(rules.nonTaxpayerMLECents - 5_000_000_00n);
  });

  it("fully exhausts the Signing Exception once used-up amount reaches the ceiling", () => {
    const result = validateSigning({
      season: 2025,
      offerSalaryCents: rules.emptyRosterChargeCents + 1_00n,
      team: {
        apronLevel: ApronLevel.TAXPAYER,
        capSpaceCents: 0n,
        signingExceptionUsedCents: rules.nonTaxpayerMLECents,
      },
    });
    expect(result.isValid).toBe(false);
    expect(result.maxAllowedCents).toBe(0n);
  });
});
