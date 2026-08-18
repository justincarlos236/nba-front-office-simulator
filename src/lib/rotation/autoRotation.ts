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

/** A full game's team-minutes: 5 players on the floor for 48 minutes. */
export const TEAM_MINUTES = 240;

/**
 * The most one player may be assigned for a single game - a full regulation 48.
 *
 * Lives here rather than in the action so the client board, the server action
 * and the engine clamp all read one value; a board that let a user type a
 * number the action would silently clamp is a save that does not do what it
 * said. Was 40, which made "ride your best player" unavailable rather than
 * costly. See MAX_PLAYER_MINUTES in src/lib/simulation/boxScore.ts for the
 * engine-side clamp this must stay in step with.
 */
export const MAX_TARGET_MINUTES = 48;

/**
 * The workload above which a minute stops returning full value.
 *
 * Lives beside the ceiling because the two only make sense together: raising
 * the ceiling to 48 is what created a range that needed pricing. See
 * `effectiveMinutes` in ./rotationStrength.ts for the discount itself and the
 * evidence behind the number - briefly, no NBA player has averaged 40 minutes
 * for a season since the 1970s despite nothing forbidding it, which is what
 * coaches converging on 36-38 looks like from the outside.
 *
 * Exported so the rotation board can tell the user which of his players are
 * past it. A cost he cannot see is not a decision he made.
 */
export const SUSTAINABLE_MINUTES = 36;

/**
 * How many RANK_MINUTE_WEIGHTS units one minute of intended playing time is
 * worth, so an absolute `targetMinutesPerGame` can share a weighting pool with
 * the relative rank curve above.
 *
 * This conversion is mandatory anywhere the two are mixed. `RANK_MINUTE_WEIGHTS`
 * spans 0.08-1.42 while `targetMinutesPerGame` spans roughly 8-40, so using a
 * raw minutes value as a weight makes one player worth ~27x his rotation-mates.
 * `boxScore.ts` always converted; `rotationStrength.ts` did not, which inflated
 * team strength by up to 8 rating points (~11 wins) for any partially
 * configured rotation. Living beside the weights it converts, and exported, so
 * the two consumers cannot drift apart again.
 */
export const WEIGHT_PER_MINUTE = FULL_ROTATION_WEIGHT_SUM / TEAM_MINUTES;

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
