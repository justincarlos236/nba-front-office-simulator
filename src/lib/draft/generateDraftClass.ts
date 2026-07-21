import { generateProspectName } from "./prospectNames";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Position = (typeof POSITIONS)[number];

export interface GeneratedProspect {
  fullName: string;
  position: Position;
  age: number;
  overallRating: number;
  potentialRating: number;
}

export const CLASS_SIZE = 60;

// Pick 1's expected rating vs. pick 60's - real rookies rarely enter the
// league as immediate stars even at the top of the draft (potential is
// what separates them), and talent drops off, but not on a straight line -
// the gap closes late in the class since fringe two-way talent isn't that
// different pick 50 to pick 60. Exported for reuse by
// `src/lib/gm/draftPickTradeValue.ts`, which projects a not-yet-drafted
// future pick's expected rating off this exact same curve, rather than a
// second hand-tuned scale that could drift out of sync with it.
export const OVERALL_AT_PICK_1 = 68;
export const OVERALL_AT_PICK_60 = 45;
export const POTENTIAL_AT_PICK_1 = 92;
export const POTENTIAL_AT_PICK_60 = 65;
const RATING_VARIANCE = 8; // +/- swing so pick order isn't perfectly predictive

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function expectedRatingForPick(pick: number, atPick1: number, atPick60: number): number {
  const t = (pick - 1) / (CLASS_SIZE - 1); // 0 at pick 1, 1 at pick 60
  return atPick1 + (atPick60 - atPick1) * t;
}

/**
 * Generates one fictional draft class (60 prospects, one per pick). Real
 * future prospects obviously don't exist, so this is a documented
 * simplification - see docs/ARCHITECTURE.md and prospectNames.ts. Ratings
 * are correlated with pick position on average (early picks trend better)
 * but with real variance layered on top, so pick order isn't a perfect
 * predictor - some late picks outperform, some early picks bust, the same
 * as a real draft.
 */
export function generateDraftClass(rng: () => number = Math.random): GeneratedProspect[] {
  const prospects: GeneratedProspect[] = [];

  for (let pick = 1; pick <= CLASS_SIZE; pick++) {
    const baseOverall = expectedRatingForPick(pick, OVERALL_AT_PICK_1, OVERALL_AT_PICK_60);
    const basePotential = expectedRatingForPick(pick, POTENTIAL_AT_PICK_1, POTENTIAL_AT_PICK_60);

    const overallVariance = randomIntInclusive(rng, -RATING_VARIANCE, RATING_VARIANCE);
    const potentialVariance = randomIntInclusive(rng, -RATING_VARIANCE, RATING_VARIANCE);

    const overallRating = Math.max(25, Math.min(99, Math.round(baseOverall + overallVariance)));
    const potentialRating = Math.max(
      overallRating,
      Math.min(99, Math.round(basePotential + potentialVariance)),
    );

    // One-and-done lottery-caliber prospects skew younger; deeper picks
    // skew toward multi-year college players.
    const age = pick <= 14 ? randomIntInclusive(rng, 19, 21) : randomIntInclusive(rng, 19, 22);
    const position = POSITIONS[Math.floor(rng() * POSITIONS.length)];

    prospects.push({
      fullName: generateProspectName(rng),
      position,
      age,
      overallRating,
      potentialRating,
    });
  }

  return prospects;
}
