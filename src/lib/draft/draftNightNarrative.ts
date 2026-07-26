/**
 * Draft Experience Redesign - reach/steal detection. Directly forked from
 * `lotteryPresentation.ts`'s `computeMovement`/`detectNotableMovement`
 * shape: this is narration over a real, already-decided outcome (the CPU
 * draft-AI's actual scoring output, see `draftAi.ts`), never a scripted or
 * fabricated surprise. Only a real threshold crossing is a story.
 */

// A prospect has to be drafted at least this many slots off their
// rating-implied expected rank (out of 60) for it to be a real story, not
// just the ordinary shuffle every draft has - matching the lottery's own
// ~29%-of-field threshold ratio (4 of 14 seats).
const NOTABLE_DRAFT_MOVEMENT_THRESHOLD = 15;

export interface RankableProspect {
  id: string;
  overallRating: number;
}

/** Rank 1 = the class's best prospect by overallRating, purely a re-derivation of the class's own generation-time ordering. */
export function computeExpectedDraftRank(
  classProspects: readonly RankableProspect[],
): Map<string, number> {
  const ranked = [...classProspects].sort((a, b) => b.overallRating - a.overallRating);
  const rankById = new Map<string, number>();
  ranked.forEach((p, i) => rankById.set(p.id, i + 1));
  return rankById;
}

export type SelectionNarrative = "REACH" | "STEAL" | null;

/**
 * `expectedRank` = where this prospect's own rating says they belonged;
 * `overallPickNumber` = where they actually went. A much-lower pick number
 * than their rank implied is a reach (the team went and got them early);
 * a much-higher pick number is a steal (they fell, and whoever's left
 * standing found a gem).
 */
export function classifySelection(
  expectedRank: number,
  overallPickNumber: number,
): SelectionNarrative {
  const gap = expectedRank - overallPickNumber;
  if (gap >= NOTABLE_DRAFT_MOVEMENT_THRESHOLD) return "REACH";
  if (gap <= -NOTABLE_DRAFT_MOVEMENT_THRESHOLD) return "STEAL";
  return null;
}
