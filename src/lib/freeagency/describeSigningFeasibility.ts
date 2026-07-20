import { formatCentsCompact } from "../money";
import type { SigningValidationResult } from "./validateSigning";

/**
 * Collapses the real signing mechanisms (cap space, non-taxpayer MLE,
 * taxpayer MLE, veteran minimum) into the 3 casual-facing concepts from
 * the design brief - both MLE variants become one "Signing Exception,"
 * since a casual user doesn't need to know which flavor of mid-level
 * exception their team happens to qualify for.
 */
const MECHANISM_LABEL: Record<string, string> = {
  CAP_SPACE: "Cap Space",
  NON_TAXPAYER_MLE: "Signing Exception",
  TAXPAYER_MLE: "Signing Exception",
  VETERAN_MINIMUM: "Minimum Contract",
};

export interface SigningFeasibilitySummary {
  isValid: boolean;
  headline: string;
}

export function describeSigningFeasibility(
  result: SigningValidationResult,
): SigningFeasibilitySummary {
  if (result.isValid) {
    const label = result.mechanism
      ? (MECHANISM_LABEL[result.mechanism] ?? "Cap Space")
      : "Cap Space";
    return {
      isValid: true,
      headline: `Legal via ${label} (${formatCentsCompact(result.maxAllowedCents)} available)`,
    };
  }
  return {
    isValid: false,
    headline: "Your team doesn't have enough Cap Space or Signing Exception room for this offer.",
  };
}
