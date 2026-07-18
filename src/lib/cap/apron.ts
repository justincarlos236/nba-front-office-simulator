import type { SeasonCapRules } from "./constants";

export enum ApronLevel {
  UNDER_CAP = "UNDER_CAP",
  BETWEEN_CAP_AND_TAX = "BETWEEN_CAP_AND_TAX",
  TAXPAYER = "TAXPAYER",
  FIRST_APRON = "FIRST_APRON",
  SECOND_APRON = "SECOND_APRON",
}

/** Determines a team's apron standing from its total salary for the season. */
export function getApronLevel(totalSalaryCents: bigint, rules: SeasonCapRules): ApronLevel {
  if (totalSalaryCents >= rules.secondApronCents) return ApronLevel.SECOND_APRON;
  if (totalSalaryCents >= rules.firstApronCents) return ApronLevel.FIRST_APRON;
  if (totalSalaryCents >= rules.luxuryTaxCents) return ApronLevel.TAXPAYER;
  if (totalSalaryCents >= rules.salaryCapCents) return ApronLevel.BETWEEN_CAP_AND_TAX;
  return ApronLevel.UNDER_CAP;
}

/** Which mid-level exception (if any) a team at this apron level is eligible to use. */
export function eligibleMidLevelException(
  level: ApronLevel,
): "ROOM" | "NON_TAXPAYER" | "TAXPAYER" | null {
  switch (level) {
    case ApronLevel.UNDER_CAP:
      return "ROOM";
    case ApronLevel.BETWEEN_CAP_AND_TAX:
    case ApronLevel.TAXPAYER:
      return "NON_TAXPAYER";
    case ApronLevel.FIRST_APRON:
      return "TAXPAYER";
    case ApronLevel.SECOND_APRON:
      // Second-apron teams are hard-capped out of every mid-level exception.
      return null;
  }
}

/** Second-apron teams may not use the bi-annual exception at all. */
export function canUseBiAnnualException(level: ApronLevel): boolean {
  return level !== ApronLevel.SECOND_APRON;
}
