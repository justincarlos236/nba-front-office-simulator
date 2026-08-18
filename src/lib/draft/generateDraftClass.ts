import { generateUniqueProspectName } from "./prospectNames";
import {
  generatePhysicalProfile,
  generateOrigin,
  pickComparisonPlayerName,
  type ProspectPathway,
} from "./prospectBio";
import { pickClassCharacter, classCharacterModifiers, type ClassCharacter } from "./classCharacter";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Position = (typeof POSITIONS)[number];

export interface GeneratedProspect {
  fullName: string;
  position: Position;
  age: number;
  overallRating: number;
  potentialRating: number;
  heightInches: number;
  weightLbs: number;
  collegeOrTeam: string;
  isInternational: boolean;
  nationality: string;
  pathway: ProspectPathway;
  comparisonPlayerName: string;
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
export const OVERALL_AT_PICK_1 = 72;
export const OVERALL_AT_PICK_60 = 62;
export const POTENTIAL_AT_PICK_1 = 97;
export const POTENTIAL_AT_PICK_60 = 70;
const RATING_VARIANCE = 6; // +/- swing so pick order isn't perfectly predictive

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * How sharply potential falls across a class. 1 is the straight line this used
 * to be; below 1 drops steeply through the lottery and flattens out late, which
 * is the shape of a real class.
 *
 * **A straight line made every class better than the league it joined.**
 * Linear interpolation from 97 to 70 puts the mean potential of a 60-man class
 * at 83.5, against a league median of 71 - so intake beat the population every
 * year, forever, and the league drifted to 221 players at 80+ against a real 82
 * (docs/audits/DEVELOPMENT_AUDIT.md, D-P0-2). Real classes are far more top-heavy: a
 * couple of players with genuine star ceilings and a long tail of rotation
 * talent.
 *
 * Applied to potential only. Current ability already falls gently across a
 * class - rookies are all roughly equally unproven - and it is the *ceiling*
 * that was mispriced.
 */
const POTENTIAL_FALLOFF_EXPONENT = 0.5;

/**
 * How many picks at the very top of a class share the highest ceiling.
 *
 * Zero is the pure power curve this used to be, where pick 1 is the only
 * prospect with a genuine star ceiling: 97, then 93.5, then 92. One elite
 * report per class.
 *
 * **That is what coupled "top picks can bust" to "the league has stars".**
 * docs/audits/DEVELOPMENT_AUDIT.md attempt 4 added a scouting miss band and drained
 * the 90+ population, because the prospects it removed were the only ones who
 * could ever reach 90. With a plateau there are several candidates a class, so
 * a miss band can fail some of them and the star tier still fills.
 *
 * Real classes look like this. A consensus top tier of two to four prospects
 * with genuine star projections is ordinary; a single anointed one is the
 * exception.
 *
 * Fitted with `SCOUTING_MISS_RATE` and `RELIABILITY_CURVE_EXPONENT` together in
 * `scripts/top-tier-calibration.ts` - the three only work as a set, which is
 * why six single-parameter attempts failed.
 */
const TOP_TIER_PICKS = 3;

export function expectedRatingForPick(pick: number, atPick1: number, atPick60: number): number {
  const t = (pick - 1) / (CLASS_SIZE - 1); // 0 at pick 1, 1 at pick 60
  return atPick1 + (atPick60 - atPick1) * t;
}

/**
 * The same curve for potential, but convex - see `POTENTIAL_FALLOFF_EXPONENT`.
 */
export function expectedPotentialForPick(
  pick: number,
  atPick1: number,
  atPick60: number,
  falloffExponent: number = POTENTIAL_FALLOFF_EXPONENT,
  topTierPicks: number = TOP_TIER_PICKS,
): number {
  // The top tier shares one ceiling; the curve starts falling after it.
  const plateau = Math.max(0, topTierPicks);
  if (pick <= plateau + 1) return atPick1;
  const t = (pick - plateau - 1) / (CLASS_SIZE - plateau - 1);
  return atPick1 + (atPick60 - atPick1) * Math.pow(t, falloffExponent);
}

export interface GeneratedDraftClass {
  character: ClassCharacter;
  prospects: GeneratedProspect[];
}

/**
 * Generates one fictional draft class (60 prospects, one per pick). Real
 * future prospects obviously don't exist, so this is a documented
 * simplification - see docs/SYSTEMS.md and prospectNames.ts. Ratings
 * are correlated with pick position on average (early picks trend better)
 * but with real variance layered on top, so pick order isn't a perfect
 * predictor - some late picks outperform, some early picks bust, the same
 * as a real draft.
 *
 * Class-Character Variance (Scouting Pillar Redesign, Phase 4 -
 * docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.6) - the very first roll off `rng`
 * picks this class's character, which perturbs the rating curve and
 * international rate for every prospect generated after it. Consuming
 * this roll first (rather than per-prospect) is deliberate: the character
 * is a property of the whole class, decided once, not a per-prospect
 * coin flip.
 */
export function generateDraftClass(
  rng: () => number = Math.random,
  /**
   * Calibration seam only - see scripts/draft-class-calibration.ts. Production
   * callers omit it and get POTENTIAL_FALLOFF_EXPONENT. Exists so a sweep
   * exercises this exact generator rather than a copy of it.
   */
  falloffExponent: number = POTENTIAL_FALLOFF_EXPONENT,
  topTierPicks: number = TOP_TIER_PICKS,
): GeneratedDraftClass {
  const character = pickClassCharacter(rng);
  const mods = classCharacterModifiers(character);
  const prospects: GeneratedProspect[] = [];
  const takenNames = new Set<string>();

  for (let pick = 1; pick <= CLASS_SIZE; pick++) {
    const baseOverall = expectedRatingForPick(
      pick,
      OVERALL_AT_PICK_1 + mods.overallAtPick1Delta,
      OVERALL_AT_PICK_60 + mods.overallAtPick60Delta,
    );
    const basePotential = expectedPotentialForPick(
      pick,
      POTENTIAL_AT_PICK_1 + mods.potentialAtPick1Delta,
      POTENTIAL_AT_PICK_60,
      falloffExponent,
      topTierPicks,
    );

    const overallVariance = randomIntInclusive(rng, -RATING_VARIANCE, RATING_VARIANCE);
    const potentialVariance = randomIntInclusive(rng, -RATING_VARIANCE, RATING_VARIANCE);

    const overallRating = Math.max(60, Math.min(99, Math.round(baseOverall + overallVariance)));
    const potentialRating = Math.max(
      overallRating,
      Math.min(99, Math.round(basePotential + potentialVariance)),
    );

    // One-and-done lottery-caliber prospects skew younger; deeper picks
    // skew toward multi-year college players.
    const age = pick <= 14 ? randomIntInclusive(rng, 19, 21) : randomIntInclusive(rng, 19, 22);
    const position = POSITIONS[Math.floor(rng() * POSITIONS.length)];
    const { heightInches, weightLbs } = generatePhysicalProfile(rng, position);
    const { collegeOrTeam, isInternational, nationality, pathway } = generateOrigin(
      rng,
      mods.internationalRateMultiplier,
    );
    const comparisonPlayerName = pickComparisonPlayerName(rng, position, potentialRating);

    prospects.push({
      fullName: generateUniqueProspectName(rng, takenNames),
      position,
      age,
      overallRating,
      potentialRating,
      heightInches,
      weightLbs,
      collegeOrTeam,
      isInternational,
      nationality,
      pathway,
      comparisonPlayerName,
    });
  }

  return { character, prospects };
}
