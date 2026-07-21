import type { PayrollTier } from "./payrollTier";

/**
 * Ordered 0-5, matching the 0-6 actual-outcome scale in
 * `seasonEvaluation.ts` (an outcome index equal to an expectation's own
 * index exactly *meets* it) - see that module for how the two line up.
 */
export type ExpectationLevel =
  | "DEVELOP_YOUNG_PLAYERS"
  | "COMPETE_FOR_PLAY_IN"
  | "MAKE_PLAYOFFS"
  | "WIN_PLAYOFF_SERIES"
  | "DEEP_PLAYOFF_RUN"
  | "CHAMPIONSHIP_CONTENTION";

export const EXPECTATION_LEVEL_ORDER: ExpectationLevel[] = [
  "DEVELOP_YOUNG_PLAYERS",
  "COMPETE_FOR_PLAY_IN",
  "MAKE_PLAYOFFS",
  "WIN_PLAYOFF_SERIES",
  "DEEP_PLAYOFF_RUN",
  "CHAMPIONSHIP_CONTENTION",
];

export const EXPECTATION_LEVEL_LABEL: Record<ExpectationLevel, string> = {
  DEVELOP_YOUNG_PLAYERS: "Develop young players",
  COMPETE_FOR_PLAY_IN: "Compete for a Play-In spot",
  MAKE_PLAYOFFS: "Make the playoffs",
  WIN_PLAYOFF_SERIES: "Win a playoff series",
  DEEP_PLAYOFF_RUN: "Make a deep playoff run",
  CHAMPIONSHIP_CONTENTION: "Compete for a championship",
};

// Each payroll tier's expectation before any roster-quality adjustment -
// spending sets the baseline, per the design brief ("payroll should be an
// important factor, but not necessarily the only factor").
const BASE_INDEX_BY_TIER: Record<PayrollTier, number> = {
  MODEST: 0,
  MODERATE: 2,
  SIGNIFICANT: 3,
  EXTREME: 4,
};

// Ratings above/below these move the expectation a level in either
// direction - calibrated against this simulator's actual rating spread
// (see playerValueTier.ts), same as the rest of the simplified layer.
const ELITE_ROSTER_STRENGTH_THRESHOLD = 68;
const WEAK_ROSTER_STRENGTH_THRESHOLD = 45;

/**
 * Sets a preseason expectation from payroll tier + roster quality - an
 * expensive roster that's genuinely elite gets held to a title standard;
 * an expensive roster that's actually mediocre (bad contracts) gets some
 * benefit of the doubt; a cheap roster that's surprisingly good earns a
 * bump up from the baseline "develop young players" ask.
 */
export function computeExpectationLevel(
  payrollTier: PayrollTier,
  teamStrength: number,
): ExpectationLevel {
  let index = BASE_INDEX_BY_TIER[payrollTier];

  if (teamStrength >= ELITE_ROSTER_STRENGTH_THRESHOLD) index += 1;
  else if (teamStrength <= WEAK_ROSTER_STRENGTH_THRESHOLD) index -= 1;

  index = Math.max(0, Math.min(EXPECTATION_LEVEL_ORDER.length - 1, index));
  return EXPECTATION_LEVEL_ORDER[index];
}
