import type { MarketSize, TicketPricingPosture } from "@/generated/prisma/client";
import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";

/**
 * Franchise Finances & Business Operations - the pure, Prisma-free money
 * model. Built as a *consumer* of signals other systems already produce
 * (attendance/popularity from src/lib/fans, star power from
 * getPlayerValueTier, market size from the Team fixture, payroll from the
 * cap engine, playoff depth from PlayoffSeries) rather than a second
 * simulation. Deliberately coarse - a handful of revenue/expense buckets,
 * not a general ledger (see docs/SYSTEMS.md's Franchise finances §).
 *
 * All amounts are in **cents, as plain numbers**. A full NBA franchise
 * season tops out around $500M = 5e10 cents, comfortably inside JS's safe
 * integer range (~9e15); the offseason pass converts to/from BigInt only
 * at the Prisma boundary, keeping this module trivial to unit-test.
 *
 * Cap/CBA rules stay authoritative everywhere - nothing here ever grants
 * cap space or unlocks a roster move. Money is pressure and consequence,
 * never a cap bypass.
 */

const DOLLARS = 100; // cents per dollar
const M = 1_000_000 * DOLLARS; // one million dollars, in cents

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

/** Full-season gate revenue at 100% attendance, before market/posture. */
const MARKET_GATE_BASELINE: Record<MarketSize, number> = {
  LARGE: 150 * M,
  MID: 110 * M,
  SMALL: 85 * M,
};

/** Local + national media/sponsorship baseline by market. */
const MARKET_MEDIA_BASELINE: Record<MarketSize, number> = {
  LARGE: 165 * M,
  MID: 120 * M,
  SMALL: 95 * M,
};

/** Flat league-wide distribution (national TV / revenue sharing) - the floor
 *  that keeps even a struggling small-market team operational, per the
 *  design guardrail. Small markets get a modest sharing boost, mirroring how
 *  real NBA revenue sharing is net-positive for them. */
const LEAGUE_REVENUE_BASE = 90 * M;
const SMALL_MARKET_REVENUE_SHARING_BOOST = 12 * M;

/** Gate per home playoff game, by market. Deep runs (more home games) pay. */
const PLAYOFF_GATE_PER_HOME_GAME: Record<MarketSize, number> = {
  LARGE: 6 * M,
  MID: 4 * M,
  SMALL: 3 * M,
};
const CHAMPIONSHIP_BONUS = 12 * M;

/** Ticket-pricing posture: gate revenue multiplier (Phase B lever; STANDARD
 *  is the neutral Phase-A default). PREMIUM earns more now; FAN_FRIENDLY
 *  earns less. The fan-happiness side of the tradeoff lives in
 *  TICKET_POSTURE_FAN_DELTA below. */
const TICKET_POSTURE_REVENUE_MULTIPLIER: Record<TicketPricingPosture, number> = {
  FAN_FRIENDLY: 0.9,
  STANDARD: 1.0,
  PREMIUM: 1.12,
};

/** Small explicit sponsorship bump for genuine star power, on top of the
 *  popularity factor (a superstar drives national jersey/TV beyond raw
 *  popularity). Kept small to avoid double-counting popularity, which
 *  already folds in star power. */
const STAR_SPONSORSHIP_BONUS: Record<PlayerValueTier, number> = {
  SUPERSTAR: 0.06,
  STAR: 0.03,
  STARTER: 0,
  ROTATION: 0,
  MINIMUM: 0,
};

export interface SeasonRevenueInputs {
  marketSize: MarketSize;
  /** 0-1 fraction from computeAttendancePct - consumed, never re-derived. */
  attendancePct: number;
  /** 0-100 from computeFranchisePopularity. */
  franchisePopularity: number;
  starTier: PlayerValueTier | null;
  ticketPosture: TicketPricingPosture;
  /** Home games played this postseason (regular playoffs + play-in). */
  playoffHomeGames: number;
  wonChampionship: boolean;
  /** Finances as a Gameplay Pillar (Phase 1) - the season's resolved
   *  BusinessDecision/business-event income, summed from
   *  BusinessLedgerEntry. Optional/defaults to 0 so every existing caller
   *  and test keeps working unchanged. */
  otherIncomeCents?: number;
  /** Finances as a Gameplay Pillar (Phase 2) - this season's active
   *  SponsorshipDeal income: real signed deals for the user, a formula
   *  baseline for CPU teams (see src/lib/finances/sponsorship.ts).
   *  Optional/defaults to 0, same reasoning as otherIncomeCents. */
  sponsorshipCents?: number;
}

