import type { CoachStyle } from "@/generated/prisma/client";
import type { CoachModifier } from "@/lib/simulation/boxScore";

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
