"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateDraftClass } from "@/lib/draft/generateDraftClass";
import { computeDraftOrder } from "@/lib/draft/draftOrder";
import { generateContract } from "@/lib/contracts/generateContract";
import { createSeededRandom } from "@/lib/contracts/seededRandom";

async function requireOwnedLeague(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: true },
  });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  return league;
}

interface ProspectAssignment {
  pickId: string;
  prospectId: string;
  leagueTeamId: string;
  fullName: string;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  overallRating: number;
  potentialRating: number;
  round: number;
  overallPickNumber: number;
}

/**
 * Turns a batch of (pick, prospect) assignments into real roster additions:
 * a reference `Player` row (fictional - no real future draft class exists,
 * see docs/ARCHITECTURE.md), a `LeaguePlayer`, and a rookie-scale contract,
 * reusing the exact same `generateContract` engine every other contract in
 * the sim uses. Bulk-writes via `createManyAndReturn` at each stage (same
 * multi-stage pattern league bootstrap uses) rather than one round trip
 * per rookie, since a full round can be up to 30 assignments at once.
 * Returns the same assignments back so callers (server actions) can hand
 * the ordered pick results to the client for an animated reveal.
 */
async function draftProspectsToTeams(
  leagueId: string,
  rookieSeason: number,
  assignments: ProspectAssignment[],
) {
  if (assignments.length === 0) return assignments;

  const createdPlayers = await prisma.player.createManyAndReturn({
    data: assignments.map((a) => ({
      fullName: a.fullName,
      position: a.position,
      draftYear: rookieSeason,
      draftRound: a.round,
      draftPick: a.overallPickNumber,
    })),
  });
  const prospectIdToPlayerId = new Map(
    assignments.map((a, i) => [a.prospectId, createdPlayers[i].id]),
  );

  const createdLeaguePlayers = await prisma.leaguePlayer.createManyAndReturn({
    data: assignments.map((a) => ({
      leagueId,
      playerId: prospectIdToPlayerId.get(a.prospectId)!,
      leagueTeamId: a.leagueTeamId,
      overallRating: a.overallRating,
      potentialRating: a.potentialRating,
    })),
  });
  const prospectIdToLeaguePlayerId = new Map(
    assignments.map((a, i) => [a.prospectId, createdLeaguePlayers[i].id]),
  );

  const contractPlans = assignments.map((a) => ({
    prospectId: a.prospectId,
    leagueTeamId: a.leagueTeamId,
    contract: generateContract({
      season: rookieSeason,
      ageAdjustedScore: a.overallRating,
      yearsOfExperience: 0,
      seed: a.prospectId,
    }),
  }));

  const createdContracts = await prisma.contract.createManyAndReturn({
    data: contractPlans.map((c) => ({
      leaguePlayerId: prospectIdToLeaguePlayerId.get(c.prospectId)!,
      leagueTeamId: c.leagueTeamId,
      signedSeason: rookieSeason,
      startSeason: c.contract.startSeason,
      endSeason: c.contract.endSeason,
    })),
  });
  const prospectIdToContractId = new Map(
    contractPlans.map((c, i) => [c.prospectId, createdContracts[i].id]),
  );

  const contractYearInputs = contractPlans.flatMap((c) =>
    c.contract.years.map((year) => ({
      contractId: prospectIdToContractId.get(c.prospectId)!,
      season: year.season,
      salaryCents: year.salaryCents,
      guaranteedCents: year.guaranteedCents,
    })),
  );
  await prisma.contractYear.createMany({ data: contractYearInputs });

  await Promise.all(
    assignments.map((a) =>
      prisma.draftPick.update({
        where: { id: a.pickId },
        data: { selectedProspectId: a.prospectId },
      }),
    ),
  );

  return assignments;
}

export interface StartedDraftPick {
  id: string;
  round: number;
  overallPickNumber: number;
  leagueTeamId: string;
}

