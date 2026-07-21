import { formatCentsCompact } from "../money";
import { EXPECTATION_LEVEL_LABEL, type ExpectationLevel } from "./expectationLevel";
import type { EvaluationVerdict } from "./seasonEvaluation";
import type { PayrollTier } from "./payrollTier";

/**
 * Plain-English ownership commentary, written into the same
 * `LeagueTransaction` feed as trades/signings (type `OWNERSHIP_MESSAGE`) -
 * the design brief's "make ownership feel like an active part of the
 * simulation rather than just a passive rating." Pure string builders,
 * same pattern as `src/lib/transactions/describeTransaction.ts`.
 */

const HEAVY_SPEND_TIERS: PayrollTier[] = ["SIGNIFICANT", "EXTREME"];

export function describeSeasonEvaluation(
  verdict: EvaluationVerdict,
  expectationLevel: ExpectationLevel,
  actualResultLabel: string,
  payrollTier: PayrollTier,
): string {
  const expectationText = EXPECTATION_LEVEL_LABEL[expectationLevel].toLowerCase();
  const heavySpend = HEAVY_SPEND_TIERS.includes(payrollTier);

  switch (verdict) {
    case "EXCEEDED":
      return heavySpend
        ? `Ownership is thrilled. We made a real financial commitment to this roster, expected the team to ${expectationText}, and you delivered more than that: ${actualResultLabel.toLowerCase()}. This is exactly what that investment was for.`
        : `Ownership is pleased. ${actualResultLabel} - better than the ${expectationText} we were hoping for this season.`;
    case "MET":
      return `Ownership is satisfied. We expected this team to ${expectationText}, and that's what happened: ${actualResultLabel.toLowerCase()}.`;
    case "FELL_SHORT":
      return heavySpend
        ? `Ownership is disappointed. Given the money committed to this roster, we expected the team to ${expectationText}. ${actualResultLabel} falls short of that.`
        : `Ownership expected this team to ${expectationText} this season. ${actualResultLabel} came up a bit short of that.`;
    case "DRASTICALLY_FELL_SHORT":
      return heavySpend
        ? `We made a significant financial investment in this roster and expected the team to ${expectationText}. ${actualResultLabel} is unacceptable.`
        : `Ownership expected this team to ${expectationText} this season. ${actualResultLabel} is a real disappointment.`;
  }
}

export function describeNewExpectation(expectationLevel: ExpectationLevel): string {
  return `Ownership's expectation for this season: ${EXPECTATION_LEVEL_LABEL[expectationLevel].toLowerCase()}.`;
}

export function describePayrollDirective(targetCents: bigint, deadlineSeason: number): string {
  return `Ownership has issued a directive: reduce team payroll below ${formatCentsCompact(targetCents)} before the start of the ${deadlineSeason}-${(deadlineSeason + 1).toString().slice(-2)} season.`;
}

export function describeDirectiveCompliance(complied: boolean): string {
  return complied
    ? "Ownership's payroll directive was met - they're pleased you took their concerns seriously."
    : "Ownership's payroll directive was ignored. Their confidence in your judgment has taken a real hit.";
}
