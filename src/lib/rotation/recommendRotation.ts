import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import { buildAutoRotation, RANK_MINUTE_WEIGHTS } from "./autoRotation";

export interface RecommendedRotationEntry {
  leaguePlayerId: string;
  rank: number;
  suggestedMinutes: number;
}

/**
 * Pure and client-safe (no DB access) - powers both the "Fill open slots"
 * and "Reset to recommended" UI actions by re-running the exact same
 * automatic ranking every CPU team already uses, normalized to real
 * 240-team-minutes so the suggested numbers are usable as-is rather than
 * relative weights.
 */
export function recommendRotation(roster: RosterPlayerForSimulation[]): RecommendedRotationEntry[] {
  const rotation = buildAutoRotation(roster);
  const totalWeight = rotation.reduce((sum, { rank }) => sum + (RANK_MINUTE_WEIGHTS[rank] ?? 0), 0);
  if (totalWeight <= 0) return [];

  return rotation.map(({ player, rank }) => ({
    leaguePlayerId: player.leaguePlayerId,
    rank,
    suggestedMinutes: Math.round(((RANK_MINUTE_WEIGHTS[rank] ?? 0) / totalWeight) * 240),
  }));
}