export interface StartedDraftProspect {
  id: string;
  fullName: string;
  position: string;
  age: number;
  overallRating: number;
  potentialRating: number;
}

/**
 * Seeds one season's draft: runs the lottery + full 60-pick order from
 * the season's final standings and playoff bracket, and generates a
 * fictional 60-prospect class. Requires a crowned playoff champion (the
 * draft happens between the just-finished season's playoffs and the next
 * season, same as the real NBA calendar) and refuses to run twice.
 * Returns the created picks/prospects directly so the client can render
 * the board without waiting on a full page refresh.
 */
export async function startDraftAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;

  const finals = await prisma.playoffSeries.findFirst({
    where: { leagueId, season, round: 4 },
  });
  if (!finals?.winnerTeamId) {
    throw new Error("Crown a champion in the playoffs before the draft.");
  }

  const existingPick = await prisma.draftPick.findFirst({ where: { leagueId, season } });
  if (existingPick) {
    throw new Error("The draft has already started for this season.");
  }

  const round1Series = await prisma.playoffSeries.findMany({
    where: { leagueId, season, round: 1 },
  });
  const playoffTeamIds = new Set<string>();
  for (const s of round1Series) {
    playoffTeamIds.add(s.higherSeedTeamId);
    playoffTeamIds.add(s.lowerSeedTeamId);
  }

  const teams = league.teams.map((t) => ({
    leagueTeamId: t.id,
    wins: t.wins,
    losses: t.losses,
  }));

  const rng = createSeededRandom(`${leagueId}-${season}-draft`);
  const pickOrder = computeDraftOrder(teams, playoffTeamIds, rng);
  const prospects = generateDraftClass(rng);

  const createdProspects = await prisma.draftProspect.createManyAndReturn({
    data: prospects.map((p) => ({
      leagueId,
      season,
      fullName: p.fullName,
      position: p.position,
      age: p.age,
      overallRating: p.overallRating,
      potentialRating: p.potentialRating,
    })),
  });

  const createdPicks = await prisma.draftPick.createManyAndReturn({
    data: pickOrder.map((leagueTeamId, index) => ({
      leagueId,
      season,
      round: index < 30 ? 1 : 2,
      originalTeamId: leagueTeamId,
      currentOwnerId: leagueTeamId,
      overallPickNumber: index + 1,
    })),
  });

  revalidatePath(`/leagues/${leagueId}/draft`);

  return {
    started: true,
    picks: createdPicks.map((p) => ({
      id: p.id,
      round: p.round,
      overallPickNumber: p.overallPickNumber!,
      leagueTeamId: p.currentOwnerId,
    })) as StartedDraftPick[],
    prospects: createdProspects.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      position: p.position,
      age: p.age,
      overallRating: p.overallRating,
      potentialRating: p.potentialRating,
    })) as StartedDraftProspect[],
  };
}

export interface ResolvedPick {
  pickId: string;
  overallPickNumber: number;
  round: number;
  leagueTeamId: string;
  prospectId: string;
  fullName: string;
  position: string;
  overallRating: number;
  potentialRating: number;
}

/**
 * Resolves every CPU-owned pick in order (best-available-prospect by
 * rating - real GM-needs-based CPU logic is Phase 6 territory) until it
 * reaches a pick owned by the user's team, or the draft ends. Returns the
 * ordered list of what was resolved so the client can animate the board
 * filling in pick by pick instead of jumping straight to the end state.
 */
