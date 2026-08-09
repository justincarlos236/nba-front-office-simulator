import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import { buildAutoRotation, MAX_ROTATION_SIZE } from "./autoRotation";

export interface ResolvedRotationEntry {
  player: RosterPlayerForSimulation;
  /** 0-based depth position - drives the RANK_MINUTE_WEIGHTS fallback in boxScore.ts and the derived role label. */
  rank: number;
  /** The user's assigned target, or null if this player's minutes should fall back to the rank-based default. */
  targetMinutes: number | null;
}

/**
 * The single place that decides "who plays, in what order, for about how
 * long" - used identically by box-score minute allocation and by
 * rotation-adjusted team strength, so a user's depth chart drives both
 * consequences from one source of truth.
 *
 * When nobody on the roster has a custom rotationSlot, this returns
 * exactly what buildAutoRotation always returned (targetMinutes always
 * null) - byte-identical to pre-Rotation-Management behavior, which is
 * what every CPU team and every untouched user roster relies on forever.
 */
/**
 * How much better an unplaced player must be to take a deliberately chosen
 * player's rotation spot. Wide enough that starting a favoured role player
 * survives (that gap is typically a point or two), narrow enough that any real
 * acquisition gets on the floor.
 */
const DISPLACEMENT_MARGIN = 5;

function slotOf(player: RosterPlayerForSimulation): number | null {
  return player.rotationSlot ?? null;
}

function targetMinutesOf(player: RosterPlayerForSimulation): number | null {
  return player.targetMinutesPerGame ?? null;
}

export function resolveRotation(roster: RosterPlayerForSimulation[]): ResolvedRotationEntry[] {
  const hasCustomRotation = roster.some((p) => slotOf(p) !== null);
  if (!hasCustomRotation) {
    return buildAutoRotation(roster).map(({ player, rank }) => ({
      player,
      rank,
      targetMinutes: null,
    }));
  }

  const slotted = new Map<number, RosterPlayerForSimulation>();
  const explicitlySlotted = new Set<string>();
  const unslotted: RosterPlayerForSimulation[] = [];
  for (const player of roster) {
    const slot = slotOf(player);
    if (slot !== null && slot >= 0 && slot < MAX_ROTATION_SIZE && !slotted.has(slot)) {
      slotted.set(slot, player);
      explicitlySlotted.add(player.leaguePlayerId);
    } else {
      // Out of range, or a collision with an earlier player claiming the
      // same slot (shouldn't happen - the save action always sends a
      // fully reordered list - but defensively falls back to auto-rank
      // rather than silently dropping the player from the rotation).
      unslotted.push(player);
    }
  }

  // Fill whichever numeric slots are still open with the best of the
  // unslotted remainder, in ascending slot order.
  const autoRanked = buildAutoRotation(unslotted).map(({ player }) => player);
  let autoIndex = 0;
  for (let slot = 0; slot < MAX_ROTATION_SIZE; slot++) {
    if (slotted.has(slot)) continue;
    const next = autoRanked[autoIndex];
    if (!next) break;
    slotted.set(slot, next);
    autoIndex++;
  }

  // The depth chart as the user actually ordered it, gaps already filled.
  const ordered = [...slotted.entries()].sort(([a], [b]) => a - b).map(([, player]) => player);

  // Anyone still unplaced was shut out because the twelve slots were already
  // claimed. Left there, a newly acquired player contributes NOTHING - not
  // reduced minutes, zero - so trading for the best player in the league moved
  // team strength by exactly 0.00 and he never appeared in a box score. Every
  // trade and signing writes rotationSlot: null, so a saved rotation silently
  // froze the roster it was saved against.
  //
  // A clearly better player now enters at the depth his rating warrants,
  // pushing the weakest man out of the rotation. The user's ordering still
  // holds among everyone they actually chose; what no longer holds is a stale
  // slot list outranking a player who is plainly better, which is never what
  // anyone intended.
  for (let i = autoIndex; i < autoRanked.length; i++) {
    const candidate = autoRanked[i];
    const weakest = ordered.reduce(
      (worst, p) => (p.overallRating < worst.overallRating ? p : worst),
      ordered[0],
    );
    if (!weakest) break;

    // A player the user deliberately slotted is protected unless the newcomer
    // is *clearly* better. Benching a star or starting a favourite role player
    // is a legitimate choice, and the gap there is usually a point or two -
    // whereas a genuine acquisition outclasses the last man by a wide margin.
    // An auto-filled player was never chosen by anyone, so any upgrade takes
    // their place.
    const margin = explicitlySlotted.has(weakest.leaguePlayerId) ? DISPLACEMENT_MARGIN : 1;
    // `autoRanked` is best-first, so once one candidate fails to clear the bar,
    // no later one can either.
    if (candidate.overallRating - weakest.overallRating < margin) break;

    ordered.splice(ordered.indexOf(weakest), 1);
    const insertAt = ordered.findIndex((p) => p.overallRating < candidate.overallRating);
    ordered.splice(insertAt === -1 ? ordered.length : insertAt, 0, candidate);
  }

  return ordered.map((player, rank) => ({
    player,
    rank,
    // A player the user never slotted has no target of their own, so their
    // minutes fall back to the rank curve for whatever depth they landed at.
    targetMinutes: explicitlySlotted.has(player.leaguePlayerId) ? targetMinutesOf(player) : null,
  }));
}
