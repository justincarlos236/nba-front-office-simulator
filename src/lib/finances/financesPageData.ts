import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Shared loaders for the /finances tab group.
 *
 * The finances section is split across five routes (overview, inbox, report,
 * operations, arena). Every one of them needs the same auth check and the same
 * "which league team am I?" lookup, but each needs a *different* slice of the
 * heavier data - so this module exposes one small required base loader plus
 * per-tab loaders, rather than a single fetch-everything helper. That's the
 * whole point of the split: a tab only pays for the queries it actually renders.
 */

export async function requireFinancesContext(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) notFound();

  const myLeagueTeam = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: myLeagueTeamId },
    include: { team: true },
  });

  return { league, myLeagueTeam, myLeagueTeamId };
}

export type FinancesContext = Awaited<ReturnType<typeof requireFinancesContext>>;

/**
 * "Today," approximated the same way the schedule page does - the most recently
 * completed game's dayIndex - so a decision's absolute deadlineDayIndex can be
 * rendered as a human "N days left."
 */
export async function loadCurrentDayIndex(
  leagueId: string,
  season: number,
  myLeagueTeamId: string,
): Promise<number> {
  const lastPlayedGame = await prisma.game.findFirst({
    where: {
      leagueId,
      season,
      type: "REGULAR_SEASON",
      playedAt: { not: null },
      OR: [{ homeLeagueTeamId: myLeagueTeamId }, { awayLeagueTeamId: myLeagueTeamId }],
    },
    orderBy: { dayIndex: "desc" },
    select: { dayIndex: true },
  });
  return lastPlayedGame?.dayIndex ?? 0;
}

export async function loadPendingDecisions(leagueId: string, myLeagueTeamId: string) {
  return prisma.businessDecision.findMany({
    where: { leagueId, leagueTeamId: myLeagueTeamId, status: "PENDING" },
    orderBy: { deadlineDayIndex: "asc" },
  });
}

/**
 * Just the count, for the tab-bar badge. Rendered on every finances route, so
 * it stays a cheap COUNT rather than pulling full decision rows.
 */
export async function countPendingDecisions(
  leagueId: string,
  myLeagueTeamId: string,
): Promise<number> {
  return prisma.businessDecision.count({
    where: { leagueId, leagueTeamId: myLeagueTeamId, status: "PENDING" },
  });
}

export async function loadSnapshots(leagueId: string, myLeagueTeamId: string) {
  return prisma.financialSnapshot.findMany({
    where: { leagueId, leagueTeamId: myLeagueTeamId },
    orderBy: { season: "asc" },
  });
}

export async function loadActiveSponsorshipDeals(leagueId: string, myLeagueTeamId: string) {
  return prisma.sponsorshipDeal.findMany({
    where: { leagueId, leagueTeamId: myLeagueTeamId, status: "ACTIVE" },
    include: { conditionPlayer: { include: { player: true } } },
    orderBy: { startSeason: "asc" },
  });
}

export async function loadCapitalProjects(leagueId: string, myLeagueTeamId: string) {
  return prisma.capitalProject.findMany({
    where: { leagueId, leagueTeamId: myLeagueTeamId, status: { in: ["IN_PROGRESS", "COMPLETE"] } },
  });
}

export async function loadPendingArenaNegotiation(leagueId: string, myLeagueTeamId: string) {
  return prisma.negotiation.findFirst({
    where: {
      leagueId,
      leagueTeamId: myLeagueTeamId,
      kind: "ARENA_FUNDING",
      status: "IN_PROGRESS",
    },
    select: { id: true },
  });
}

/**
 * Inputs for the mid-season P&L projection: current-season committed salary and
 * staff cost. Shared by Overview (headline number) and Report (full breakdown).
 */
export async function loadProjectionInputs(
  leagueId: string,
  season: number,
  myLeagueTeamId: string,
) {
  const [currentContractYears, staffContracts] = await Promise.all([
    prisma.contractYear.findMany({
      where: { season, contract: { leagueTeamId: myLeagueTeamId } },
      select: { salaryCents: true, contract: { select: { leaguePlayerId: true } } },
    }),
    prisma.staffContract.findMany({
      where: { leagueTeamId: myLeagueTeamId },
      select: { annualSalaryCents: true },
    }),
  ]);
  return { currentContractYears, staffContracts };
}

export async function loadBestPlayer(myLeagueTeamId: string) {
  return prisma.leaguePlayer.findFirst({
    where: { leagueTeamId: myLeagueTeamId, isActive: true },
    orderBy: { overallRating: "desc" },
  });
}

export async function loadLeagueFranchiseValues(leagueId: string) {
  return prisma.leagueTeam.findMany({
    where: { leagueId },
    select: { id: true, franchiseValueCents: true },
  });
}
