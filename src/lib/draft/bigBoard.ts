import { createSeededRandom, randomInRange } from "@/lib/contracts/seededRandom";

/**
 * The Big Board (Scouting Pillar Redesign, Phase 3 -
 * docs/SCOUTING_PILLAR_DESIGN.md Part 3.1). A league-wide public ranking of
 * the draft class, generated independently of true `overallRating` -
 * replaces `computeProjectedDraftRange`, which ranked by truth and was
 * therefore never actually wrong (see Part 5's overlap review: "Delete,
 * don't duplicate").
 *
 * The design's explicit refinement: errors must be explainable, not
 * planted. Every input here is a believable thing a real public evaluator
 * could see - age, physical profile, competition level/visibility,
 * generated production, and (once revealed) tournament performance - never
 * arbitrary per-prospect noise. A prospect whose truth and public profile
 * disagree is *systematically* mis-ranked, and the disagreement is always
 * traceable to a specific, named factor.
 *
 * `overallRating`/`potentialRating` themselves are never read by this
 * module's scoring - the whole point is that the Big Board is blind to the
 * truth, the same way a real draft class's public perception is.
 */

export interface BigBoardProspect {
  id: string;
  age: number;
  position: string;
  heightInches: number | null;
  isInternational: boolean;
}

export interface PublicEvaluationFactors {
  ageScore: number;
  physicalScore: number;
  competitionScore: number;
  productionScore: number;
  /** Null until revealed - see `revealTournamentPerformance`. */
  tournamentScore: number | null;
  /** The weighted sum of every currently-visible factor above - what the Big Board actually ranks on. */
  publicEvaluation: number;
}

const PROTOTYPICAL_HEIGHT_INCHES: Record<string, number> = {
  PG: 74,
  SG: 76,
  SF: 78,
  PF: 81,
  C: 84,
};

// Weights sum to 1.0 across the factors visible before the tournament
// reveal; the reveal folds tournamentScore in at its own weight and
// renormalizes, rather than diluting every other factor by a fixed amount
// regardless of how much weight the window has already committed to them.
const WEIGHTS = {
  age: 0.22,
  physical: 0.13,
  competition: 0.2,
  production: 0.25,
  tournament: 0.2,
};

/**
 * Younger reads as more upside to a public evaluator, regardless of
 * whether the prospect's true ceiling actually justifies it - the
 * documented bias from Part 3.1's table. Centered so a typical one-and-done
 * (19) scores near the top of this factor and a five-year senior (23+)
 * scores near the bottom.
 */
function ageScore(age: number): number {
  return Math.max(0, Math.min(100, 100 - (age - 19) * 18));
}

/**
 * Prototypical size for the position is overvalued - a center closer to
 * the position's expected height reads better publicly than an undersized
 * one, independent of actual ability.
 */
function physicalScore(position: string, heightInches: number | null): number {
  // A save created before the Draft Experience Redesign shipped height data
  // can still have prospects with no height on file - neutral rather than
  // penalized, since "unknown" isn't the same public signal as "undersized."
  if (heightInches == null) return 65;
  const prototypical = PROTOTYPICAL_HEIGHT_INCHES[position] ?? 78;
  const diff = Math.abs(heightInches - prototypical);
  return Math.max(0, 100 - diff * 12);
}

/**
 * Competition level / public visibility (Part 3.1's table treats these as
 * one combined bias): a domestic college prospect gets far more media
 * coverage than an international one, so international prospects are
 * systematically under-scored here regardless of true ability - this is
 * exactly the "he's 22 and played in Lithuania, so nobody's on him" case
 * the design calls out by name. `noiseMultiplier` (Phase 4 class character
 * variance) widens the spread around the base for a flatter/more chaotic
 * class, e.g. DEEP_BUT_FLAT.
 */
function competitionScore(
  rng: () => number,
  isInternational: boolean,
  noiseMultiplier: number,
): number {
  const base = isInternational ? 35 : 65;
  return Math.max(0, Math.min(100, base + randomInRange(rng, -15, 15) * noiseMultiplier));
}

