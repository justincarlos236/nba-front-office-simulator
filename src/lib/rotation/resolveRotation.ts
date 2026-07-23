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

  // Auto-rank the unslotted remainder exactly like a fresh roster, then
  // fill whichever numeric slots are still open, in ascending order - the
  // same "fill the gaps, don't disturb what's already set" behavior a
  // newly-acquired player or a freshly-healthy returning player needs.
  const autoRanked = buildAutoRotation(unslotted).map(({ player }) => player);
  let autoIndex = 0;
  for (let slot = 0; slot < MAX_ROTATION_SIZE; slot++) {
    if (slotted.has(slot)) continue;
    const next = autoRanked[autoIndex];
    if (!next) break;
    slotted.set(slot, next);
    autoIndex++;
  }

  return [...slotted.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rank, player]) => ({
      player,
      rank,
      targetMinutes: explicitlySlotted.has(player.leaguePlayerId) ? targetMinutesOf(player) : null,
    }));
}
