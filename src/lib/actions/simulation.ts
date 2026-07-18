"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { simulateGame } from "@/lib/simulation/simulateGame";

export type SimulateBatchSize = 1 | 10 | 50;

/**
 * Simulating an entire ~58-game season in one request risks a serverless
 * function timeout (870 games league-wide, each needing a DB write) - so
 * this only ever simulates a bounded batch per call. A user advances a
 * full season by clicking "simulate 50" a couple of times rather than one
 * unbounded "simulate whole season" action. Documented tradeoff, not an
 * oversight - see docs/ARCHITECTURE.md.
 */
export async function simulateGamesAction(leagueId: string, batchSize: SimulateBatchSize) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }

  const unplayedGames = await prisma.game.findMany({
    where: { leagueId, season: league.currentSeason, playedAt: null },
    orderBy: { gameNumber: "asc" },
    take: batchSize,
  });
  if (unplayedGames.length === 0) return { simulated: 0, remaining: 0 };

  const teamIds = new Set<string>();
  for (const game of unplayedGames) {
    teamIds.add(game.homeLeagueTeamId);
    teamIds.add(game.awayLeagueTeamId);
  }

  const rosterRatings = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: { in: [...teamIds] } },
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
  for (const teamId of teamIds) {
    strengthByTeam.set(teamId, computeTeamStrength(ratingsByTeam.get(teamId) ?? []));
  }

  const winIncrements = new Map<string, number>();
  const lossIncrements = new Map<string, number>();
  const gameUpdates: { id: string; homeScore: number; awayScore: number }[] = [];

  for (const game of unplayedGames) {
    const homeStrength = strengthByTeam.get(game.homeLeagueTeamId) ?? 0;
    const awayStrength = strengthByTeam.get(game.awayLeagueTeamId) ?? 0;
    const result = simulateGame(homeStrength, awayStrength);

    gameUpdates.push({ id: game.id, homeScore: result.homeScore, awayScore: result.awayScore });

    const winnerId = result.homeWon ? game.homeLeagueTeamId : game.awayLeagueTeamId;
    const loserId = result.homeWon ? game.awayLeagueTeamId : game.homeLeagueTeamId;
    winIncrements.set(winnerId, (winIncrements.get(winnerId) ?? 0) + 1);
    lossIncrements.set(loserId, (lossIncrements.get(loserId) ?? 0) + 1);
  }

  const playedAt = new Date();
  await prisma.$transaction([
    ...gameUpdates.map((update) =>
      prisma.game.update({
        where: { id: update.id },
        data: { homeScore: update.homeScore, awayScore: update.awayScore, playedAt },
      }),
    ),
    ...[...winIncrements.entries()].map(([teamId, wins]) =>
      prisma.leagueTeam.update({ where: { id: teamId }, data: { wins: { increment: wins } } }),
    ),
    ...[...lossIncrements.entries()].map(([teamId, losses]) =>
      prisma.leagueTeam.update({
        where: { id: teamId },
        data: { losses: { increment: losses } },
      }),
    ),
  ]);

  const remaining = await prisma.game.count({
    where: { leagueId, season: league.currentSeason, playedAt: null },
  });

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);

  return { simulated: unplayedGames.length, remaining };
}
