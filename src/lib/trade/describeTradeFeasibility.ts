import { isUnderCapSpace, maxIncomingSalaryCents } from "./salaryMatching";
import { getSeasonCapRules } from "../cap/constants";
import { formatCentsCompact } from "../money";
import type { ApronLevel } from "../cap/apron";
import type { TradeValidationResult } from "./validateTrade";

export interface TeamTradeFinancials {
  teamLabel: string;
  apronLevel: ApronLevel;
  capSpaceCents: bigint;
  outgoingSalaryCents: bigint;
  incomingSalaryCents: bigint;
}

export interface TradeFeasibilitySummary {
  isValid: boolean;
  /** "Trade Financial Check: Valid" / "Trade Financial Check: Invalid" */
  headline: string;
  /** The plain-English explanation - null only when there's nothing to explain. */
  detail: string | null;
}

const STRUCTURAL_VIOLATION_MESSAGES: Record<string, string> = {
  NO_TRADE_CLAUSE: "One of these players has a no-trade clause and hasn't agreed to this deal.",
  STEPIEN_RULE:
    "This would leave a team without a first-round pick in back-to-back future years, which isn't allowed.",
  NO_AGGREGATION_AT_SECOND_APRON:
    "One of these teams is too far over the cap to combine multiple players into one trade - it has to match salaries one-for-one instead.",
  MISSING_TEAM_CAP_STATE: "Something's missing to evaluate this trade - try again.",
  INVALID_STRUCTURE: "A trade needs at least two teams and some assets changing hands.",
};

/**
 * Translates `validateTrade`'s real CBA-accurate output (salary-matching
 * bands, apron rules, no-aggregation, Stepien rule) into the plain-English
 * summary a casual user sees - "you need to send out about $8M more," not
 * a rule name and a raw cents comparison. The underlying validator stays
 * the single source of truth for whether a trade is actually legal; this
 * only re-derives the same public salary-matching formulas to phrase *why*.
 */
export function describeTradeFeasibility(
  validation: TradeValidationResult,
  teams: TeamTradeFinancials[],
  season: number,
): TradeFeasibilitySummary {
  if (validation.isValid) {
    return {
      isValid: true,
      headline: "Trade Financial Check: Valid",
      detail: "This trade works financially.",
    };
  }

  const rules = getSeasonCapRules(season);

  // A concrete salary-matching shortfall is the most common and most
  // actionable case - prefer explaining that over rarer structural
  // violations (no-trade clause, Stepien rule) when both are present.
  const overTeam = teams.find((t) => {
    if (t.incomingSalaryCents === 0n) return false;
    if (isUnderCapSpace(t.apronLevel)) {
      return t.incomingSalaryCents > t.capSpaceCents + t.outgoingSalaryCents;
    }
    const maxIncoming = maxIncomingSalaryCents(t.outgoingSalaryCents, t.apronLevel, rules);
    return t.incomingSalaryCents > maxIncoming;
  });

  if (overTeam) {
    const allowedIncomingCents = isUnderCapSpace(overTeam.apronLevel)
      ? overTeam.capSpaceCents + overTeam.outgoingSalaryCents
      : maxIncomingSalaryCents(overTeam.outgoingSalaryCents, overTeam.apronLevel, rules);
    const shortfallCents = overTeam.incomingSalaryCents - allowedIncomingCents;
    return {
      isValid: false,
      headline: "Trade Financial Check: Invalid",
      detail: `You're taking on too much additional salary. ${overTeam.teamLabel} needs to send out approximately ${formatCentsCompact(shortfallCents)} more in salary for this trade to work.`,
    };
  }

  const violation = validation.violations[0];
  return {
    isValid: false,
    headline: "Trade Financial Check: Invalid",
    detail: violation ? (STRUCTURAL_VIOLATION_MESSAGES[violation.rule] ?? violation.message) : null,
  };
}
