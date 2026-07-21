import { ApronLevel } from "../cap/apron";

/**
 * A 4-tier collapse of the 5 real apron levels, matching the design
 * brief's framing for ownership expectations ("relatively inexpensive" /
 * "moderately expensive" / "significant luxury tax" / "extremely
 * expensive") - a coarser cut than `simplifyCapStatus`'s 3 states,
 * since expectation-setting needs to distinguish "paying some tax" from
 * "hard-capped at the second apron."
 */
export type PayrollTier = "MODEST" | "MODERATE" | "SIGNIFICANT" | "EXTREME";

export const PAYROLL_TIER_LABEL: Record<PayrollTier, string> = {
  MODEST: "Modest payroll",
  MODERATE: "Moderate payroll",
  SIGNIFICANT: "Significant luxury tax",
  EXTREME: "Extreme payroll",
};

export function computePayrollTier(apronLevel: ApronLevel): PayrollTier {
  switch (apronLevel) {
    case ApronLevel.UNDER_CAP:
      return "MODEST";
    case ApronLevel.BETWEEN_CAP_AND_TAX:
      return "MODERATE";
    case ApronLevel.TAXPAYER:
      return "SIGNIFICANT";
    case ApronLevel.FIRST_APRON:
    case ApronLevel.SECOND_APRON:
      return "EXTREME";
  }
}
