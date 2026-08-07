import type { ExpectationLevel } from "./expectationLevel";
import { EXPECTATION_LEVEL_ORDER } from "./expectationLevel";
import type { PayrollTier } from "./payrollTier";
import type { FinancialHealth } from "@/lib/finances/finances";

export type EvaluationVerdict = "EXCEEDED" | "MET" | "FELL_SHORT" | "DRASTICALLY_FELL_SHORT";

export interface PlayoffSeriesForOutcome {
  round: number;
  higherSeedTeamId: string;
  lowerSeedTeamId: string;
  winnerTeamId: string | null;
}

export interface ActualOutcome {
  /** 0-6, aligned with ExpectationLevel's 0-5 scale - see module comment below. */
  index: number;
  label: string;
}

const OUTCOME_LABEL: Record<number, string> = {
  0: "Missed the playoffs",
  1: "Eliminated in the play-in tournament",
  2: "Eliminated in Round 1",
  3: "Eliminated in the Conference Semifinals",
  4: "Eliminated in the Conference Finals",
  5: "Lost in the NBA Finals",
  6: "Won the championship",
};

/**
 * Determines how far a team actually got, on a 0-6 scale that lines up
 * 1-for-1 with `ExpectationLevel`'s 0-5 scale (an actual outcome index
 * equal to the expectation's own index exactly meets it - see
 * `evaluateSeason`). Reusing plain `PlayoffSeries` rows rather than a
 * separate "season result" field keeps this a pure derivation of data
 * that already exists, not a second source of truth to keep in sync.
 */
export function computeActualOutcome(
  teamId: string,
  madePlayIn: boolean,
  series: PlayoffSeriesForOutcome[],
): ActualOutcome {
  const teamSeries = series.filter(
    (s) => s.higherSeedTeamId === teamId || s.lowerSeedTeamId === teamId,
  );

  if (teamSeries.length === 0) {
    const index = madePlayIn ? 1 : 0;
    return { index, label: OUTCOME_LABEL[index] };
  }

  const latest = [...teamSeries].sort((a, b) => b.round - a.round)[0];
  const won = latest.winnerTeamId === teamId;
  const index = latest.round === 4 ? (won ? 6 : 5) : latest.round + 1;
  return { index, label: OUTCOME_LABEL[index] };
}

/**
 * Compares the actual outcome against the preseason expectation on their
 * shared 0-6/0-5 scale. A team that lands exactly on its expectation's
 * index "met" it (e.g. an expectation of WIN_PLAYOFF_SERIES = index 3 is
 * met by an actual outcome of "eliminated in the Conference Semifinals,"
 * also index 3, since that means they won their first-round series).
 */
export function evaluateSeason(
  expectationLevel: ExpectationLevel,
  actualOutcome: ActualOutcome,
): EvaluationVerdict {
  const expectationIndex = EXPECTATION_LEVEL_ORDER.indexOf(expectationLevel);
  const diff = actualOutcome.index - expectationIndex;
  if (diff >= 1) return "EXCEEDED";
  if (diff === 0) return "MET";
  if (diff === -1) return "FELL_SHORT";
  return "DRASTICALLY_FELL_SHORT";
}

const BASE_CONFIDENCE_DELTA: Record<EvaluationVerdict, number> = {
  EXCEEDED: 8,
  MET: 2,
  FELL_SHORT: -8,
  DRASTICALLY_FELL_SHORT: -20,
};

// Spending heavily amplifies both the reward for justifying it and the
// punishment for wasting it - a modest-payroll team missing its (already
// low) bar barely registers; an extreme-payroll team doing the same is a
// real crisis. See the design brief's "higher spending -> higher
// expectations -> greater consequences for underperformance."
const PAYROLL_DELTA_MULTIPLIER: Record<PayrollTier, number> = {
  MODEST: 0.5,
  MODERATE: 0.75,
  SIGNIFICANT: 1.25,
  EXTREME: 1.75,
};

// A modest nudge, not a second driver of confidence - a thrilled fanbase
// (100) adds roughly +2.8, an empty building (20) subtracts roughly -3.6,
// small next to the verdict-driven swings above. Omitted entirely (not
// just neutral) for leagues where fan engagement hasn't been computed yet,
// so this stays a pure addition with no behavior change for existing
// call sites that don't pass it.
const FAN_HAPPINESS_NUDGE_SCALE = 0.08;
const FAN_HAPPINESS_NEUTRAL = 65;

// Franchise Finances - a modest nudge on top of the verdict, same spirit as
// the fan-happiness one: ownership rewards a franchise that spends
// responsibly and makes money, and sours faster on one bleeding cash. Small
// next to the verdict swings, and omitted entirely (not just neutral) for
// callers that don't pass it, so existing behavior is unchanged.
const FINANCIAL_HEALTH_NUDGE: Record<FinancialHealth, number> = {
  THRIVING: 2,
  HEALTHY: 1,
  STABLE: 0,
  STRAINED: -2,
  IN_THE_RED: -4,
};

export function computeConfidenceDelta(
  verdict: EvaluationVerdict,
  payrollTier: PayrollTier,
  fanHappiness?: number,
  financialHealth?: FinancialHealth,
): number {
  const base = BASE_CONFIDENCE_DELTA[verdict] * PAYROLL_DELTA_MULTIPLIER[payrollTier];
  const fanNudge =
    fanHappiness !== undefined
      ? (fanHappiness - FAN_HAPPINESS_NEUTRAL) * FAN_HAPPINESS_NUDGE_SCALE
      : 0;
  const financialNudge =
    financialHealth !== undefined ? FINANCIAL_HEALTH_NUDGE[financialHealth] : 0;
  return Math.round(base + fanNudge + financialNudge);
}
