import { eligibleMidLevelException, type ApronLevel } from "../cap/apron";
import { getSeasonCapRules } from "../cap/constants";
import { veteranMinimumCents } from "../cap/veteranMinimum";
import { isUnderCapSpace } from "../trade/salaryMatching";

export interface SigningTeamCapState {
  apronLevel: ApronLevel;
  capSpaceCents: bigint;
  /**
   * Cumulative first-year salary this team has already committed via the
   * (simplified, single) Signing Exception this season - see
   * `getSigningExceptionUsage`. Checked against the *remaining* exception
   * room, not the exception's full per-season ceiling, so a team can't
   * re-use the same exception dollars on multiple players.
   */
  signingExceptionUsedCents?: bigint;
}

export interface ReSigningRights {
  /** True when this team currently holds the player's simplified Re-Signing Rights. */
  held: boolean;
  /** The ceiling a team can offer via Re-Signing Rights, regardless of cap space - see computeReSigningMaxOfferCents. */
  maxOfferCents: bigint;
}

export interface ValidateSigningInput {
  season: number;
  offerSalaryCents: bigint;
  /**
   * The player's years of service, which set his minimum - the scale runs
   * about 3x from a rookie to a ten-year veteran. Omitted falls back to the
   * rookie minimum, the lowest rung, so an unknown player is never blocked by
   * a floor that is too high.
   */
  yearsOfExperience?: number;
  team: SigningTeamCapState;
  reSigningRights?: ReSigningRights;
}

export type SigningMechanism =
  "CAP_SPACE" | "NON_TAXPAYER_MLE" | "TAXPAYER_MLE" | "VETERAN_MINIMUM" | "RE_SIGNING_RIGHTS";

export interface SigningValidationResult {
  isValid: boolean;
  mechanism: SigningMechanism | null;
  maxAllowedCents: bigint;
  violation: string | null;
}

/**
 * Checks whether a team can sign a free agent at a given first-year salary,
 * using a simplified model of real signing mechanisms: cap space (teams
 * under the cap), Re-Signing Rights (a casual stand-in for Bird/Early-Bird
 * rights - lets a player's own team exceed the cap up to a bounded "fair
 * market value" ceiling, regardless of apron status), the non-taxpayer/
 * taxpayer mid-level exception (over the cap, gated by apron level via
 * `eligibleMidLevelException`), or a veteran-minimum deal (always legal,
 * regardless of apron status - the one exception the CBA never
 * restricts).
 */
export function validateSigning(input: ValidateSigningInput): SigningValidationResult {
  const rules = getSeasonCapRules(input.season);
  const { team, offerSalaryCents } = input;

  // A minimum-salary deal is always legal regardless of apron - the one
  // exception the CBA never restricts. The figure is this player's own
  // service-year minimum, not the empty-roster cap hold that used to stand in
  // for it (docs/audits/CONTRACT_AUDIT.md C-P2-1).
  const minimumCents = veteranMinimumCents(input.season, input.yearsOfExperience ?? 0);
  if (offerSalaryCents <= minimumCents) {
    return {
      isValid: true,
      mechanism: "VETERAN_MINIMUM",
      maxAllowedCents: minimumCents,
      violation: null,
    };
  }

  if (input.reSigningRights?.held && offerSalaryCents <= input.reSigningRights.maxOfferCents) {
    return {
      isValid: true,
      mechanism: "RE_SIGNING_RIGHTS",
      maxAllowedCents: input.reSigningRights.maxOfferCents,
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
  const mleTotalCents =
    mleType === "NON_TAXPAYER"
      ? rules.nonTaxpayerMLECents
      : mleType === "TAXPAYER"
        ? rules.taxpayerMLECents
        : 0n;
  const alreadyUsedCents = input.team.signingExceptionUsedCents ?? 0n;
  const mleRemainingCents =
    mleTotalCents > alreadyUsedCents ? mleTotalCents - alreadyUsedCents : 0n;

  if (mleRemainingCents > 0n && offerSalaryCents <= mleRemainingCents) {
    return {
      isValid: true,
      mechanism: mleType === "NON_TAXPAYER" ? "NON_TAXPAYER_MLE" : "TAXPAYER_MLE",
      maxAllowedCents: mleRemainingCents,
      violation: null,
    };
  }

  return {
    isValid: false,
    mechanism: null,
    maxAllowedCents: mleRemainingCents,
    violation: mleType
      ? `Team's ${mleType.toLowerCase().replace("_", "-")} mid-level exception has ${mleRemainingCents} cents remaining this season.`
      : "Second-apron teams are hard-capped out of every mid-level exception - only a minimum-salary deal is possible.",
  };
}
