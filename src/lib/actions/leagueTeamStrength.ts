import { prisma } from "@/lib/prisma";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";

/**
 * Shared by regular-season and playoff simulation: pulls each team's
 * current roster ratings and reduces them to a single strength number via
 * the same weighted-rotation formula, so both simulations rate teams
 * identically.
 */
export async function computeLeagueTeamStrengths(
  leagueTeamIds: string[],
): Promise<Map<string, number>> {
  const rosterRatings = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: { in: leagueTeamIds } },
    select: { leagueTeamId: true, overallRating: true },
  });
  const ratingsByTeam = new Map<string, number[]>();
  for (const player of rosterRatings) {
    if (!player.leagueTeamId) continue;
    const ratings = ratingsByTeam.get(player.leagueTeamId) ?? [];
    ratings.push(player.overallRating);
    ratingsByTeam.set(player.leagueTeamId, ratings);
  }
  const strengthByTeam = new Map<string, number>();
  for (const teamId of leagueTeamIds) {
    strengthByTeam.set(teamId, computeTeamStrength(ratingsByTeam.get(teamId) ?? []));
  }
  return strengthByTeam;
}
