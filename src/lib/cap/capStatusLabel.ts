import { ApronLevel } from "./apron";

/**
 * Casual-facing collapse of the 5 real apron levels into the 3 states a
 * user actually needs to reason about (per the "realistic consequences
 * without complicated rules" design goal - see docs/ARCHITECTURE.md).
 * The real `ApronLevel` distinctions (taxpayer/first apron/second apron)
 * keep driving actual trade/exception behavior underneath; this is only
 * what gets displayed.
 */
export type SimpleCapStatus = "UNDER_CAP" | "OVER_CAP" | "LUXURY_TAX";

export const CAP_STATUS_LABEL: Record<SimpleCapStatus, string> = {
  UNDER_CAP: "Under the Cap",
  OVER_CAP: "Over the Cap",
  LUXURY_TAX: "Luxury Tax",
};

export const CAP_STATUS_DESCRIPTION: Record<SimpleCapStatus, string> = {
  UNDER_CAP: "You have cap space and can freely sign available free agents.",
  OVER_CAP:
    "You can't freely sign expensive outside free agents, but you can still improve your roster through trades, re-signing your own players, a Signing Exception, and minimum contracts.",
  LUXURY_TAX:
    "Your payroll has reached a very high level - ownership will expect this team's performance to justify that investment.",
};

export function simplifyCapStatus(level: ApronLevel): SimpleCapStatus {
  if (level === ApronLevel.UNDER_CAP) return "UNDER_CAP";
  if (level === ApronLevel.BETWEEN_CAP_AND_TAX) return "OVER_CAP";
  return "LUXURY_TAX"; // TAXPAYER | FIRST_APRON | SECOND_APRON
}
