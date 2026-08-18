import { SCOUTING_DEPTH_LABEL } from "@/lib/draft/scoutingAssignments";

/**
 * The Long-Tail Payoff (Scouting Pillar Redesign, Phase 5 -
 * docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.5, "years later, via existing
 * systems"). Fires whenever a player becomes an All-Star, checked against
 * the Scouting Depth the user actually reached on him back at draft time -
 * "we ignored this player all year... was that a mistake?" is unanswerable
 * in the moment and devastating (or vindicating) seasons later.
 *
 * Two distinct narrative types (confirmed 2026-08-06) rather than one beat
 * with a boolean flip - they're genuinely different stories:
 *
 * - GOT_AWAY: a low-Depth prospect who ended up on a different team and is
 *   now thriving. Regret. "The one that got away."
 * - GAMBLE_PAID_OFF: a low-Depth prospect the user themselves drafted
 *   anyway, who's now thriving. Vindication of instinct/risk-taking, not
 *   luck - the design's own framing explicitly rejects "you got lucky" as
 *   the story here.
 *
 * A prospect scouted to real Depth (2+) who becomes an All-Star isn't a
 * story at all - the user already knew what they had. This only fires for
 * the genuine surprises.
 */

export type DraftHindsightType = "GOT_AWAY" | "GAMBLE_PAID_OFF";

// Depth 0 (Unknown) or 1 (Seen) - genuinely light diligence, not merely
// "less than maximum." Depth 2 (Studied) already means real assignments
// were spent; that's not an oversight story anymore.
const UNDER_SCOUTED_MAX_DEPTH = 1;

export interface DraftHindsightInput {
  scoutingDepthAtDraft: number;
  /** True if this player is currently on the user's own controlled team. */
  isOnUserTeam: boolean;
}

export function classifyDraftHindsight(input: DraftHindsightInput): DraftHindsightType | null {
  if (input.scoutingDepthAtDraft > UNDER_SCOUTED_MAX_DEPTH) return null;
  return input.isOnUserTeam ? "GAMBLE_PAID_OFF" : "GOT_AWAY";
}

export function describeDraftHindsight(
  type: DraftHindsightType,
  playerName: string,
  scoutingDepthAtDraft: number,
  currentTeamLabel: string,
): string {
  const depthLabel = SCOUTING_DEPTH_LABEL[scoutingDepthAtDraft] ?? "Unknown";
  if (type === "GOT_AWAY") {
    return `${playerName} barely registered on your board on draft night (${depthLabel}) - he's now an All-Star for ${currentTeamLabel}.`;
  }
  return `${playerName} was a real gamble on draft night - you barely scouted him (${depthLabel}) and took him anyway. He's now an All-Star for ${currentTeamLabel}.`;
}
