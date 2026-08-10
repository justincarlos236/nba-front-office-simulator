import type { EvaluationVerdict } from "@/lib/gm/seasonEvaluation";
import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";
import type { CoachStyle, MarketSize } from "@/generated/prisma/client";

/**
 * Fan Happiness is its own model, separate from League.ownerConfidence -
 * fans and ownership weigh success differently (fans care about
 * excitement/star power/patience-while-rebuilding, ownership cares about
 * spending discipline vs. results) - but it reuses the exact same
 * evaluators wherever the underlying question is the same, rather than
 * re-deriving "did this team do well" from scratch. See
 * docs/SYSTEMS.md's Fan engagement section.
 */
export interface FanHappinessInputs {
  // Set only for the user's own team (SeasonExpectation is user-team-only
  // - see src/lib/actions/offseason.ts). Reusing this verdict directly is
  // what makes a rebuilding fanbase patient with a modest record and a
  // championship-expectation fanbase unforgiving of the same record - a
  // low ExpectationLevel already reads a modest outcome as MET/EXCEEDED,
  // no separate "patience" model needed.
  evaluationVerdict: EvaluationVerdict | null;
  // Always available - the fallback for CPU teams, same split already
  // established for Head Coach reputation drift in offseason.ts.
  teamWinPct: number;
  // Raw sum from computeTransactionSentiment - this season's real events.
  transactionSentiment: number;
  // Best player on the roster, reusing getPlayerValueTier.
  starPowerTier: PlayerValueTier | null;
  // Head Coach's style, if hired - a small "exciting style of play" nudge.
  coachStyle: CoachStyle | null;
}

const VERDICT_DELTA: Record<EvaluationVerdict, number> = {
  EXCEEDED: 10,
  MET: 2,
  FELL_SHORT: -8,
  DRASTICALLY_FELL_SHORT: -18,
};

// Matches HEAD_COACH_REPUTATION_DRIFT_PER_WIN_PCT's scale in offseason.ts -
// the same win%-fallback situation deserves the same magnitude of effect.
const WIN_PCT_DELTA_SCALE = 20;

const STAR_POWER_DELTA: Record<PlayerValueTier, number> = {
  SUPERSTAR: 4,
  STAR: 2,
  STARTER: 0,
  ROTATION: -1,
  MINIMUM: -2,
};

const COACH_STYLE_DELTA: Record<CoachStyle, number> = {
  PACE_AND_SPACE: 1,
  BALANCED: 0,
  GRIND_IT_OUT: -1,
};

// Individual transactions already carry roughly ±0.3 to ±2 of raw
// sentiment each; this scales an eventful season's total into a
// meaningful but bounded happiness swing.
const TRANSACTION_SENTIMENT_SCALE = 3;
const TRANSACTION_SENTIMENT_CAP = 15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Returns a delta to apply to LeagueTeam.fanHappiness - the caller clamps the result to 0-100, same convention as reputation drift elsewhere in this codebase. */
export function computeFanHappinessDelta(inputs: FanHappinessInputs): number {
  const outcomeDelta = inputs.evaluationVerdict
    ? VERDICT_DELTA[inputs.evaluationVerdict]
    : (inputs.teamWinPct - 0.5) * WIN_PCT_DELTA_SCALE;

  const transactionDelta = clamp(
    inputs.transactionSentiment * TRANSACTION_SENTIMENT_SCALE,
    -TRANSACTION_SENTIMENT_CAP,
    TRANSACTION_SENTIMENT_CAP,
  );

  const starPowerDelta = inputs.starPowerTier ? STAR_POWER_DELTA[inputs.starPowerTier] : 0;
  const coachStyleDelta = inputs.coachStyle ? COACH_STYLE_DELTA[inputs.coachStyle] : 0;

  return Math.round(outcomeDelta + transactionDelta + starPowerDelta + coachStyleDelta);
}

const STAR_POWER_SCORE: Record<PlayerValueTier, number> = {
  SUPERSTAR: 92,
  STAR: 82,
  STARTER: 75,
  ROTATION: 67,
  MINIMUM: 55,
};

const MARKET_SIZE_POPULARITY_MULTIPLIER: Record<MarketSize, number> = {
  LARGE: 1.1,
  MID: 1.0,
  SMALL: 0.9,
};

// Finances as a Gameplay Pillar (Phase 4) - the Marketing department grows
// the brand faster, on top of whatever winning/star-power/market already
// earns. Scales departmentQualityDelta (roughly -10..+14) down into a
// modest, bounded popularity nudge - Marketing accelerates growth, it
// doesn't replace having a good team.
const MARKETING_POPULARITY_SCALE = 0.5;

/** A derived, presentational 0-100 index - not independently simulated (see docs/SYSTEMS.md). Half fan happiness, half star power, market-size-adjusted, with an optional Marketing-department nudge. */
export function computeFranchisePopularity(
  fanHappiness: number,
  starPowerTier: PlayerValueTier | null,
  marketSize: MarketSize,
  marketingQualityDelta = 0,
): number {
  const starScore = STAR_POWER_SCORE[starPowerTier ?? "STARTER"];
  const base =
    fanHappiness * 0.6 + starScore * 0.4 + marketingQualityDelta * MARKETING_POPULARITY_SCALE;
  return Math.round(clamp(base * MARKET_SIZE_POPULARITY_MULTIPLIER[marketSize], 0, 100));
}

const MARKET_SIZE_ATTENDANCE_BASELINE: Record<MarketSize, number> = {
  LARGE: 0.92,
  MID: 0.85,
  SMALL: 0.75,
};

/** A derived, presentational 0-1 fraction - large markets keep a higher floor (tradition/season tickets) even when unhappy; happiness still meaningfully swings the number. */
export function computeAttendancePct(fanHappiness: number, marketSize: MarketSize): number {
  const happinessAdjustment = ((fanHappiness - 65) / 100) * 0.3;
  return clamp(MARKET_SIZE_ATTENDANCE_BASELINE[marketSize] + happinessAdjustment, 0.3, 1.0);
}

export type FranchisePopularityTier = "TRENDING" | "STRONG" | "STEADY" | "SOFT" | "WEAK";

/**
 * One tier drives several labeled facets in the UI (merchandise, season
 * tickets, social buzz) - they're all reflections of the same underlying
 * "how hot is this team right now" number, not independently tracked
 * metrics (see docs/SYSTEMS.md's Fan engagement section on why).
 */
export function getFranchisePopularityTier(franchisePopularity: number): FranchisePopularityTier {
  if (franchisePopularity >= 85) return "TRENDING";
  if (franchisePopularity >= 70) return "STRONG";
  if (franchisePopularity >= 55) return "STEADY";
  if (franchisePopularity >= 40) return "SOFT";
  return "WEAK";
}