export interface SeasonRevenue {
  ticketCents: number;
  mediaCents: number;
  playoffCents: number;
  leagueCents: number;
  otherIncomeCents: number;
  sponsorshipCents: number;
  totalCents: number;
}

export function computeSeasonRevenue(inputs: SeasonRevenueInputs): SeasonRevenue {
  const ticketCents = Math.round(
    MARKET_GATE_BASELINE[inputs.marketSize] *
      inputs.attendancePct *
      TICKET_POSTURE_REVENUE_MULTIPLIER[inputs.ticketPosture],
  );

  const popularityFactor = 0.85 + (inputs.franchisePopularity / 100) * 0.35;
  const starBonus = inputs.starTier ? STAR_SPONSORSHIP_BONUS[inputs.starTier] : 0;
  const mediaCents = Math.round(
    MARKET_MEDIA_BASELINE[inputs.marketSize] * popularityFactor * (1 + starBonus),
  );

  const playoffCents =
    inputs.playoffHomeGames * PLAYOFF_GATE_PER_HOME_GAME[inputs.marketSize] +
    (inputs.wonChampionship ? CHAMPIONSHIP_BONUS : 0);

  const leagueCents =
    LEAGUE_REVENUE_BASE + (inputs.marketSize === "SMALL" ? SMALL_MARKET_REVENUE_SHARING_BOOST : 0);

  const otherIncomeCents = inputs.otherIncomeCents ?? 0;
  const sponsorshipCents = inputs.sponsorshipCents ?? 0;

  return {
    ticketCents,
    mediaCents,
    playoffCents,
    leagueCents,
    otherIncomeCents,
    sponsorshipCents,
    totalCents:
      ticketCents + mediaCents + playoffCents + leagueCents + otherIncomeCents + sponsorshipCents,
  };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** Flat market-scaled operating overhead (arena ops, travel, front office) -
 *  the abstracted "everything that isn't payroll/staff/investment" bucket. */
const MARKET_OPERATING_BASELINE: Record<MarketSize, number> = {
  LARGE: 70 * M,
  MID: 58 * M,
  SMALL: 50 * M,
};

/** Simplified luxury-tax multiplier on every dollar over the tax line. The
 *  real tax is graduated 1.5x-4.75x with repeater penalties; a single
 *  coarse multiplier keeps this "interesting decision, not accounting." */
const LUXURY_TAX_MULTIPLIER = 1.5;

export interface SeasonExpenseInputs {
  marketSize: MarketSize;
  /** Committed player salary for the completed season (cap-sheet total). */
  payrollCents: number;
  /** The season's luxury-tax line (rules.luxuryTaxCents) - passed in to keep
   *  this module decoupled from the cap-rules table. */
  luxuryTaxLineCents: number;
  /** Sum of this team's staff contract salaries. */
  staffCents: number;
  /** Finances as a Gameplay Pillar (Phase 4) - the season's total Front
   *  Office Department budget cost (totalDepartmentBudgetCostCents,
   *  src/lib/finances/departments.ts) - replaces the old separate
   *  facilities/medical investment levels with one precomputed figure, so
   *  this module stays decoupled from the department scale itself. */
  departmentBudgetCostCents: number;
  /** Finances as a Gameplay Pillar (Phase 1) - the season's resolved
   *  BusinessDecision/business-event expense, summed from
   *  BusinessLedgerEntry. Optional/defaults to 0, same reasoning as
   *  SeasonRevenueInputs.otherIncomeCents. */
  otherExpenseCents?: number;
  /** Finances as a Gameplay Pillar (Phase 5) - this season's debt interest
   *  (computeAnnualInterestCents, src/lib/finances/financing.ts). Optional/
   *  defaults to 0, same reasoning as otherExpenseCents. */
  interestExpenseCents?: number;
}

export interface SeasonExpenses {
  payrollCents: number;
  luxuryTaxCents: number;
  staffCents: number;
  investmentCents: number;
  operatingCents: number;
  otherExpenseCents: number;
  interestExpenseCents: number;
  totalCents: number;
}

export function computeLuxuryTax(payrollCents: number, luxuryTaxLineCents: number): number {
  const over = payrollCents - luxuryTaxLineCents;
  return over > 0 ? Math.round(over * LUXURY_TAX_MULTIPLIER) : 0;
}

export function computeSeasonExpenses(inputs: SeasonExpenseInputs): SeasonExpenses {
  const luxuryTaxCents = computeLuxuryTax(inputs.payrollCents, inputs.luxuryTaxLineCents);
  const investmentCents = inputs.departmentBudgetCostCents;
  const operatingCents = MARKET_OPERATING_BASELINE[inputs.marketSize];
  const otherExpenseCents = inputs.otherExpenseCents ?? 0;
  const interestExpenseCents = inputs.interestExpenseCents ?? 0;
  return {
    payrollCents: inputs.payrollCents,
    luxuryTaxCents,
    staffCents: inputs.staffCents,
    investmentCents,
    operatingCents,
    otherExpenseCents,
    interestExpenseCents,
    totalCents:
      inputs.payrollCents +
      luxuryTaxCents +
      inputs.staffCents +
      investmentCents +
      operatingCents +
      otherExpenseCents +
      interestExpenseCents,
  };
}

export function computeNetIncome(revenue: SeasonRevenue, expenses: SeasonExpenses): number {
  return revenue.totalCents - expenses.totalCents;
}

// ---------------------------------------------------------------------------
// Financial health (bucket-with-label, like jobSecurity.ts)
// ---------------------------------------------------------------------------

export type FinancialHealth = "THRIVING" | "HEALTHY" | "STABLE" | "STRAINED" | "IN_THE_RED";

export const FINANCIAL_HEALTH_LABEL: Record<FinancialHealth, string> = {
  THRIVING: "Thriving",
  HEALTHY: "Healthy",
  STABLE: "Stable",
  STRAINED: "Strained",
  IN_THE_RED: "In the Red",
};

export const FINANCIAL_HEALTH_DESCRIPTION: Record<FinancialHealth, string> = {
  THRIVING: "The business is booming - profits are strong and the balance sheet is deep.",
  HEALTHY: "The franchise is comfortably profitable and financially secure.",
  STABLE: "The books are roughly balanced - not much cushion, but no trouble.",
  STRAINED: "The franchise is losing money this season; ownership is watching the spend.",
  IN_THE_RED: "The franchise is operating in debt. Ownership wants the finances turned around.",
};

const NET_STRAINED = -20 * M;
const NET_HEALTHY = 20 * M;
const NET_THRIVING = 80 * M;

export function computeFinancialHealth(
  cashReserveCents: number,
  netIncomeCents: number,
): FinancialHealth {
  if (cashReserveCents < 0) return "IN_THE_RED";
  if (netIncomeCents < NET_STRAINED) return "STRAINED";
  if (netIncomeCents >= NET_THRIVING) return "THRIVING";
  if (netIncomeCents >= NET_HEALTHY) return "HEALTHY";
  return "STABLE";
}

// ---------------------------------------------------------------------------
// Franchise value (slow-moving asset, active consequence)
// ---------------------------------------------------------------------------

/** Baseline enterprise value by market before any success/popularity/cash
 *  adjustment. Compressed vs. real 2024 NBA valuations, but the relative
 *  market ordering is the point. */
const MARKET_VALUE_BASELINE: Record<MarketSize, number> = {
  LARGE: 3_500 * M,
  MID: 2_400 * M,
  SMALL: 1_900 * M,
};

/** How much a healthy cash balance adds to enterprise value. Small next to
 *  the billions of baseline - a strong balance sheet helps, but titles and
 *  market drive value. */
const CASH_VALUE_WEIGHT = 0.5;

/** New value blends slowly toward the computed target so franchise value
 *  behaves like a real appreciating asset, not a number that whipsaws
 *  season to season. */
const VALUE_SMOOTHING_PRIOR = 0.75;
const VALUE_SMOOTHING_TARGET = 0.25;

export interface FranchiseValueInputs {
  marketSize: MarketSize;
  /** 0-100 current franchise popularity. */
  franchisePopularity: number;
  /** 0-6 playoff-depth index this season (computeActualOutcome) - contention
   *  lifts value, a title most of all. */
  playoffOutcomeIndex: number;
  cashReserveCents: number;
  /** Prior franchise value; <= 0 means "not yet established" (fresh save or
   *  pre-backfill), in which case the target is used directly. */
  priorValueCents: number;
  /** Franchise Finances (Phase D) - a bounded premium (iconValuePremiumFraction)
   *  from the team's marquee franchise icon; 0/omitted has no effect. */
  iconPremiumFraction?: number;
}

export function computeFranchiseValue(inputs: FranchiseValueInputs): number {
  const popularityFactor = 0.8 + (inputs.franchisePopularity / 100) * 0.4;
  const contentionFactor = 1 + inputs.playoffOutcomeIndex * 0.03;
  const iconFactor = 1 + (inputs.iconPremiumFraction ?? 0);
  const cashComponent = Math.max(0, inputs.cashReserveCents) * CASH_VALUE_WEIGHT;

  const target = Math.round(
    MARKET_VALUE_BASELINE[inputs.marketSize] * popularityFactor * contentionFactor * iconFactor +
      cashComponent,
  );

  if (inputs.priorValueCents <= 0) return target;
  return Math.round(
    inputs.priorValueCents * VALUE_SMOOTHING_PRIOR + target * VALUE_SMOOTHING_TARGET,
  );
}

/** How much a CPU team's cash position makes it resist *adding* salary, as a
 *  threshold multiplier (1.0 = no resistance). A franchise in the red actively
 *  sheds salary; a thin cushion makes it cautious; a healthy balance sheet
 *  spends freely. Bounded and modest by design - this nudges borderline
 *  spending decisions, it never hard-blocks one (the salary-normalized
 *  re-signing/signing score means a genuine bargain still clears easily even
 *  at 1.5×; only expensive marginal additions get cut). Deliberately keyed off
 *  cash alone (available without a query at CPU decision time), not the full
 *  financial-health bucket which needs the not-yet-computed current net income. */
const CASH_CAUTION_THRESHOLD_CENTS = 25 * M;

export function financialSpendingResistance(cashReserveCents: number): number {
  if (cashReserveCents < 0) return 1.5;
  if (cashReserveCents < CASH_CAUTION_THRESHOLD_CENTS) return 1.2;
  return 1.0;
}

/** CPU ticket-pricing posture, by market. Big markets can command premium
 *  prices; small markets keep prices fan-friendly to protect their gate.
 *  Deterministic and stable (a franchise's pricing philosophy doesn't churn
 *  season to season) - the user's own team is never assigned this; it starts
 *  neutral (STANDARD) so the choice is theirs. CPU investment levels stay at
 *  STANDARD in this phase; deeper CPU business strategy is a later pass. */
export function pickCpuTicketPosture(marketSize: MarketSize): TicketPricingPosture {
  if (marketSize === "LARGE") return "PREMIUM";
  if (marketSize === "SMALL") return "FAN_FRIENDLY";
  return "STANDARD";
}

/** The market-scaled cash a franchise starts a fresh save with (and the
 *  baseline the backfill seeds existing teams to). A modest cushion so
 *  early spending decisions have room to matter before the first season's
 *  P&L lands. */
export function startingCashReserveCents(marketSize: MarketSize): number {
  const base: Record<MarketSize, number> = {
    LARGE: 120 * M,
    MID: 90 * M,
    SMALL: 70 * M,
  };
  return base[marketSize];
}

// ---------------------------------------------------------------------------
// Phase B lever effects (defined now so Phase B just consumes them; Phase A
// leaves every team on the neutral defaults, so none of these fire yet).
// ---------------------------------------------------------------------------

/** Fan-happiness delta applied for a non-neutral ticket posture - the
 *  long-term half of the pricing tradeoff. Bounded and small, in the same
 *  units as src/lib/fans deltas. */
export const TICKET_POSTURE_FAN_DELTA: Record<TicketPricingPosture, number> = {
  FAN_FRIENDLY: 2,
  STANDARD: 0,
  PREMIUM: -3,
};
