"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeLeagueTeamStrengths } from "@/lib/actions/leagueTeamStrength";
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

  // type filter matters once play-in/playoff games exist for this season -
  // those are always created already-played (see src/lib/actions/playoffs.ts),
  // but this guards against ever picking one up as an "unplayed" regular
  // season game regardless.
  const unplayedGames = await prisma.game.findMany({
    where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
    orderBy: { gameNumber: "asc" },
    take: batchSize,
  });
  if (unplayedGames.length === 0) return { simulated: 0, remaining: 0 };

  const teamIds = new Set<string>();
  for (const game of unplayedGames) {
    teamIds.add(game.homeLeagueTeamId);
    teamIds.add(game.awayLeagueTeamId);
  }

  const strengthByTeam = await computeLeagueTeamStrengths([...teamIds]);

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

  // Each game/team update is independent of the others (this batch doesn't
  // need all-or-nothing atomicity the way a trade or signing does), so
  // these run concurrently via the connection pool rather than as one
  // strictly sequential Postgres transaction - a batch of 50 sequential
  // round trips to a remote DB risked a serverless timeout in production
  // even though it looked fine when tested locally on a lower-latency
  // connection. See docs/ARCHITECTURE.md.
  const playedAt = new Date();
  await Promise.all([
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
    where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
  });

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);

  return { simulated: unplayedGames.length, remaining };
}
