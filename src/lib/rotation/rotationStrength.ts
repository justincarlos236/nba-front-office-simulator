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
 * Minutes a rotation is expected to give its frontcourt.
 *
 * Two of the five men on the floor are a power forward and a centre, so a
 * balanced rotation spends about 40% of its minutes there. Basketball is
 * played in three dimensions and this model only knew about ratings: twelve
 * point guards and no centre rated *identically* to a balanced roster, to the
 * decimal, so a lineup that could not rebound or protect the rim won just as
 * often as one that could.
 *
 * These are floors, not targets, and the difference matters. Measured against
 * an ideal 40% share, an ordinary rotation whose bigs happen to sit lower in
 * the order paid a penalty for being slightly small - which punishes small-ball
 * rather than a broken lineup, and small-ball is a real and sometimes correct
 * choice. Nothing is charged until a group falls below the floor here, so a
 * normal rotation anywhere from small to big pays nothing at all, and only a
 * genuinely unplayable shape is charged.
 */
const FRONTCOURT_MINUTES_FLOOR = 0.25;
const PERIMETER_MINUTES_FLOOR = 0.45;

/**
 * Rating points lost when a group is missing outright.
 *
 * Deliberately meaningful without being fatal: six points is the difference
 * between a contender and a play-in team, which is about what starting nobody
 * over 6'6" should cost. It is not a cliff - the penalty scales with how far
 * short the group falls, so most rosters never notice it.
 */
const MAX_IMBALANCE_PENALTY = 6;

const FRONTCOURT: ReadonlySet<string> = new Set(["PF", "C"]);

/** How far short of its expected minutes each group falls, 0 when covered. */
function imbalancePenalty(
  rotation: { player: { position: string }; weight: number }[],
  totalWeight: number,
): number {
  if (totalWeight <= 0) return 0;
  const frontcourtWeight = rotation
    .filter((e) => FRONTCOURT.has(e.player.position))
    .reduce((sum, e) => sum + e.weight, 0);

  const frontcourtShare = frontcourtWeight / totalWeight;
  const perimeterShare = 1 - frontcourtShare;

  const frontcourtShortfall = Math.max(
    0,
    (FRONTCOURT_MINUTES_FLOOR - frontcourtShare) / FRONTCOURT_MINUTES_FLOOR,
  );
  const perimeterShortfall = Math.max(
    0,
    (PERIMETER_MINUTES_FLOOR - perimeterShare) / PERIMETER_MINUTES_FLOOR,
  );

  return MAX_IMBALANCE_PENALTY * Math.max(frontcourtShortfall, perimeterShortfall);
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
  const weighted: { player: { position: string }; weight: number }[] = [];

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
    weighted.push({ player: { position: player.position }, weight });
  }

  if (weightTotal <= 0) return 0;
  return weightedSum / weightTotal - imbalancePenalty(weighted, weightTotal);
}
