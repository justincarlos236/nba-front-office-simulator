import { SCOUTING_DEPTH_LABEL } from "@/lib/draft/scoutingAssignments";
import type { ResolvableHiddenAxis } from "@/lib/draft/scoutingProfile";

/**
 * Post-Draft Resolution (Scouting Pillar Redesign, Phase 5 -
 * docs/SCOUTING_PILLAR_DESIGN.md Part 3.5). Shown once, right when the
 * user makes a pick - deliberately shows only what the player already
 * earned the right to know, never `potentialRating`, never a "steal"/
 * "bust" verdict. Whether the pick was actually right emerges over real
 * seasons through player development, exactly like every other player -
 * this recap is a receipt for the bet, not a grade on it.
 *
 * "Scouting resolves what you knew; development resolves what was true."
 */
export interface DraftResolutionSummary {
  depthReached: number;
  depthLabel: string;
  myBoardRank: number | null;
  bigBoardRank: number;
  /** Positive = your board rated him higher than public consensus did - you saw something the crowd didn't (or didn't). Never labeled a verdict, just a fact. */
  rankGapFromBigBoard: number | null;
  resolvedAxes: ResolvableHiddenAxis[];
  unresolvedAxes: ResolvableHiddenAxis[];
}

const ALL_HIDDEN_AXES: ResolvableHiddenAxis[] = ["WORK_ETHIC", "INJURY_OUTLOOK"];

export function computeDraftResolutionSummary(input: {
  scoutingDepth: number;
  resolvedHiddenTraits: readonly string[];
  /** Null if this prospect was never bookmarked to My Board. */
  myBoardRank: number | null;
  bigBoardRank: number;
}): DraftResolutionSummary {
  const resolvedAxes = ALL_HIDDEN_AXES.filter((axis) => input.resolvedHiddenTraits.includes(axis));
  const unresolvedAxes = ALL_HIDDEN_AXES.filter(
    (axis) => !input.resolvedHiddenTraits.includes(axis),
  );

  return {
    depthReached: input.scoutingDepth,
    depthLabel: SCOUTING_DEPTH_LABEL[input.scoutingDepth] ?? "Unknown",
    myBoardRank: input.myBoardRank,
    bigBoardRank: input.bigBoardRank,
    rankGapFromBigBoard: input.myBoardRank != null ? input.bigBoardRank - input.myBoardRank : null,
    resolvedAxes,
    unresolvedAxes,
  };
}
