"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { estimateAge, estimateExperience } from "@/lib/players/age";
import { developPlayerRating } from "@/lib/development/developPlayerRating";
import { shouldRetire } from "@/lib/development/retirement";
import {
  computeMVP,
  computeMostImprovedPlayer,
  computeRookieOfTheYear,
  type PlayerSeasonSnapshot,
} from "@/lib/development/seasonAwards";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { generateRoundRobinSchedule } from "@/lib/simulation/generateSchedule";
import { describeRetirement } from "@/lib/transactions/describeTransaction";

// Bulk player-development writes are batched (not one giant Promise.all)
// for the same reason simulateGamesAction batches game writes - see
// docs/ARCHITECTURE.md.
const UPDATE_BATCH_SIZE = 50;

async function requireOwnedLeague(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  return league;
}

/**
 * Ages every active player one year, applies development/decline, resolves
 * retirements, expires contracts, computes this season's awards (MVP, ROY,
 * Most Improved), resets standings, generates the new season's schedule,
 * and rolls `League.currentSeason` forward. Requires a crowned champion for
 * the current season - the playoffs aren't a dead end, they're what
 * actually unlocks the next season.
 */
export async function advanceSeasonAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;
  const newSeason = season + 1;

  const finals = await prisma.playoffSeries.findFirst({
    where: { leagueId, season, round: 4 },
  });
  if (!finals?.winnerTeamId) {
    throw new Error("Crown a champion in the playoffs before advancing to the next season.");
  }

  const [totalDraftPicks, pendingDraftPicks] = await Promise.all([
    prisma.draftPick.count({ where: { leagueId, season } }),
    prisma.draftPick.count({ where: { leagueId, season, selectedProspectId: null } }),
  ]);
  if (totalDraftPicks === 0 || pendingDraftPicks > 0) {
    throw new Error("Finish the draft before advancing to the next season.");
  }

  const alreadyAdvanced = await prisma.game.count({ where: { leagueId, season: newSeason } });
  if (alreadyAdvanced > 0) {
    throw new Error("This season has already been advanced.");
  }

  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId, isActive: true },
    include: { player: true, contract: true },
  });
  const teamById = new Map(league.teams.map((t) => [t.id, t]));

  const rosteredSnapshots: PlayerSeasonSnapshot[] = [];
  const developmentSnapshots: PlayerSeasonSnapshot[] = [];
  const playerUpdates: {
    id: string;
    overallRating: number;
    isActive: boolean;
    leagueTeamId: string | null;
    retiredSeason: number | null;
  }[] = [];
  const contractIdsToDelete: string[] = [];
  const retirementDescriptions: string[] = [];

  const rng = createSeededRandom(`${leagueId}-${season}-offseason`);

  for (const lp of leaguePlayers) {
    const oldRating = lp.overallRating;
    const newAge = estimateAge(lp.player.draftYear, newSeason);
    const experience = estimateExperience(lp.player.draftYear, season);

    if (lp.leagueTeamId) {
      const team = teamById.get(lp.leagueTeamId);
      const gamesPlayed = (team?.wins ?? 0) + (team?.losses ?? 0);
      rosteredSnapshots.push({
        leaguePlayerId: lp.id,
        overallRating: oldRating,
        previousRating: null,
        experience,
        teamWinPct: gamesPlayed > 0 ? (team?.wins ?? 0) / gamesPlayed : 0,
      });
    }

    const developedRating = developPlayerRating({
      overallRating: oldRating,
      potentialRating: lp.potentialRating,
      age: newAge,
      rng,
    });
    const retiring = shouldRetire(newAge, developedRating, rng);
    const finalRating = retiring ? oldRating : developedRating;

    developmentSnapshots.push({
      leaguePlayerId: lp.id,
      overallRating: finalRating,
      previousRating: oldRating,
      experience,
      teamWinPct: 0,
    });

    const contractExpired = !retiring && !!lp.contract && lp.contract.endSeason < newSeason;
    if (retiring || contractExpired) {
      if (lp.contract) contractIdsToDelete.push(lp.contract.id);
    }

    if (retiring) {
      const teamLabel = lp.leagueTeamId
        ? (() => {
            const team = teamById.get(lp.leagueTeamId!)?.team;
            return team ? `${team.city} ${team.name}` : null;
          })()
        : null;
      retirementDescriptions.push(describeRetirement(lp.player.fullName, teamLabel));
    }

    playerUpdates.push({
      id: lp.id,
      overallRating: finalRating,
      isActive: !retiring,
      leagueTeamId: retiring || contractExpired ? null : lp.leagueTeamId,
      retiredSeason: retiring ? season : null,
    });
  }

  const mvp = computeMVP(rosteredSnapshots);
  const roy = computeRookieOfTheYear(rosteredSnapshots);
  const mip = computeMostImprovedPlayer(developmentSnapshots);

  for (let i = 0; i < playerUpdates.length; i += UPDATE_BATCH_SIZE) {
    const batch = playerUpdates.slice(i, i + UPDATE_BATCH_SIZE);
    await Promise.all(
      batch.map((u) =>
        prisma.leaguePlayer.update({
          where: { id: u.id },
          data: {
            overallRating: u.overallRating,
            isActive: u.isActive,
            leagueTeamId: u.leagueTeamId,
            retiredSeason: u.retiredSeason,
            // A new season starts with everyone healthy - team wins/losses
            // reset to 0 too, so an in-season injury's `returnsAt` (measured
            // in that team's own games played) would otherwise never
            // resolve if it crossed the season boundary unhealed.
            injuryStatus: "HEALTHY",
            injuryReturnsAtGamesPlayed: null,
          },
        }),
      ),
    );
  }

  await Promise.all([
    contractIdsToDelete.length > 0
      ? prisma.contract.deleteMany({ where: { id: { in: contractIdsToDelete } } })
      : Promise.resolve(),
    prisma.leagueTeam.updateMany({ where: { leagueId }, data: { wins: 0, losses: 0 } }),
  ]);

  const awardRows = (
    [
      mvp && { category: "MVP" as const, ...mvp },
      roy && { category: "ROOKIE_OF_THE_YEAR" as const, ...roy },
      mip && { category: "MOST_IMPROVED_PLAYER" as const, ...mip },
    ].filter(Boolean) as {
      category: "MVP" | "ROOKIE_OF_THE_YEAR" | "MOST_IMPROVED_PLAYER";
      leaguePlayerId: string;
      value: number;
    }[]
  ).map((a) => ({
    leagueId,
    season,
    category: a.category,
    leaguePlayerId: a.leaguePlayerId,
    value: a.value,
  }));

  if (awardRows.length > 0) {
    await prisma.seasonAward.createMany({ data: awardRows });
  }

  if (retirementDescriptions.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: retirementDescriptions.map((description) => ({
        leagueId,
        season,
        type: "RETIREMENT" as const,
        description,
      })),
    });
  }

  const schedule = generateRoundRobinSchedule(
    league.teams.map((t) => t.id),
    `${leagueId}-${newSeason}`,
  );
  await prisma.game.createMany({
    data: schedule.map((game) => ({
      leagueId,
      season: newSeason,
      gameNumber: game.gameNumber,
      homeLeagueTeamId: game.homeLeagueTeamId,
      awayLeagueTeamId: game.awayLeagueTeamId,
    })),
  });

  await prisma.league.update({ where: { id: leagueId }, data: { currentSeason: newSeason } });

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/playoffs`);
  revalidatePath(`/leagues/${leagueId}/offseason`);
  revalidatePath(`/leagues/${leagueId}/free-agents`);

  return {
    newSeason,
    retiredCount: playerUpdates.filter((u) => u.retiredSeason !== null).length,
  };
}
