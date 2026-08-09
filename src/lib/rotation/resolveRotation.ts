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

  // Everyone the user did not place, best first.
  const autoRanked = buildAutoRotation(unslotted).map(({ player }) => player);

  // Fill whichever slots are still open, best call-up to the lowest open
  // rank. A user who slots one player at 3 and leaves the rest to the engine
  // gets exactly that: their pick at 3, the best of the others around them.
  let autoIndex = 0;
  for (let slot = 0; slot < MAX_ROTATION_SIZE; slot++) {
    if (slotted.has(slot)) continue;
    const next = autoRanked[autoIndex];
    if (!next) break;
    slotted.set(slot, next);
    autoIndex++;
  }

  const ordered = [...slotted.entries()].sort(([a], [b]) => a - b).map(([, player]) => player);

  // Slide call-ups down past anyone they are clearly worse than.
  //
  // Filling open ranks in ascending order is right when the user simply left
  // gaps, but wrong when a slot came open because its owner is injured or was
  // traded: the vacancy is at the TOP of the chart, so the next man off the
  // bench inherited starter minutes. Measured, that put the thirteenth-best
  // player on 35 minutes the moment a starter went down.
  //
  // Only call-ups move, and only downward, so a player the user actually
  // placed never loses ground to someone worse - the rest of the chart simply
  // closes up, which is what a real bench does.
  for (let i = 0; i < ordered.length - 1; i++) {
    const here = ordered[i];
    if (explicitlySlotted.has(here.leaguePlayerId)) continue;
    for (let j = i + 1; j < ordered.length; j++) {
      if (ordered[j].overallRating - here.overallRating < DISPLACEMENT_MARGIN) break;
      ordered[j - 1] = ordered[j];
      ordered[j] = here;
    }
  }

  // Anyone still unplaced was shut out because every slot was already claimed.
  // Left there, a newly acquired player contributes NOTHING - not reduced
  // minutes, zero - so trading for the best player in the league moved team
  // strength by exactly 0.00 and he never appeared in a box score. Every trade
  // and signing writes rotationSlot: null, so a saved rotation silently froze
  // the roster it was saved against.
  for (let i = autoIndex; i < autoRanked.length; i++) {
    const candidate = autoRanked[i];
    const weakest = ordered.reduce((worst, p) =>
      p.overallRating < worst.overallRating ? p : worst,
    );
    // A player the user deliberately slotted is protected unless the newcomer
    // is *clearly* better. Benching a star or starting a favoured role player
    // is a legitimate choice, and the gap there is usually a point or two -
    // whereas a genuine acquisition outclasses the last man by a wide margin.
    const margin = explicitlySlotted.has(weakest.leaguePlayerId) ? DISPLACEMENT_MARGIN : 1;
    // `autoRanked` is best-first, so once one candidate fails to clear the
    // bar, no later one can either.
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
