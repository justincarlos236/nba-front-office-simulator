import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { resolveRotation } from "./resolveRotation";
import { RANK_MINUTE_WEIGHTS } from "./autoRotation";

/**
 * Deliberately a separate function from computeTeamStrength
 * (src/lib/simulation/teamStrength.ts), not a modification of it -
 * computeTeamStrength answers "how good is this roster on paper" and stays
 * exactly as it is for every consumer that evaluates roster talent
 * (SeasonExpectation seeding in league.ts/offseason.ts, All-Star Weekend's
 * exhibition squads). This function answers a different question - "how
 * strong is this team tonight, given who's actually slated to play and for
 * how long" - and is used only by computeLeagueTeamStrengths, the one
 * function that feeds real per-game win probability and opponent-strength
 * adjustment.
 *
 * For an uncustomized roster (no player has a rotationSlot set - true for
 * every CPU team, forever, and any user team before they touch Rotation
 * Management), this delegates straight to computeTeamStrength on the full
 * roster - not an approximation of it, the literal same call - so nothing
 * about existing win-probability/opponent-adjustment behavior changes
 * until a user actually opts in. computeTeamStrength weights its own top 9
 * by rating with a flat bench weight for the rest and never drops anyone;
 * resolveRotation caps at 12 and weights by resolved minutes - two
 * deliberately different curves that would not coincide numerically, so
 * this only switches to the rotation-based curve once there's an actual
 * custom rotation to reflect. Once customized, a player left outside the
 * resolved rotation entirely (deeper than the configured/auto-filled
 * slots) correctly contributes nothing to tonight's strength - the whole
 * point of "who's actually playing" rather than "who's on the roster."
 */
export function computeRotationAdjustedStrength(roster: RosterPlayerForSimulation[]): number {
  if (roster.length === 0) return 0;

  const hasCustomRotation = roster.some((p) => (p.rotationSlot ?? null) !== null);
  if (!hasCustomRotation) {
    return computeTeamStrength(roster.map((p) => p.overallRating));
  }

  const rotation = resolveRotation(roster);
  let weightedSum = 0;
  let weightTotal = 0;

  for (const { player, rank, targetMinutes } of rotation) {
    const weight = targetMinutes ?? RANK_MINUTE_WEIGHTS[rank] ?? 0;
    weightedSum += player.overallRating * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
