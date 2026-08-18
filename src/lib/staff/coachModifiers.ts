import type { CoachStyle, DepartmentLevel } from "@/generated/prisma/client";
import type { CoachModifier } from "@/lib/simulation/boxScore";
import { departmentQualityDelta } from "@/lib/finances/departments";

/**
 * Translates a Head Coach's quality/style into the small numeric nudges
 * `simulateGame`/`boxScore.ts` actually consume - kept as its own module so
 * both call sites (win probability, box-score generation) derive their
 * coach effect from the same formulas, not two independently hand-tuned ones.
 */
const QUALITY_ANCHOR = 72;
const WIN_BONUS_PER_QUALITY_POINT = 0.15;
const WIN_BONUS_CAP = 4; // rating-point-equivalent, same scale as HOME_COURT_ADVANTAGE = 3

const THREE_PA_MULTIPLIER: Record<CoachStyle, number> = {
  PACE_AND_SPACE: 1.15,
  BALANCED: 1.0,
  GRIND_IT_OUT: 0.85,
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * A small, additive win-probability nudge - same scale as the engine's flat
 * home-court bonus, never a replacement for real roster talent. Null (no
 * Head Coach hired yet) is neutral, same convention as
 * `computeCoachBoxScoreModifier`.
 */
export function computeCoachWinBonus(quality: number | null): number {
  if (quality === null) return 0;
  return clamp(
    (quality - QUALITY_ANCHOR) * WIN_BONUS_PER_QUALITY_POINT,
    -WIN_BONUS_CAP,
    WIN_BONUS_CAP,
  );
}

// Coaching Support "amplifies
// whatever staff you've already hired" rather than being a standalone
// number: it nudges the *effective* quality fed into every coach-quality
// consumer below, so a MAXIMUM-funded department turns a good Head Coach
// into a great one but does nothing for a team with no coach hired at all.
const COACHING_SUPPORT_AMPLIFICATION = 1 / 3; // a +14 department delta -> ~+4.7 effective quality

/** Null rawQuality (no coach/staff hired) passes through unchanged - Coaching Support has nothing to amplify. */
export function effectiveStaffQuality(
  rawQuality: number | null,
  coachingSupportLevel: DepartmentLevel,
): number | null {
  if (rawQuality === null) return null;
  const boost = departmentQualityDelta(coachingSupportLevel) * COACHING_SUPPORT_AMPLIFICATION;
  return Math.max(0, Math.min(99, Math.round(rawQuality + boost)));
}

/** Null quality/style (no Head Coach hired) is treated as perfectly neutral - every game already behaves exactly as it did before this phase existed. */
export function computeCoachBoxScoreModifier(
  quality: number | null,
  style: CoachStyle | null,
): CoachModifier {
  if (quality === null) return { benchTrustDelta: 0, threePaMultiplier: 1 };
  return {
    benchTrustDelta: clamp((quality - QUALITY_ANCHOR) / 27, -1, 1),
    threePaMultiplier: THREE_PA_MULTIPLIER[style ?? "BALANCED"],
  };
}
