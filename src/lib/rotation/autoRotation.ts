import type { Position } from "@/generated/prisma/client";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";

/**
 * The fully-automatic depth-chart ranking every team used before Rotation
 * Management existed, and what every CPU team (and any user roster with no
 * custom rotation) still uses forever: best player per position starts,
 * backfilled by rating, remaining players ranked by rating. Lives here
 * (not boxScore.ts) so resolveRotation.ts can call it without a circular
 * import - boxScore.ts now imports this instead of defining it.
 */
export const MAX_ROTATION_SIZE = 12;

// Base minute-weight per rotation rank (0 = best player), tapering from
// starters through a 6th-man bump down to deep bench. Shared by box-score
// minute allocation (boxScore.ts) and rotation-adjusted team strength
// (rotationStrength.ts) - both fall back to this exact curve for any
// player without a custom targetMinutesPerGame.
export const RANK_MINUTE_WEIGHTS = [
  1.42, 1.35, 1.28, 1.2, 1.12, 0.95, 0.72, 0.55, 0.4, 0.28, 0.15, 0.08,
];

const FULL_ROTATION_WEIGHT_SUM = RANK_MINUTE_WEIGHTS.reduce((sum, w) => sum + w, 0);

/**
 * "What's the default expected minutes for whoever occupies this depth
 * position" - independent of any specific roster, since the engine's own
 * fallback (RANK_MINUTE_WEIGHTS[rank]) is the same curve for any player
 * without a custom target regardless of identity. Used by the rotation UI
 * to pre-fill/suggest a minutes value for a given position in the depth
 * chart, and to compute an accurate running-minutes-total even for slots
 * the user hasn't explicitly typed a number into yet.
 */
export function suggestedMinutesForRank(rank: number): number {
  return Math.round(((RANK_MINUTE_WEIGHTS[rank] ?? 0) / FULL_ROTATION_WEIGHT_SUM) * 240);
}

const POSITIONS: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];

export interface AutoRotationEntry {
  player: RosterPlayerForSimulation;
  rank: number;
}

export function buildAutoRotation(roster: RosterPlayerForSimulation[]): AutoRotationEntry[] {
  const used = new Set<string>();
  const starters: RosterPlayerForSimulation[] = [];

  for (const pos of POSITIONS) {
    const candidate = roster
      .filter((p) => p.position === pos && !used.has(p.leaguePlayerId))
      .sort((a, b) => b.overallRating - a.overallRating)[0];
    if (candidate) {
      starters.push(candidate);
      used.add(candidate.leaguePlayerId);
    }
  }

  const remaining = roster
    .filter((p) => !used.has(p.leaguePlayerId))
    .sort((a, b) => b.overallRating - a.overallRating);

  // Backfill any unfilled starting slot (e.g. no true center on the
  // roster) with the best remaining player regardless of position.
  while (starters.length < 5 && remaining.length > 0) {
    const next = remaining.shift();
    if (!next) break;
    starters.push(next);
  }

  return [...starters, ...remaining].slice(0, MAX_ROTATION_SIZE).map((player, rank) => ({
    player,
    rank,
  }));
}
