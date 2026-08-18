/**
 * Finances as a Gameplay Pillar, System 3 - "Financing, Debt &
 * the Owner's Wallet." Structure for the previously-inert cash balance:
 * three ways to get money you don't have, each with a different price.
 * Debt is a single revolving balance (LeagueTeam.debtCents) - interest-
 * only, no forced amortization schedule; the user can voluntarily repay
 * principal any time (a deliberate simplification over a real installment
 * schedule, documented rather than silently assumed).
 */

const DOLLARS = 100;
const M = 1_000_000 * DOLLARS;

export type LoanTier = "SMALL" | "MEDIUM" | "LARGE";

export const LOAN_TIER_LABEL: Record<LoanTier, string> = {
  SMALL: "Small loan",
  MEDIUM: "Medium loan",
  LARGE: "Large loan",
};

const LOAN_AMOUNT_CENTS: Record<LoanTier, number> = {
  SMALL: 15 * M,
  MEDIUM: 40 * M,
  LARGE: 90 * M,
};

export function loanAmountCents(tier: LoanTier): number {
  return LOAN_AMOUNT_CENTS[tier];
}

/** Flat annual rate on the whole outstanding debt balance - charged as a new expense bucket at every season boundary. */
export const DEBT_ANNUAL_INTEREST_RATE = 0.08;

export function computeAnnualInterestCents(debtCents: number): number {
  return Math.round(Math.max(0, debtCents) * DEBT_ANNUAL_INTEREST_RATE);
}

export type CapitalCallTier = "SMALL" | "MEDIUM" | "LARGE";

export const CAPITAL_CALL_TIER_LABEL: Record<CapitalCallTier, string> = {
  SMALL: "Ask for a modest cheque",
  MEDIUM: "Ask for real money",
  LARGE: "Ask for a lot",
};

// The cleanest trade-off in the design: free money, priced entirely in
// confidence. Scales up together - bigger asks cost proportionally more
// trust, not just more absolute cash.
const CAPITAL_CALL_AMOUNT_CENTS: Record<CapitalCallTier, number> = {
  SMALL: 10 * M,
  MEDIUM: 30 * M,
  LARGE: 70 * M,
};
const CAPITAL_CALL_CONFIDENCE_COST: Record<CapitalCallTier, number> = {
  SMALL: 3,
  MEDIUM: 8,
  LARGE: 16,
};

export function capitalCallAmountCents(tier: CapitalCallTier): number {
  return CAPITAL_CALL_AMOUNT_CENTS[tier];
}

export function capitalCallConfidenceCost(tier: CapitalCallTier): number {
  return CAPITAL_CALL_CONFIDENCE_COST[tier];
}

// Distressed financing - terms bad enough that taking it is an admission.
// Modeled as a smaller draw added to the same debtCents pool (so it accrues
// the same flat interest rate - no separate blended-rate tracking), priced
// instead through an immediate, real reputational cost.
const DISTRESSED_FINANCING_AMOUNT_CENTS = 25 * M;
export const DISTRESSED_FINANCING_CONFIDENCE_COST = 8;
export const DISTRESSED_FINANCING_FAN_HAPPINESS_COST = 5;

export function distressedFinancingAmountCents(): number {
  return DISTRESSED_FINANCING_AMOUNT_CENTS;
}

/** Distressed financing is only available when the books are genuinely bad - never a routine shortcut. */
export function isDistressedFinancingEligible(cashReserveCents: number): boolean {
  return cashReserveCents < -20 * M;
}
