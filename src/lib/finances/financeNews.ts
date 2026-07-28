import type { FinancialHealth } from "./finances";
import { FINANCIAL_HEALTH_LABEL } from "./finances";
import { formatFinanceCents } from "./formatFinance";

/**
 * Plain-English news builders for Franchise Finances, same pattern as
 * src/lib/gm/ownershipMessages.ts - one sentence, derived straight from the
 * computed P&L, never inventing drama beyond what the numbers say. Delivered
 * through the existing LeagueTransaction feed (FINANCIAL_REPORT /
 * FRANCHISE_MILESTONE types), not a separate messaging system.
 */

export function describeSeasonFinancialReport(args: {
  teamLabel: string;
  netIncomeCents: number;
  health: FinancialHealth;
}): string {
  const { teamLabel, netIncomeCents, health } = args;
  const resultPhrase =
    netIncomeCents >= 0
      ? `a profit of ${formatFinanceCents(netIncomeCents)}`
      : `a loss of ${formatFinanceCents(Math.abs(netIncomeCents))}`;
  return `${teamLabel} closed the books on the season with ${resultPhrase} - financial health: ${FINANCIAL_HEALTH_LABEL[health]}.`;
}

export function describeFranchiseValueMilestone(args: {
  teamLabel: string;
  valueCents: number;
  direction: "up" | "down";
}): string {
  const { teamLabel, valueCents, direction } = args;
  return direction === "up"
    ? `${teamLabel} are now valued at ${formatFinanceCents(valueCents)}, a new franchise high.`
    : `${teamLabel}'s franchise value has slipped to ${formatFinanceCents(valueCents)}.`;
}

export function describeIconDeparture(playerName: string, teamLabel: string): string {
  return `The end of an era in ${teamLabel}: parting with franchise icon ${playerName} deals a real blow to the franchise's value and fan base, well beyond the box score.`;
}
