import { eligibleMidLevelException, type ApronLevel } from "../cap/apron";
import { getSeasonCapRules } from "../cap/constants";
import { isUnderCapSpace } from "../trade/salaryMatching";

export interface SigningTeamCapState {
  apronLevel: ApronLevel;
  capSpaceCents: bigint;
}

export interface ValidateSigningInput {
  season: number;
  offerSalaryCents: bigint;
  team: SigningTeamCapState;
}

export type SigningMechanism =
  "CAP_SPACE" | "NON_TAXPAYER_MLE" | "TAXPAYER_MLE" | "VETERAN_MINIMUM";

export interface SigningValidationResult {
  isValid: boolean;
  mechanism: SigningMechanism | null;
  maxAllowedCents: bigint;
  violation: string | null;
}

/**
 * Checks whether a team can sign a free agent at a given first-year salary,
 * using a simplified model of real signing mechanisms: cap space (teams
 * under the cap), the non-taxpayer/taxpayer mid-level exception (over the
 * cap, gated by apron level via `eligibleMidLevelException`), or a
 * veteran-minimum deal (always legal, regardless of apron status - the one
 * exception the CBA never restricts).
 *
 * Simplification: this checks each signing against the exception's full
 * per-season ceiling, but doesn't track cumulative exception spend across
 * multiple signings in the same offseason the way the real MLE (one bucket
 * to split across any number of players) works. Good enough to gate any
 * single signing realistically; not a full free-agency-period simulation.
 */
export function validateSigning(input: ValidateSigningInput): SigningValidationResult {
  const rules = getSeasonCapRules(input.season);
  const { team, offerSalaryCents } = input;

  if (offerSalaryCents <= rules.emptyRosterChargeCents) {
    return {
      isValid: true,
      mechanism: "VETERAN_MINIMUM",
      maxAllowedCents: rules.emptyRosterChargeCents,
      violation: null,
    };
  }

  if (isUnderCapSpace(team.apronLevel)) {
    if (offerSalaryCents <= team.capSpaceCents) {
      return {
        isValid: true,
        mechanism: "CAP_SPACE",
        maxAllowedCents: team.capSpaceCents,
        violation: null,
      };
    }
    return {
      isValid: false,
      mechanism: null,
      maxAllowedCents: team.capSpaceCents,
      violation: `Team only has ${team.capSpaceCents} cents of cap space available for this offer.`,
    };
  }

  const mleType = eligibleMidLevelException(team.apronLevel);
  const mleAmount =
    mleType === "NON_TAXPAYER"
      ? rules.nonTaxpayerMLECents
      : mleType === "TAXPAYER"
        ? rules.taxpayerMLECents
        : 0n;

  if (mleAmount > 0n && offerSalaryCents <= mleAmount) {
    return {
      isValid: true,
      mechanism: mleType === "NON_TAXPAYER" ? "NON_TAXPAYER_MLE" : "TAXPAYER_MLE",
      maxAllowedCents: mleAmount,
      violation: null,
    };
  }

  return {
    isValid: false,
    mechanism: null,
    maxAllowedCents: mleAmount,
    violation: mleType
      ? `Team's ${mleType.toLowerCase().replace("_", "-")} mid-level exception caps at ${mleAmount} cents.`
      : "Second-apron teams are hard-capped out of every mid-level exception - only a minimum-salary deal is possible.",
  };
}
