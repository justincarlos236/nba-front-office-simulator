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
/**
 * The two roles a lineup cannot do without.
 *
 * Basketball is played in three dimensions and this model only knew about
 * ratings: twelve point guards and no centre rated identically to a balanced
 * roster, to the decimal.
 *
 * **Not every position is equally replaceable, and an earlier version of this
 * missed that.** Grouping PG with the wings meant a rotation with no point
 * guard but plenty of SG/SF paid nothing, and lumping C with PF meant a team
 * with no true centre paid nothing either. Those are the two hardest jobs to
 * cover: somebody has to create off the dribble, and somebody has to defend
 * the rim. A shooting guard and a small forward trade places all night; a
 * centre cannot bring the ball up.
 *
 * So the floors are on **creation** and **the rim**, and each accepts partial
 * cover from its neighbour - a shooting guard can run some point, a power
 * forward can play some centre, neither as well as the real thing.
 */
const CREATION_FLOOR = 0.18;
const RIM_FLOOR = 0.18;

/** How much a neighbouring position counts toward a role it is not. */
const SUBSTITUTE_CREDIT = 0.35;

/**
 * Rating points lost when a role is uncovered outright.
 *
 * Six points is roughly a contender becoming a play-in team, which is about
 * what having nobody who can run an offence - or nobody who can protect the
 * rim - should cost. Capped in total so a lineup that is broken twice over is
 * severely punished without becoming absurd.
 */
const MAX_ROLE_PENALTY = 6;
const MAX_TOTAL_PENALTY = 9;

/** Minutes covering each role, counting neighbours at partial credit. */
function rolePenalty(
  rotation: { position: string; weight: number }[],
  totalWeight: number,
): number {
  if (totalWeight <= 0) return 0;
  const minutesAt = (positions: string[]) =>
    rotation.filter((e) => positions.includes(e.position)).reduce((sum, e) => sum + e.weight, 0);

  const creation = (minutesAt(["PG"]) + SUBSTITUTE_CREDIT * minutesAt(["SG"])) / totalWeight;
  const rim = (minutesAt(["C"]) + SUBSTITUTE_CREDIT * minutesAt(["PF"])) / totalWeight;

  const shortfall = (share: number, floor: number) => Math.max(0, (floor - share) / floor);
  const total =
    MAX_ROLE_PENALTY * shortfall(creation, CREATION_FLOOR) +
    MAX_ROLE_PENALTY * shortfall(rim, RIM_FLOOR);
  return Math.min(MAX_TOTAL_PENALTY, total);
}

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
  const weighted: { position: string; weight: number }[] = [];

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
    weighted.push({ position: player.position, weight });
  }

  if (weightTotal <= 0) return 0;
  return weightedSum / weightTotal - rolePenalty(weighted, weightTotal);
}
