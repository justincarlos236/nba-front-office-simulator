"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { planLeaguePlayer } from "@/lib/league/planLeaguePlayer";
import { generateRoundRobinSchedule } from "@/lib/simulation/generateSchedule";
import { estimateAge, estimateExperience } from "@/lib/players/age";
import { MAX_LEAGUES_PER_USER } from "@/lib/league/constants";

const SEASON = 2023;
const FREE_AGENT_RATING_CUTOFF = 25;

/**
 * Bootstraps a brand-new League from the reference snapshot: clones all 30
 * teams, all 497 real players (with a rating + generated contract derived
 * from their real 2023-24 stats), and puts the user in charge of one team.
 * Users can run multiple independent franchises (up to `MAX_LEAGUES_PER_USER`)
 * and switch between them from `/leagues`.
 */
export async function createLeagueAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const teamId = formData.get("teamId");
  if (typeof teamId !== "string" || !teamId) {
    throw new Error("Missing teamId");
  }

  const existingCount = await prisma.league.count({ where: { ownerId: session.user.id } });
  if (existingCount >= MAX_LEAGUES_PER_USER) {
    throw new Error(`You've reached the ${MAX_LEAGUES_PER_USER}-franchise limit.`);
  }

  const [teams, players, chosenTeam] = await Promise.all([
    prisma.team.findMany(),
    prisma.player.findMany({ include: { seasonStats: { where: { season: SEASON } } } }),
    prisma.team.findUnique({ where: { id: teamId } }),
  ]);
  if (!chosenTeam) throw new Error("Unknown team");

  const league = await prisma.league.create({
    data: {
      name: `${chosenTeam.city} ${chosenTeam.name}`,
      ownerId: session.user.id,
      currentSeason: SEASON,
    },
  });

  const leagueTeams = await prisma.leagueTeam.createManyAndReturn({
    data: teams.map((team) => ({ leagueId: league.id, teamId: team.id })),
  });
  const teamIdToLeagueTeamId = new Map(leagueTeams.map((lt) => [lt.teamId, lt.id]));

  await prisma.league.update({
    where: { id: league.id },
    data: { userControlledTeamId: teamIdToLeagueTeamId.get(teamId) },
  });

  const schedule = generateRoundRobinSchedule(
    leagueTeams.map((lt) => lt.id),
    league.id,
  );
  await prisma.game.createMany({
    data: schedule.map((game) => ({
      leagueId: league.id,
      season: SEASON,
      gameNumber: game.gameNumber,
      homeLeagueTeamId: game.homeLeagueTeamId,
      awayLeagueTeamId: game.awayLeagueTeamId,
    })),
  });

  const plans = players.map((player) => {
    const stat = player.seasonStats[0];
    const realTeamLeagueTeamId = player.currentTeamId
      ? (teamIdToLeagueTeamId.get(player.currentTeamId) ?? null)
      : null;
    if (!stat) return { player, leagueTeamId: realTeamLeagueTeamId, plan: null };

    const plan = planLeaguePlayer({
      season: SEASON,
      age: estimateAge(player.draftYear, SEASON),
      yearsOfExperience: estimateExperience(player.draftYear, SEASON),
      stats: { ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 },
      seed: player.id,
    });

    // Every real player in the snapshot currently has a team, which would
    // leave free agency permanently empty. Fringe/replacement-level
    // players (bottom ~15% by rating - two-way/10-day caliber in reality)
    // start as unsigned free agents instead, so the board has real content.
    const leagueTeamId =
      plan.overallRating < FREE_AGENT_RATING_CUTOFF ? null : realTeamLeagueTeamId;
    return { player, leagueTeamId, plan };
  });

  const createdLeaguePlayers = await prisma.leaguePlayer.createManyAndReturn({
    data: plans.map(({ player, leagueTeamId, plan }) => ({
      leagueId: league.id,
      playerId: player.id,
      leagueTeamId,
      reSigningTeamId: leagueTeamId,
      overallRating: plan?.overallRating ?? 50,
      potentialRating: plan?.potentialRating ?? 50,
    })),
  });
  const playerIdToLeaguePlayerId = new Map(createdLeaguePlayers.map((lp) => [lp.playerId, lp.id]));

  const rosteredPlans = plans.filter((p) => p.plan && p.leagueTeamId);

  const contractInputs = rosteredPlans.map((p) => ({
    leaguePlayerId: playerIdToLeaguePlayerId.get(p.player.id)!,
    leagueTeamId: p.leagueTeamId!,
    signedSeason: SEASON,
    startSeason: p.plan!.contract.startSeason,
    endSeason: p.plan!.contract.endSeason,
  }));
  const createdContracts = await prisma.contract.createManyAndReturn({ data: contractInputs });
  const leaguePlayerIdToContractId = new Map(createdContracts.map((c) => [c.leaguePlayerId, c.id]));

  const contractYearInputs = rosteredPlans.flatMap((p) => {
    const leaguePlayerId = playerIdToLeaguePlayerId.get(p.player.id)!;
    const contractId = leaguePlayerIdToContractId.get(leaguePlayerId)!;
    return p.plan!.contract.years.map((year) => ({
      contractId,
      season: year.season,
      salaryCents: year.salaryCents,
      guaranteedCents: year.guaranteedCents,
    }));
  });
  await prisma.contractYear.createMany({ data: contractYearInputs });

  revalidatePath("/leagues");
  redirect(`/leagues/${league.id}`);
}
