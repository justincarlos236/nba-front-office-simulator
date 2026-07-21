import { ApronLevel } from "./apron";
import { getSeasonCapRules } from "./constants";
import type { SeasonProjection } from "./multiYearProjection";

export type FinancialFlexibilityLetter = "A" | "B" | "C" | "D" | "F";

export interface RosterContractForGrading {
  /** This season's salary for this contract. */
  currentSalaryCents: bigint;
  /** Seasons remaining on this deal, including the current one. */
  yearsRemaining: number;
}

export interface FinancialFlexibilityResult {
  score: number; // 0-100, higher = more flexible
  grade: FinancialFlexibilityLetter;
  summary: string;
}

const APRON_PENALTY: Record<ApronLevel, number> = {
  [ApronLevel.UNDER_CAP]: 0,
  [ApronLevel.BETWEEN_CAP_AND_TAX]: 8,
  [ApronLevel.TAXPAYER]: 16,
  [ApronLevel.FIRST_APRON]: 26,
  [ApronLevel.SECOND_APRON]: 38,
};

// A contract this far into its term, still commanding a real chunk of the
// cap, is the "albatross" scenario the design brief calls out - locked-in
// money with no near-term way out. Flagged per-contract rather than folded
// into the season totals above, since a single bad long-term deal matters
// even on an otherwise well-managed roster.
const LONG_TERM_YEARS_THRESHOLD = 3;
const LONG_TERM_SALARY_FRACTION_THRESHOLD = 0.15;
const LONG_TERM_CONTRACT_PENALTY = 6;
const MAX_LONG_TERM_PENALTY = 18;

const GRADE_SUMMARY: Record<FinancialFlexibilityLetter, string> = {
  A: "Excellent flexibility - your books are clean for years to come.",
  B: "Good flexibility - your future commitments are manageable.",
  C: "Average flexibility - a few future seasons are already getting tight.",
  D: "Limited flexibility - heavy future commitments will restrict your moves.",
  F: "Very limited flexibility - your books are locked up for years.",
};

/**
 * Summarizes current payroll, future committed salary, large long-term
 * contracts, and available cap space into a single A-F grade - the same
 * "realistic consequences without complicated rules" philosophy as the
 * rest of the simplified financial layer: a casual user reads one letter
 * instead of reasoning through several seasons of cap sheets themselves.
 */
export function computeFinancialFlexibilityGrade(
  currentApronLevel: ApronLevel,
  futureProjections: SeasonProjection[],
  contracts: RosterContractForGrading[],
  currentSeasonCapCents: bigint,
): FinancialFlexibilityResult {
  let score = 100;

  score -= APRON_PENALTY[currentApronLevel];

  for (const projection of futureProjections) {
    const rules = getSeasonCapRules(projection.season);
    const fraction = Number(projection.committedSalaryCents) / Number(rules.salaryCapCents);
    // Being heavily committed far in advance costs points for every future
    // season it's still true, not just once.
    score -= Math.max(0, fraction - 0.4) * 20;
  }

  let longTermPenalty = 0;
  for (const contract of contracts) {
    const fraction = Number(contract.currentSalaryCents) / Number(currentSeasonCapCents);
    if (
      contract.yearsRemaining >= LONG_TERM_YEARS_THRESHOLD &&
      fraction >= LONG_TERM_SALARY_FRACTION_THRESHOLD
    ) {
      longTermPenalty += LONG_TERM_CONTRACT_PENALTY;
    }
  }
  score -= Math.min(MAX_LONG_TERM_PENALTY, longTermPenalty);

  score = Math.max(0, Math.min(100, Math.round(score)));

  const grade: FinancialFlexibilityLetter =
    score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  return { score, grade, summary: GRADE_SUMMARY[grade] };
}
