import { formatFinanceCents } from "./formatFinance";

/**
 * Franchise Finances (Phase D) - the owner-dynamics layer that makes money
 * matter at BOTH ends of the spectrum, reusing the existing owner-confidence /
 * directive machinery rather than a second ownership system.
 *
 * The core idea (confirmed with the user): a franchise's multi-season
 * financial track record becomes the currency of owner *trust*, and trust buys
 * basketball *runway* - not cap space. A financially strong franchise earns a
 * patient owner who backs spending deep into the luxury tax to win; sustained
 * losses earn escalating pressure that can genuinely threaten the GM's job.
 * Cap/CBA rules stay fully authoritative - nothing here changes what a team is
 * allowed to spend, only how the owner *reacts* to it.
 */

const M = 1_000_000 * 100; // one million dollars, in cents

export type FinancialStanding = "STRONG" | "SOLID" | "STABLE" | "STRAINED" | "DISTRESSED";

export const FINANCIAL_STANDING_LABEL: Record<FinancialStanding, string> = {
  STRONG: "Strong",
  SOLID: "Solid",
  STABLE: "Stable",
  STRAINED: "Strained",
  DISTRESSED: "Distressed",
};

export const FINANCIAL_STANDING_DESCRIPTION: Record<FinancialStanding, string> = {
  STRONG:
    "Ownership is delighted with the franchise's finances and will back spending deep into the luxury tax to win.",
  SOLID:
    "The franchise is a healthy, well-run business; ownership is comfortable opening the checkbook.",
  STABLE:
    "The books are balanced. Ownership has no financial concerns, but no war chest to lean on either.",
  STRAINED: "The franchise is losing money, and ownership is watching the bottom line closely.",
  DISTRESSED:
    "Sustained losses have ownership alarmed - the franchise needs to return to profitability, soon.",
};

/**
 * Reduces a multi-season net-income track record + current cash into an
 * owner-facing standing. Deliberately keyed off the profit trend and the cash
 * cushion (both already tracked in FinancialSnapshot / LeagueTeam) - no new
 * persisted score. `recentNetIncomeCents` is most-recent-first and should
 * include the season just completed; `cashReserveCents` is the post-season
 * cash.
 */
// Finances as a Gameplay Pillar (Phase 5) - System 3, "Financing." High
// leverage caps how good a franchise's standing can read, even with
// healthy income/cash - real debt, real patience cost. Optional/defaults
// to 0 so every existing caller and test keeps working unchanged.
const HIGH_DEBT_THRESHOLD_CENTS = 80 * M;
const STANDING_DOWNGRADE: Record<FinancialStanding, FinancialStanding> = {
  STRONG: "SOLID",
  SOLID: "STABLE",
  STABLE: "STABLE",
  STRAINED: "STRAINED",
  DISTRESSED: "DISTRESSED",
};

export function computeFinancialStanding(
  recentNetIncomeCents: number[],
  cashReserveCents: number,
  debtCents = 0,
): FinancialStanding {
  const recent = recentNetIncomeCents.slice(0, 3);
  const sum = recent.reduce((a, b) => a + b, 0);
  const losses = recent.filter((n) => n < 0).length;
  const current = recent[0] ?? 0;

  let standing: FinancialStanding;
  if (cashReserveCents < 0 || (losses >= 2 && sum < -60 * M)) standing = "DISTRESSED";
  else if (current < -20 * M) standing = "STRAINED";
  else if (sum > 150 * M && cashReserveCents > 120 * M) standing = "STRONG";
  else if (sum > 40 * M) standing = "SOLID";
  else standing = "STABLE";

  return debtCents > HIGH_DEBT_THRESHOLD_CENTS ? STANDING_DOWNGRADE[standing] : standing;
}

/**
 * Multiplier applied to a *negative* owner-confidence swing: a trusted, well-
 * financed steward gets patience in a down year; a franchise bleeding money
 * gets the opposite. Never touches a positive swing (a good season is a good
 * season regardless of the books).
 */
export function financialStandingPatienceFactor(standing: FinancialStanding): number {
  switch (standing) {
    case "STRONG":
      return 0.5;
    case "SOLID":
      return 0.75;
    case "STABLE":
      return 1.0;
    case "STRAINED":
      return 1.15;
    case "DISTRESSED":
      return 1.35;
  }
}

/**
 * A small standing-based confidence nudge applied every season boundary, so
 * sustained financial success is an ongoing source of owner goodwill and
 * sustained waste an ongoing drain - the "money bites at both ends" property.
 */
export function financialStandingConfidenceBonus(standing: FinancialStanding): number {
  switch (standing) {
    case "STRONG":
      return 2;
    case "SOLID":
      return 1;
    case "STABLE":
      return 0;
    case "STRAINED":
      return -1;
    case "DISTRESSED":
      return -3;
  }
}

/** The emergent tax tolerance: a financially strong owner won't nag a
 *  profitable franchise to cut payroll, no matter how deep into the tax it is.
 *  This is what a winning team's accumulated cash actually "buys" - runway to
 *  keep an expensive contender together with ownership's blessing. */
export function ownerBacksTaxSpending(standing: FinancialStanding): boolean {
  return standing === "STRONG" || standing === "SOLID";
}

/** Sustained losses (DISTRESSED standing) trigger the escalating "return to
 *  profitability" mandate. */
export function shouldIssueFinancialMandate(standing: FinancialStanding): boolean {
  return standing === "DISTRESSED";
}

/** How many seasons ownership gives the GM to balance the books. */
export const FINANCIAL_MANDATE_DEADLINE_YEARS = 2;

// Confidence swings for the mandate lifecycle (in owner-confidence points).
export const FINANCIAL_MANDATE_ISSUE_PENALTY = -4;
export const FINANCIAL_MANDATE_MET_REWARD = 6;
export const FINANCIAL_MANDATE_IGNORED_PENALTY = -18;

// ---------------------------------------------------------------------------
// Ownership message builders (delivered via the existing OWNERSHIP_MESSAGE
// LeagueTransaction feed, same as src/lib/gm/ownershipMessages.ts).
// ---------------------------------------------------------------------------

export function describeFinancialStandingMessage(standing: FinancialStanding): string | null {
  // Only the two ends are worth a season-boundary note; the middle is quiet.
  if (standing === "STRONG") {
    return "Ownership is thrilled with the franchise's financial health and has made clear it will support spending into the luxury tax to chase a title.";
  }
  if (standing === "DISTRESSED") {
    return "Ownership is alarmed by the franchise's mounting losses and expects the finances turned around.";
  }
  return null;
}

export function describeFinancialMandate(deadlineSeason: number): string {
  return `Ownership has issued a financial mandate: return the franchise to profitability by the ${deadlineSeason}-${(deadlineSeason + 1).toString().slice(-2)} season, or the front office's future is in doubt.`;
}

export function describeFinancialMandateResolution(met: boolean, cashReserveCents: number): string {
  return met
    ? `Ownership is relieved - the franchise is back in the black (${formatFinanceCents(cashReserveCents)} in reserve). The financial mandate has been lifted.`
    : "Ownership is furious that the franchise is still losing money after its mandate. The GM's seat is now very hot.";
}
