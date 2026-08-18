"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  capitalProjectCostCents,
  capitalProjectCompletionSeason,
  ARENA_PROJECT_KINDS,
  BUSINESS_EXPANSION_PROJECT_KINDS,
} from "@/lib/finances/capitalProjects";
import {
  buildNegotiationRound,
  computeStartingCityWillingness,
  ARENA_FUNDING_TOTAL_ROUNDS,
} from "@/lib/finances/arena";
import { computeFinancialStanding } from "@/lib/finances/ownershipFinance";
import type { CapitalProjectKind } from "@/generated/prisma/client";
import { requireSessionUserId, assertLeagueOwned } from "@/lib/auth/requireOwnedLeague";

async function requireOwnedLeagueTeam(leagueId: string) {
  const userId = await requireSessionUserId();

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  assertLeagueOwned(league, userId);
  if (!league.userControlledTeamId) {
    throw new Error("No team to manage");
  }
  return { league, userControlledTeamId: league.userControlledTeamId };
}

/**
 * System 2, "The Arena." Starts a
 * renovation directly (no negotiation needed - you're not asking the city
 * for anything). Cost is paid up front, in full, right now - the "multi-
 * season commitment" is that the quality bonus doesn't land until
 * completion (see advanceSeasonAction's project-completion check).
 */
export async function startArenaRenovationAction(leagueId: string): Promise<void> {
  const { league, userControlledTeamId } = await requireOwnedLeagueTeam(leagueId);

  const existing = await prisma.capitalProject.findFirst({
    where: {
      leagueId,
      leagueTeamId: userControlledTeamId,
      kind: { in: ARENA_PROJECT_KINDS },
      status: "IN_PROGRESS",
    },
  });
  if (existing) {
    throw new Error("An arena project is already underway");
  }

  const costCents = capitalProjectCostCents("ARENA_RENOVATION");
  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: { cashReserveCents: true },
  });

  await prisma.$transaction([
    prisma.capitalProject.create({
      data: {
        leagueId,
        leagueTeamId: userControlledTeamId,
        kind: "ARENA_RENOVATION",
        startSeason: league.currentSeason,
        completionSeason: capitalProjectCompletionSeason("ARENA_RENOVATION", league.currentSeason),
        totalCostCents: BigInt(costCents),
      },
    }),
    prisma.leagueTeam.update({
      where: { id: userControlledTeamId },
      data: { cashReserveCents: team.cashReserveCents - BigInt(costCents) },
    }),
  ]);

  revalidatePath(`/leagues/${leagueId}/finances`);
}

/**
 * starts the ARENA_FUNDING
 * Negotiation (a new build "almost always requires financing and a public-
 * funding negotiation with the city" - see docs/design/FINANCES_PILLAR_DESIGN.md).
 * Nothing is spent or committed yet - the negotiation itself, delivered
 * through the Front Office Inbox, decides whether the project happens at
 * all and on what terms (see resolveBusinessDecisionAction's negotiation
 * handling in src/lib/actions/businessDecisions.ts).
 */
