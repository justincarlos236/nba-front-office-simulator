"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { planLeaguePlayer } from "@/lib/league/planLeaguePlayer";

const SEASON = 2023;

/**
 * Real birth dates aren't available from the free bio API (see
 * docs/ARCHITECTURE.md), so age/experience are estimated from draft year -
 * good enough to drive the age curve and rookie-scale discount without
 * claiming precision we don't have.
 */
function estimateAge(draftYear: number | null): number {
  if (!draftYear) return 27;
  return Math.max(19, SEASON - draftYear + 22);
}

function estimateExperience(draftYear: number | null): number {
  if (!draftYear) return 5;
  return Math.max(0, SEASON - draftYear);
}

/**
 * Bootstraps a brand-new League from the reference snapshot: clones all 30
 * teams, all 497 real players (with a rating + generated contract derived
 * from their real 2023-24 stats), and puts the user in charge of one team.
 * One league per user for now - see docs/ROADMAP.md for multi-save support.
 */
export async function createLeagueAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const teamId = formData.get("teamId");
  if (typeof teamId !== "string" || !teamId) {
    throw new Error("Missing teamId");
  }

  const existing = await prisma.league.findFirst({ where: { ownerId: session.user.id } });
  if (existing) redirect(`/leagues/${existing.id}`);

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

  const plans = players.map((player) => {
    const stat = player.seasonStats[0];
    const leagueTeamId = player.currentTeamId
      ? (teamIdToLeagueTeamId.get(player.currentTeamId) ?? null)
      : null;
    if (!stat) return { player, leagueTeamId, plan: null };

    const plan = planLeaguePlayer({
      season: SEASON,
      age: estimateAge(player.draftYear),
      yearsOfExperience: estimateExperience(player.draftYear),
      stats: { ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 },
      seed: player.id,
    });
    return { player, leagueTeamId, plan };
  });

  const createdLeaguePlayers = await prisma.leaguePlayer.createManyAndReturn({
    data: plans.map(({ player, leagueTeamId, plan }) => ({
      leagueId: league.id,
      playerId: player.id,
      leagueTeamId,
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

  redirect(`/leagues/${league.id}`);
}
