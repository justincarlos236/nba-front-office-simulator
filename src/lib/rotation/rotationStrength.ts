import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import { resolveRotation } from "./resolveRotation";
import { RANK_MINUTE_WEIGHTS, WEIGHT_PER_MINUTE } from "./autoRotation";

/**
 * "How strong is this team tonight, given who is actually slated to play and
 * for how long" - used by `computeLeagueTeamStrengths`, the one function
 * feeding per-game win probability and opponent-strength adjustment.
 *
 * Distinct from `computeTeamStrength` (src/lib/simulation/teamStrength.ts),
 * which answers "how good is this roster on paper" and is still what
 * SeasonExpectation seeding and All-Star exhibition squads want.
 *
 * A player left outside the resolved rotation contributes nothing to tonight's
 * strength - the whole point of "who is playing" rather than "who is rostered."
 * `resolveRotation` guarantees that a player good enough to belong is never
 * outside it, whatever the saved slot list says.
 */
export function computeRotationAdjustedStrength(roster: RosterPlayerForSimulation[]): number {
  if (roster.length === 0) return 0;

  // ONE CURVE FOR ALL THIRTY TEAMS.
  //
  // This used to branch: a roster with no custom rotation fell through to
  // `computeTeamStrength` (all 15 players, flat 0.4 bench weight), while a
  // roster the user had touched was rated on the 12-man rotation curve. CPU
  // teams never set a rotation, so they were *permanently* on the first model
  // and user teams moved to the second the moment they opened the Rotation
  // screen - worth about +2.4 strength (~3 wins) for opening a page and saving.
  //
  // It also meant roster depth was scored inconsistently: under the old
  // fallback, carrying fewer players raised strength, because a 15-man average
  // is dragged down by players a 12-man rotation simply excludes.
  //
  // `resolveRotation` already falls back to `buildAutoRotation` when nobody has
  // a slot, so every team is now rated on who would actually play.
  const rotation = resolveRotation(roster);
  let weightedSum = 0;
  let weightTotal = 0;

  for (const { player, rank, targetMinutes } of rotation) {
    // `targetMinutes` is absolute minutes (8-40); RANK_MINUTE_WEIGHTS is a
    // relative curve (0.08-1.42). Mixing them raw made one player with a
    // custom target worth ~27x his rotation-mates and inflated team strength
    // by up to 8 rating points. `boxScore.ts` always applied this conversion;
    // this function did not. See WEIGHT_PER_MINUTE in autoRotation.ts.
    const weight =
      targetMinutes !== null ? targetMinutes * WEIGHT_PER_MINUTE : (RANK_MINUTE_WEIGHTS[rank] ?? 0);
    weightedSum += player.overallRating * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
