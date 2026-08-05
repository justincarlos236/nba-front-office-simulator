import type { DepartmentLevel } from "@/generated/prisma/client";

/**
 * Finances as a Gameplay Pillar (Phase 4), System 6 - "Front Office
 * Departments." A zero-sum operations budget across 6 departments,
 * replacing the old independent facilitiesInvestment/medicalInvestment
 * dropdowns. Every department shares the same 5-level scale and the same
 * neutral-anchored "quality delta" shape those two levers already used
 * (0 at STANDARD) - but funding one now genuinely costs another, since the
 * 6 levels must always sum to DEPARTMENT_BUDGET_TOTAL.
 *
 * This module owns only the shared plumbing: the level scale, budget-total
 * validation, and the generic cost/quality-delta tables. Each department's
 * own *specific* effect (what "quality" actually buys) lives in its
 * natural consuming module instead - developPlayerRating.ts, simulation/
 * leagueEvents.ts, scoutingProfile.ts, TradeBuilder.tsx, fanHappiness.ts,
 * offseason.ts/simulation.ts (coach amplification) - same "consume, don't
 * duplicate" pattern the rest of this pillar already follows.
 */

export type DepartmentKey =
  | "scouting"
  | "playerDevelopment"
  | "sportsScience"
  | "analytics"
  | "marketing"
  | "coachingSupport";

export interface DepartmentBudget {
  scouting: DepartmentLevel;
  playerDevelopment: DepartmentLevel;
  sportsScience: DepartmentLevel;
  analytics: DepartmentLevel;
  marketing: DepartmentLevel;
  coachingSupport: DepartmentLevel;
}

export const DEPARTMENT_KEYS: DepartmentKey[] = [
  "scouting",
  "playerDevelopment",
  "sportsScience",
  "analytics",
  "marketing",
  "coachingSupport",
];

export const DEPARTMENT_LABEL: Record<DepartmentKey, string> = {
  scouting: "Scouting",
  playerDevelopment: "Player Development",
  sportsScience: "Sports Science",
  analytics: "Analytics",
  marketing: "Marketing",
  coachingSupport: "Coaching Support",
};

export const DEPARTMENT_IDENTITY: Record<DepartmentKey, string> = {
  scouting:
    "Sharpens how reliable your qualitative reads on prospects are - bust risk, development trajectory, work ethic, NBA readiness, injury outlook, and long-term ceiling. Ratings themselves are always visible; scouting is about how much you can trust the read behind them.",
  playerDevelopment: "Grows young players faster and helps veterans age more gracefully.",
  sportsScience: "Keeps your roster healthier - fewer injuries, shorter absences when they happen.",
  analytics:
    "Reveals precise trade fair-value numbers instead of a vague read - real information, not better luck.",
  marketing: "Grows your franchise's popularity faster and attracts richer sponsorship offers.",
  coachingSupport:
    "Amplifies whatever staff you've already hired - a bigger win bonus from your Head Coach, a bigger boost from your Player Development Coach.",
};

const LEVELS: DepartmentLevel[] = ["MINIMAL", "LOW", "STANDARD", "HIGH", "MAXIMUM"];

const LEVEL_INDEX: Record<DepartmentLevel, number> = {
  MINIMAL: 0,
  LOW: 1,
  STANDARD: 2,
  HIGH: 3,
  MAXIMUM: 4,
};

export function departmentLevelIndex(level: DepartmentLevel): number {
  return LEVEL_INDEX[level];
}

export function departmentLevelFromIndex(index: number): DepartmentLevel {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}

/** Every department at STANDARD (index 2) - 6 x 2 = 12. */
export const DEPARTMENT_BUDGET_TOTAL = 12;
export const DEPARTMENT_LEVEL_MIN_INDEX = 0;
export const DEPARTMENT_LEVEL_MAX_INDEX = 4;

export const NEUTRAL_DEPARTMENT_BUDGET: DepartmentBudget = {
  scouting: "STANDARD",
  playerDevelopment: "STANDARD",
  sportsScience: "STANDARD",
  analytics: "STANDARD",
  marketing: "STANDARD",
  coachingSupport: "STANDARD",
};

export function departmentBudgetTotal(budget: DepartmentBudget): number {
  return DEPARTMENT_KEYS.reduce((sum, key) => sum + LEVEL_INDEX[budget[key]], 0);
}

/** A budget is only ever legal if it sums to exactly DEPARTMENT_BUDGET_TOTAL - the zero-sum constraint that makes this a real reallocation puzzle, not 6 independent sliders. */
export function isValidDepartmentBudget(budget: DepartmentBudget): boolean {
  return departmentBudgetTotal(budget) === DEPARTMENT_BUDGET_TOTAL;
}

// Asymmetric, escalating returns to specialization - the same "0 at
// STANDARD, positive above, negative below" shape INVESTMENT_QUALITY_DELTA
// used, but a wider 5-point scale so genuinely committing budget to a
// department (HIGH/MAXIMUM) reads as a real specialization, not a rounding
// error, and starving one (MINIMAL) has a real cost.
const QUALITY_DELTA_BY_LEVEL: Record<DepartmentLevel, number> = {
  MINIMAL: -10,
  LOW: -4,
  STANDARD: 0,
  HIGH: 6,
  MAXIMUM: 14,
};

/** The generic "how much better/worse than neutral" signal every department's own consuming module scales into its specific effect. */
export function departmentQualityDelta(level: DepartmentLevel): number {
  return QUALITY_DELTA_BY_LEVEL[level];
}

const DOLLARS = 100;
const M = 1_000_000 * DOLLARS;

// Annual cost per level (cents) - also asymmetric, so MAXIMUM is a real
// budget commitment rather than a free upgrade. Six departments at
// STANDARD costs 6 x 3M = 18M/yr, in the same ballpark the old two-lever
// STANDARD/STANDARD baseline cost (0), reflecting that running a full
// front office is a genuinely bigger commitment than facilities+medical
// alone ever was.
const ANNUAL_COST_CENTS_BY_LEVEL: Record<DepartmentLevel, number> = {
  MINIMAL: 0,
  LOW: 1.5 * M,
  STANDARD: 3 * M,
  HIGH: 6 * M,
  MAXIMUM: 11 * M,
};

export function departmentAnnualCostCents(level: DepartmentLevel): number {
  return ANNUAL_COST_CENTS_BY_LEVEL[level];
}

export function totalDepartmentBudgetCostCents(budget: DepartmentBudget): number {
  return DEPARTMENT_KEYS.reduce((sum, key) => sum + ANNUAL_COST_CENTS_BY_LEVEL[budget[key]], 0);
}