export async function advanceDraftAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId;

  const [allPicks, allProspects] = await Promise.all([
    prisma.draftPick.findMany({
      where: { leagueId, season },
      orderBy: { overallPickNumber: "asc" },
    }),
    prisma.draftProspect.findMany({ where: { leagueId, season } }),
  ]);
  if (allPicks.length === 0) {
    throw new Error("The draft hasn't started yet for this season.");
  }

  const pendingPicks = allPicks.filter((p) => !p.selectedProspectId);
  if (pendingPicks.length === 0) {
    return { done: true, resolvedPicks: [] as ResolvedPick[] };
  }

  const draftedProspectIds = new Set(
    allPicks.filter((p) => p.selectedProspectId).map((p) => p.selectedProspectId as string),
  );
  const availableProspects = allProspects
    .filter((p) => !draftedProspectIds.has(p.id))
    .sort((a, b) => b.overallRating - a.overallRating);

  const assignments: ProspectAssignment[] = [];
  for (const pick of pendingPicks) {
    if (pick.currentOwnerId === userTeamId) break;

    const prospect = availableProspects.shift();
    if (!prospect) break;

    assignments.push({
      pickId: pick.id,
      prospectId: prospect.id,
      leagueTeamId: pick.currentOwnerId,
      fullName: prospect.fullName,
      position: prospect.position,
      overallRating: prospect.overallRating,
      potentialRating: prospect.potentialRating,
      round: pick.round,
      overallPickNumber: pick.overallPickNumber!,
    });
  }

  await draftProspectsToTeams(leagueId, season + 1, assignments);

  revalidatePath(`/leagues/${leagueId}/draft`);

  const resolvedPicks: ResolvedPick[] = assignments.map((a) => ({
    pickId: a.pickId,
    overallPickNumber: a.overallPickNumber,
    round: a.round,
    leagueTeamId: a.leagueTeamId,
    prospectId: a.prospectId,
    fullName: a.fullName,
    position: a.position,
    overallRating: a.overallRating,
    potentialRating: a.potentialRating,
  }));

  return { done: assignments.length === pendingPicks.length, resolvedPicks };
}

/**
 * The user selecting a prospect for their own team's current pick.
 * Re-validates everything server-side (never trusts the client-rendered
 * "available prospects" board): the pick must exist, be unowned, belong
 * to the user's team, and be next in pick order, and the prospect must
 * still be on the board.
 */
export async function makeDraftPickAction(leagueId: string, prospectId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId;
  if (!userTeamId) throw new Error("You don't control a team in this league");

  const nextPick = await prisma.draftPick.findFirst({
    where: { leagueId, season, selectedProspectId: null },
    orderBy: { overallPickNumber: "asc" },
  });
  if (!nextPick) throw new Error("There are no picks remaining in this draft.");
  if (nextPick.currentOwnerId !== userTeamId) {
    throw new Error("It's not your team's turn to pick.");
  }

  const prospect = await prisma.draftProspect.findUnique({ where: { id: prospectId } });
  if (!prospect || prospect.leagueId !== leagueId || prospect.season !== season) {
    throw new Error("Prospect not found");
  }
  const alreadyPicked = await prisma.draftPick.findFirst({
    where: { selectedProspectId: prospectId },
  });
  if (alreadyPicked) throw new Error("That prospect has already been drafted");

  const [assignment] = await draftProspectsToTeams(leagueId, season + 1, [
    {
      pickId: nextPick.id,
      prospectId: prospect.id,
      leagueTeamId: userTeamId,
      fullName: prospect.fullName,
      position: prospect.position,
      overallRating: prospect.overallRating,
      potentialRating: prospect.potentialRating,
      round: nextPick.round,
      overallPickNumber: nextPick.overallPickNumber!,
    },
  ]);

  revalidatePath(`/leagues/${leagueId}/draft`);

  const resolvedPick: ResolvedPick = {
    pickId: assignment.pickId,
    overallPickNumber: assignment.overallPickNumber,
    round: assignment.round,
    leagueTeamId: assignment.leagueTeamId,
    prospectId: assignment.prospectId,
    fullName: assignment.fullName,
    position: assignment.position,
    overallRating: assignment.overallRating,
    potentialRating: assignment.potentialRating,
  };

  return { drafted: true, resolvedPick };
}