export async function startArenaNewBuildNegotiationAction(leagueId: string): Promise<void> {
  const { league, userControlledTeamId } = await requireOwnedLeagueTeam(leagueId);

  const [existingProject, existingNegotiation, team, recentSnapshots] = await Promise.all([
    prisma.capitalProject.findFirst({
      where: {
        leagueId,
        leagueTeamId: userControlledTeamId,
        kind: { in: ARENA_PROJECT_KINDS },
        status: "IN_PROGRESS",
      },
    }),
    prisma.negotiation.findFirst({
      where: {
        leagueId,
        leagueTeamId: userControlledTeamId,
        kind: "ARENA_FUNDING",
        status: "IN_PROGRESS",
      },
    }),
    prisma.leagueTeam.findUniqueOrThrow({
      where: { id: userControlledTeamId },
      select: {
        cashReserveCents: true,
        failedArenaNegotiations: true,
        debtCents: true,
        ownerArchetype: true,
        team: { select: { marketSize: true } },
      },
    }),
    prisma.financialSnapshot.findMany({
      where: { leagueId, leagueTeamId: userControlledTeamId },
      orderBy: { season: "desc" },
      take: 3,
      select: { netIncomeCents: true },
    }),
  ]);
  if (existingProject) throw new Error("An arena project is already underway");
  if (existingNegotiation) throw new Error("A negotiation with the city is already underway");

  const financialStanding = computeFinancialStanding(
    recentSnapshots.map((s) => Number(s.netIncomeCents)),
    Number(team.cashReserveCents),
    Number(team.debtCents),
  );
  const startingWillingness = computeStartingCityWillingness({
    financialStanding,
    marketSize: team.team.marketSize,
    ownerArchetype: team.ownerArchetype,
    failedArenaNegotiations: team.failedArenaNegotiations,
  });

  const negotiation = await prisma.negotiation.create({
    data: {
      leagueId,
      leagueTeamId: userControlledTeamId,
      kind: "ARENA_FUNDING",
      season: league.currentSeason,
      totalRounds: ARENA_FUNDING_TOTAL_ROUNDS,
      cityWillingness: startingWillingness,
    },
  });

  const nextGame = await prisma.game.findFirst({
    where: { leagueId, season: league.currentSeason, playedAt: { not: null } },
    orderBy: { dayIndex: "desc" },
    select: { dayIndex: true },
  });
  const dayIndex = nextGame?.dayIndex ?? 1;
  const content = buildNegotiationRound("ARENA_FUNDING", 1, startingWillingness);

  await prisma.businessDecision.create({
    data: {
      leagueId,
      leagueTeamId: userControlledTeamId,
      season: league.currentSeason,
      dayIndex,
      kind: "NEGOTIATION_ROUND",
      severity: "MAJOR",
      headline: content.headline,
      body: content.body,
      options: content.options as unknown as object,
      defaultOptionId: content.defaultOptionId,
      deadlineDayIndex: dayIndex + content.deadlineDays,
      negotiationId: negotiation.id,
    },
  });

  revalidatePath(`/leagues/${leagueId}/finances`);
}

const EXPANSION_KIND_SET = new Set(BUSINESS_EXPANSION_PROJECT_KINDS);

/**
 * System 8, "Business Expansion."
 * Starts one of the 4 organizational-growth projects. At most one
 * expansion project can be in progress at a time (a real, felt
 * commitment), independent of any arena project underway.
 */
export async function startBusinessExpansionProjectAction(
  leagueId: string,
  kind: CapitalProjectKind,
): Promise<void> {
  const { league, userControlledTeamId } = await requireOwnedLeagueTeam(leagueId);

  if (!EXPANSION_KIND_SET.has(kind)) {
    throw new Error("Invalid business expansion project");
  }

  const [existingInProgress, existingOfSameKind] = await Promise.all([
    prisma.capitalProject.findFirst({
      where: {
        leagueId,
        leagueTeamId: userControlledTeamId,
        kind: { in: BUSINESS_EXPANSION_PROJECT_KINDS },
        status: "IN_PROGRESS",
      },
    }),
    // Each expansion kind is a one-time, permanent unlock - its effects
    // don't scale with repeat builds, so building the same kind twice
    // would just be free stacking, not a real decision.
    prisma.capitalProject.findFirst({
      where: { leagueId, leagueTeamId: userControlledTeamId, kind, status: { not: "ABANDONED" } },
    }),
  ]);
  if (existingInProgress) {
    throw new Error("A business expansion project is already underway");
  }
  if (existingOfSameKind) {
    throw new Error("This project has already been built");
  }

  const costCents = capitalProjectCostCents(kind);
  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: { cashReserveCents: true },
  });

  await prisma.$transaction([
    prisma.capitalProject.create({
      data: {
        leagueId,
        leagueTeamId: userControlledTeamId,
        kind,
        startSeason: league.currentSeason,
        completionSeason: capitalProjectCompletionSeason(kind, league.currentSeason),
        totalCostCents: BigInt(costCents),
      },
    }),
    prisma.leagueTeam.update({
      where: { id: userControlledTeamId },
      data: { cashReserveCents: team.cashReserveCents - BigInt(costCents) },
    }),
  ]);

  revalidatePath(`/leagues/${leagueId}/finances`);
}
