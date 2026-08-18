/**
 * Class-Character Variance (Scouting Pillar Redesign, Phase 4 -
 * docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.6, "the 25-year requirement"). One
 * character per class, deterministic from the same seed the class itself
 * is generated from - perturbs `generateDraftClass`'s existing rating-curve
 * constants and the international rate, rather than a second generation
 * system. The whole point: the *optimal scouting strategy* should differ
 * class to class - a top-heavy class rewards concentrating on the top
 * few names, a deep class rewards broad Sweeps, an international-heavy
 * class makes the International Professional pathway the one worth
 * prioritizing - so a 25-year save can't converge on one dominant, static
 * strategy.
 */

export type ClassCharacter =
  | "TOP_HEAVY"
  | "DEEP_BUT_FLAT"
  | "INTERNATIONAL_HEAVY"
  | "INJURY_RIDDLED"
  | "WEAK_CLASS"
  | "BALANCED";

export const CLASS_CHARACTER_LABEL: Record<ClassCharacter, string> = {
  TOP_HEAVY: "Top-Heavy",
  DEEP_BUT_FLAT: "Deep but Flat",
  INTERNATIONAL_HEAVY: "International-Heavy",
  INJURY_RIDDLED: "Injury-Riddled",
  WEAK_CLASS: "Weak Class",
  BALANCED: "Balanced",
};

export const CLASS_CHARACTER_DESCRIPTION: Record<ClassCharacter, string> = {
  TOP_HEAVY:
    "A handful of genuine difference-makers at the very top, then a steep drop-off - the lottery matters more than usual this year.",
  DEEP_BUT_FLAT:
    "No consensus superstar, but real, usable talent runs deep into the second round - trading down or spreading your scouting wide pays off.",
  INTERNATIONAL_HEAVY:
    "An unusually strong crop of international prospects - the pathway most public boards will underrate the hardest this year.",
  INJURY_RIDDLED:
    "More real injury risk across the class than usual - medical diligence matters more than most years.",
  WEAK_CLASS:
    "A down year across the board - even the top of this class projects modestly, and trading picks away for proven veterans is a live option.",
  BALANCED: "No real skew in either direction - a normal class, evenly spread.",
};

// One character in six, weighted slightly toward BALANCED so most classes
// still feel like an ordinary year and a real character reads as a
// standout season, not the norm.
const CLASS_CHARACTER_WEIGHTS: [ClassCharacter, number][] = [
  ["BALANCED", 0.35],
  ["TOP_HEAVY", 0.15],
  ["DEEP_BUT_FLAT", 0.15],
  ["INTERNATIONAL_HEAVY", 0.15],
  ["INJURY_RIDDLED", 0.1],
  ["WEAK_CLASS", 0.1],
];

export function pickClassCharacter(rng: () => number): ClassCharacter {
  const roll = rng();
  let cumulative = 0;
  for (const [character, weight] of CLASS_CHARACTER_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return character;
  }
  return "BALANCED";
}

export interface ClassCharacterModifiers {
  /** Added to OVERALL_AT_PICK_1 before generation. */
  overallAtPick1Delta: number;
  /** Added to OVERALL_AT_PICK_60 before generation. */
  overallAtPick60Delta: number;
  /** Added to POTENTIAL_AT_PICK_1 before generation. */
  potentialAtPick1Delta: number;
  /** Multiplies the base INTERNATIONAL_RATE from prospectBio.ts. */
  internationalRateMultiplier: number;
  /** Added to the injury-outlook "true" roll before bucketing (see scoutingProfile.ts's trueInjuryOutlook) - positive shifts the whole class toward more red flags. */
  injuryRiskDelta: number;
  /** Multiplies the Big Board's noise-introducing factors (competition/production/tournament spread) - a flatter class reads as more chaotic to public evaluators too. */
  bigBoardNoiseMultiplier: number;
}

const MODIFIERS_BY_CHARACTER: Record<ClassCharacter, ClassCharacterModifiers> = {
  BALANCED: {
    overallAtPick1Delta: 0,
    overallAtPick60Delta: 0,
    potentialAtPick1Delta: 0,
    internationalRateMultiplier: 1,
    injuryRiskDelta: 0,
    bigBoardNoiseMultiplier: 1,
  },
  TOP_HEAVY: {
    overallAtPick1Delta: 6,
    overallAtPick60Delta: -2,
    potentialAtPick1Delta: 2,
    internationalRateMultiplier: 1,
    injuryRiskDelta: 0,
    bigBoardNoiseMultiplier: 1,
  },
  DEEP_BUT_FLAT: {
    overallAtPick1Delta: -5,
    overallAtPick60Delta: 4,
    potentialAtPick1Delta: -4,
    internationalRateMultiplier: 1,
    injuryRiskDelta: 0,
    bigBoardNoiseMultiplier: 1.2,
  },
  INTERNATIONAL_HEAVY: {
    overallAtPick1Delta: 0,
    overallAtPick60Delta: 0,
    potentialAtPick1Delta: 0,
    internationalRateMultiplier: 2,
    injuryRiskDelta: 0,
    bigBoardNoiseMultiplier: 1.15,
  },
  INJURY_RIDDLED: {
    overallAtPick1Delta: 0,
    overallAtPick60Delta: 0,
    potentialAtPick1Delta: 0,
    internationalRateMultiplier: 1,
    injuryRiskDelta: 0.15,
    bigBoardNoiseMultiplier: 1,
  },
  WEAK_CLASS: {
    overallAtPick1Delta: -6,
    overallAtPick60Delta: -3,
    potentialAtPick1Delta: -8,
    internationalRateMultiplier: 1,
    injuryRiskDelta: 0,
    bigBoardNoiseMultiplier: 1,
  },
};

export function classCharacterModifiers(character: ClassCharacter): ClassCharacterModifiers {
  return MODIFIERS_BY_CHARACTER[character];
}