/**
 * Stands in for a generated per-prospect stat line (Part 3.1: "overvalues
 * counting stats; a productive low-ceiling player outranks a raw
 * high-ceiling one"). Deliberately uncorrelated with true rating - this is
 * the single biggest source of the Big Board's honest disagreement with
 * reality, the same way a real box score doesn't measure NBA translation.
 * Widening this range (rather than just competitionScore's) is what a
 * `noiseMultiplier` above 1 mostly captures, since production is the
 * highest-weighted factor.
 */
function productionScore(rng: () => number, noiseMultiplier: number): number {
  const midpoint = 60;
  const raw = randomInRange(rng, 20, 100);
  return Math.max(0, Math.min(100, midpoint + (raw - midpoint) * noiseMultiplier));
}

/**
 * A public shock, not a private read - see `revealTournamentPerformance`
 * for when this becomes visible. Independent of every other factor, same
 * "uncorrelated with truth" reasoning as production.
 */
function tournamentScore(rng: () => number, noiseMultiplier: number): number {
  const midpoint = 50;
  const raw = randomInRange(rng, 0, 100);
  return Math.max(0, Math.min(100, midpoint + (raw - midpoint) * noiseMultiplier));
}

function weightedAverage(entries: [number, number][]): number {
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const weightedSum = entries.reduce((sum, [value, weight]) => sum + value * weight, 0);
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * `tournamentRevealed` is the caller's own signal - Phase 3's refinement
 * (see docs/FEATURE_REQUESTS.md) ties this to real scouting activity
 * having started this window, not a calendar tick that doesn't exist yet.
 * Before reveal, the public evaluation is computed from the other four
 * factors alone (renormalized), so the board is well-formed at window-open
 * and then visibly shifts once the tournament factor folds in - a public
 * repricing the player can actually notice and reason about.
 */
export function computePublicEvaluationFactors(
  prospect: BigBoardProspect,
  tournamentRevealed: boolean,
  /** Class-character variance (Scouting Pillar Redesign, Phase 4) - widens/narrows the noise-driven factors below. 1 for a BALANCED class. */
  noiseMultiplier = 1,
): PublicEvaluationFactors {
  const rng = createSeededRandom(`${prospect.id}-big-board`);
  const age = ageScore(prospect.age);
  const physical = physicalScore(prospect.position, prospect.heightInches);
  const competition = competitionScore(rng, prospect.isInternational, noiseMultiplier);
  const production = productionScore(rng, noiseMultiplier);
  const tournament = tournamentScore(rng, noiseMultiplier);

  const visible: [number, number][] = [
    [age, WEIGHTS.age],
    [physical, WEIGHTS.physical],
    [competition, WEIGHTS.competition],
    [production, WEIGHTS.production],
  ];
  if (tournamentRevealed) visible.push([tournament, WEIGHTS.tournament]);

  return {
    ageScore: age,
    physicalScore: physical,
    competitionScore: competition,
    productionScore: production,
    tournamentScore: tournamentRevealed ? tournament : null,
    publicEvaluation: weightedAverage(visible),
  };
}

export interface BigBoardEntry {
  prospectId: string;
  publicRank: number;
  publicEvaluation: number;
}

/**
 * The actual Big Board: every prospect ranked by `publicEvaluation`
 * (highest first), never by true rating. Ties break on id for a stable,
 * deterministic order.
 */
export function computeBigBoard(
  prospects: readonly BigBoardProspect[],
  tournamentRevealed: boolean,
  noiseMultiplier = 1,
): BigBoardEntry[] {
  return prospects
    .map((p) => ({
      prospectId: p.id,
      publicEvaluation: computePublicEvaluationFactors(p, tournamentRevealed, noiseMultiplier)
        .publicEvaluation,
    }))
    .sort(
      (a, b) => b.publicEvaluation - a.publicEvaluation || a.prospectId.localeCompare(b.prospectId),
    )
    .map((entry, index) => ({ ...entry, publicRank: index + 1 }));
}
