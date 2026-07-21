import { getPlayerValueTier } from "../valuation/playerValueTier";

/**
 * Dynamically-recognized roster needs, reused by the trade-AI evaluation
 * engine (Phase 11c) to give extra value to players/picks that actually
 * fill a gap. Deliberately narrower than the design brief's full list
 * ("star scorer, rim protector, point guard, wing defender, shooting,
 * bench depth") - "shooting" specifically has no real signal anywhere in
 * this data model (no 3PT/shot-profile stat exists on `LeaguePlayer` or
 * generated draft prospects, only `overallRating`/`potentialRating`/
 * `position`/age), so faking a "shooting need" would be pure noise rather
 * than a documented simplification like the rest of this layer. The other
 * five needs are all derivable from position + rating, which the game
 * actually tracks.
 */
export type TeamNeed =
  "STAR_SCORER" | "POINT_GUARD" | "RIM_PROTECTOR" | "WING_DEFENDER" | "BENCH_DEPTH";

export const TEAM_NEED_LABEL: Record<TeamNeed, string> = {
  STAR_SCORER: "Star scorer",
  POINT_GUARD: "Starting-caliber point guard",
  RIM_PROTECTOR: "Rim-protecting center",
  WING_DEFENDER: "Wing defender",
  BENCH_DEPTH: "Bench depth",
};

export interface TeamNeedRosterPlayer {
  position: "PG" | "SG" | "SF" | "PF" | "C";
  overallRating: number;
}

// Matches `playerValueTier.ts`'s own STARTER/ROTATION cutoffs, rather than
// inventing new thresholds - "does this team have a starting-caliber
// player here" and "is this player tier already means the same thing
// everywhere else in the app.
const STARTER_THRESHOLD = 72;
const ROTATION_THRESHOLD = 65;

// Beyond a 5-man starting unit, a team needs at least this many more
// rotation-caliber (not just replacement-level) players to be considered
// to have real bench depth.
const MIN_BENCH_ROTATION_PLAYERS = 3;

function bestRatingAtPositions(
  roster: TeamNeedRosterPlayer[],
  positions: TeamNeedRosterPlayer["position"][],
): number {
  return roster
    .filter((p) => positions.includes(p.position))
    .reduce((best, p) => Math.max(best, p.overallRating), 0);
}

/**
 * Recognizes positional gaps and thin bench depth from a team's current
 * roster. Positional needs are judged by that position's *best* rostered
 * player, not average - a team with a great starter and no backup at a
 * position isn't "thin" there in the way that matters for trade value.
 */
export function computeTeamNeeds(roster: TeamNeedRosterPlayer[]): TeamNeed[] {
  const needs: TeamNeed[] = [];

  const hasStarOrBetter = roster.some((p) => {
    const tier = getPlayerValueTier(p.overallRating);
    return tier === "SUPERSTAR" || tier === "STAR";
  });
  if (!hasStarOrBetter) needs.push("STAR_SCORER");

  if (bestRatingAtPositions(roster, ["PG"]) < STARTER_THRESHOLD) needs.push("POINT_GUARD");
  if (bestRatingAtPositions(roster, ["C"]) < STARTER_THRESHOLD) needs.push("RIM_PROTECTOR");
  if (bestRatingAtPositions(roster, ["SF", "SG"]) < STARTER_THRESHOLD) needs.push("WING_DEFENDER");

  const rotationCaliberCount = roster.filter((p) => p.overallRating >= ROTATION_THRESHOLD).length;
  if (rotationCaliberCount < 5 + MIN_BENCH_ROTATION_PLAYERS) needs.push("BENCH_DEPTH");

  return needs;
}
