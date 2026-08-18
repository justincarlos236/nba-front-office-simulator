"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  scoutingAssignmentCapacity,
  scoutingAssignmentsSpent,
  checkFocusedLook,
  checkPrivateWorkout,
  planSweep,
  recommendScoutingAssignments,
  PRIVATE_WORKOUT_COST,
} from "@/lib/draft/scoutingAssignments";
import { type ResolvableHiddenAxis } from "@/lib/draft/scoutingProfile";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import type { DepartmentLevel, ProspectPathway } from "@/generated/prisma/client";
import { requireSessionUserId, assertLeagueOwned } from "@/lib/auth/requireOwnedLeague";

async function requireOwnedLeagueTeam(leagueId: string) {
  const userId = await requireSessionUserId();

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  assertLeagueOwned(league, userId);
  if (!league.userControlledTeamId) {
    throw new Error("No controlled team for this league");
  }
  return league;
}

/**
 * The budget's actual source of truth (Scouting Pillar Redesign, Phase 4) -
 * `remaining` is capacity minus the sum of every ScoutingAssignmentSpend
 * row's cost for this league+season+team, never derived from Scouting
 * Depth (see schema.prisma's comment on ScoutingAssignmentSpend for why
 * that derivation breaks for Sweeps and Workouts). Naturally scoped by
 * `season`, so a new pre-draft window simply has no rows yet - no reset
 * step exists anywhere, and none is needed.
 */
async function loadRemainingBudget(
  leagueId: string,
  season: number,
  userTeamId: string,
  scoutingLevel: DepartmentLevel,
) {
  const [prospects, spends] = await Promise.all([
    prisma.draftProspect.findMany({
      where: { leagueId, season },
      select: { id: true, position: true, overallRating: true, scoutingDepth: true, pathway: true },
    }),
    prisma.scoutingAssignmentSpend.findMany({
      where: { leagueId, season, leagueTeamId: userTeamId },
      select: { cost: true, kind: true, prospectId: true, pathway: true },
    }),
  ]);
  const depthByProspectId = new Map(prospects.map((p) => [p.id, p.scoutingDepth]));
  const capacity = scoutingAssignmentCapacity(scoutingLevel);
  const spent = scoutingAssignmentsSpent(spends.map((s) => s.cost));
  return { prospects, depthByProspectId, spends, capacity, remaining: capacity - spent };
}

/**
 * Scouting Pillar Redesign (Phase 2) - manual mode's one action: spend one
 * assignment on one prospect, raising his Scouting Depth by 1. Re-validates
 * both real constraints server-side (never trusts the client's own
 * remaining-budget display) - the same "never invent a signal, never trust
 * a client-computed gate" discipline the rest of the codebase's server
 * actions already follow.
 */
export async function assignFocusedLookAction(
  leagueId: string,
  prospectId: string,
): Promise<{ newDepth: number; remaining: number }> {
  const league = await requireOwnedLeagueTeam(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId!;

  const [prospect, team] = await Promise.all([
    prisma.draftProspect.findFirst({ where: { id: prospectId, leagueId, season } }),
    prisma.leagueTeam.findUnique({ where: { id: userTeamId } }),
  ]);
  if (!prospect) throw new Error("Prospect not found");
  if (!team) throw new Error("Team not found");

  const { depthByProspectId, remaining } = await loadRemainingBudget(
    leagueId,
    season,
    userTeamId,
    team.scoutingLevel,
  );

  const check = checkFocusedLook(depthByProspectId.get(prospectId) ?? 0, remaining);
  if (!check.allowed) throw new Error(check.reason ?? "Focused Look not allowed");

  const [updated] = await prisma.$transaction([
    prisma.draftProspect.update({
      where: { id: prospectId },
      data: { scoutingDepth: { increment: 1 } },
    }),
    prisma.scoutingAssignmentSpend.create({
      data: {
        leagueId,
        season,
        leagueTeamId: userTeamId,
        kind: "FOCUSED_LOOK",
        cost: 1,
        prospectId,
      },
    }),
  ]);

  revalidatePath(`/leagues/${leagueId}/draft`);
  return { newDepth: updated.scoutingDepth, remaining: remaining - 1 };
}

export interface ScoutingBudgetSummary {
  capacity: number;
  spent: number;
  remaining: number;
}

/**
 * The read side for the assignment-budget UI - one query, reused by both
 * the Draft page's initial render and anywhere else that needs to show
 * "X of Y assignments remaining" without recomputing spent-per-prospect
 * itself.
 */
export async function getScoutingBudgetSummary(
  leagueId: string,
  season: number,
): Promise<ScoutingBudgetSummary> {
  // Exported from a "use server" module, so this is a callable endpoint and
  // has to prove ownership like every other one - it used to read a league by
  // id alone, which let any caller learn another save's scouting budget.
  await requireOwnedLeagueTeam(leagueId);

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league?.userControlledTeamId) return { capacity: 0, spent: 0, remaining: 0 };

  const team = await prisma.leagueTeam.findUnique({ where: { id: league.userControlledTeamId } });
  if (!team) return { capacity: 0, spent: 0, remaining: 0 };

  const { capacity, remaining } = await loadRemainingBudget(
    leagueId,
    season,
    league.userControlledTeamId,
    team.scoutingLevel,
  );
  return { capacity, spent: capacity - remaining, remaining };
}

/**
 * Recommend mode (docs/SCOUTING_PILLAR_DESIGN.md Part 3.5b) - spends the
 * player's *entire remaining* budget in one call, per
 * `recommendScoutingAssignments`'s deterministic plan (Focused Looks only -
 * Recommend mode doesn't plan Sweeps/Workouts on the player's behalf).
 * Returns the final depth reached per prospect touched, so the client can
 * update local state without a full page reload.
 */
export async function acceptScoutingRecommendationAction(
  leagueId: string,
): Promise<{ updatedDepths: { prospectId: string; newDepth: number }[]; remaining: number }> {
  const league = await requireOwnedLeagueTeam(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId!;

  const [team, roster] = await Promise.all([
    prisma.leagueTeam.findUnique({ where: { id: userTeamId } }),
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId: userTeamId, isActive: true },
      select: { player: { select: { position: true } }, overallRating: true },
    }),
  ]);
  if (!team) throw new Error("Team not found");

  const { prospects, depthByProspectId, remaining } = await loadRemainingBudget(
    leagueId,
    season,
    userTeamId,
    team.scoutingLevel,
  );
  if (remaining <= 0) return { updatedDepths: [], remaining: 0 };

  const teamNeeds = computeTeamNeeds(
    roster.map((p) => ({ position: p.player.position, overallRating: p.overallRating })),
  );

  const assignments = recommendScoutingAssignments(
    prospects.map((p) => ({
      prospectId: p.id,
      position: p.position,
      overallRating: p.overallRating,
      currentDepth: depthByProspectId.get(p.id) ?? 0,
    })),
    teamNeeds,
    remaining,
  );

  const spendByProspectId = new Map<string, number>();
  for (const prospectId of assignments) {
    spendByProspectId.set(prospectId, (spendByProspectId.get(prospectId) ?? 0) + 1);
  }

  const updates = await prisma.$transaction([
    ...Array.from(spendByProspectId.entries()).map(([prospectId, increment]) =>
      prisma.draftProspect.update({
        where: { id: prospectId },
        data: { scoutingDepth: { increment } },
        select: { id: true, scoutingDepth: true },
      }),
    ),
    prisma.scoutingAssignmentSpend.createMany({
      data: assignments.map((prospectId) => ({
        leagueId,
        season,
        leagueTeamId: userTeamId,
        kind: "FOCUSED_LOOK" as const,
        cost: 1,
        prospectId,
      })),
    }),
  ]);
  const prospectUpdates = updates.slice(0, spendByProspectId.size) as {
    id: string;
    scoutingDepth: number;
  }[];

  revalidatePath(`/leagues/${leagueId}/draft`);
  return {
    updatedDepths: prospectUpdates.map((u) => ({ prospectId: u.id, newDepth: u.scoutingDepth })),
    remaining: remaining - assignments.length,
  };
}

/**
 * Regional Sweep (Scouting Pillar Redesign, Phase 4 -
 * docs/SCOUTING_PILLAR_DESIGN.md Part 3.3) - spends 1 assignment for
 * shallow Depth on several Unknown prospects sharing a pathway. Counts
 * this league+season+pathway's prior sweeps from the ledger itself (real
 * rows, not a heuristic over Depth) so `planSweep`'s seed varies correctly
 * without the caller needing to track it.
 */
export async function runSweepAction(
  leagueId: string,
  pathway: ProspectPathway,
): Promise<{
  targetProspectIds: string[];
  newDepthByProspectId: Record<string, number>;
  remaining: number;
}> {
  const league = await requireOwnedLeagueTeam(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId!;

  const team = await prisma.leagueTeam.findUnique({ where: { id: userTeamId } });
  if (!team) throw new Error("Team not found");

  const { prospects, depthByProspectId, spends, remaining } = await loadRemainingBudget(
    leagueId,
    season,
    userTeamId,
    team.scoutingLevel,
  );
  const priorSweepsOnPathway = spends.filter(
    (s) => s.kind === "SWEEP" && s.pathway === pathway,
  ).length;

  const plan = planSweep(
    leagueId,
    season,
    pathway,
    prospects
      .filter((p) => p.pathway != null)
      .map((p) => ({
        prospectId: p.id,
        pathway: p.pathway as ProspectPathway,
        currentDepth: depthByProspectId.get(p.id) ?? 0,
      })),
    remaining,
    priorSweepsOnPathway,
  );
  if (!plan.allowed) throw new Error(plan.reason ?? "Sweep not allowed");

  await prisma.$transaction([
    prisma.draftProspect.updateMany({
      where: { id: { in: plan.targetProspectIds } },
      data: { scoutingDepth: 1 },
    }),
    prisma.scoutingAssignmentSpend.create({
      data: { leagueId, season, leagueTeamId: userTeamId, kind: "SWEEP", cost: 1, pathway },
    }),
  ]);

  revalidatePath(`/leagues/${leagueId}/draft`);
  return {
    targetProspectIds: plan.targetProspectIds,
    newDepthByProspectId: Object.fromEntries(plan.targetProspectIds.map((id) => [id, 1])),
    remaining: remaining - 1,
  };
}

/**
 * Private Workout (Scouting Pillar Redesign, Phase 4) - spends
 * PRIVATE_WORKOUT_COST assignments to resolve one hidden-trait axis
 * (work ethic or injury outlook) outright for a prospect already at
 * PRIVATE_WORKOUT_MIN_DEPTH. Stores the resolution on
 * `resolvedHiddenTraits` so every future `generateScoutingReport` call for
 * this prospect keeps returning the true value, not just this one read.
 */
export async function runPrivateWorkoutAction(
  leagueId: string,
  prospectId: string,
  axis: ResolvableHiddenAxis,
): Promise<{ resolvedHiddenTraits: string[]; remaining: number }> {
  const league = await requireOwnedLeagueTeam(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId!;

  const [prospect, team] = await Promise.all([
    prisma.draftProspect.findFirst({ where: { id: prospectId, leagueId, season } }),
    prisma.leagueTeam.findUnique({ where: { id: userTeamId } }),
  ]);
  if (!prospect) throw new Error("Prospect not found");
  if (!team) throw new Error("Team not found");
  if (prospect.resolvedHiddenTraits.includes(axis)) {
    throw new Error("This trait is already resolved for this prospect.");
  }

  const { remaining } = await loadRemainingBudget(leagueId, season, userTeamId, team.scoutingLevel);
  const check = checkPrivateWorkout(
    prospect.scoutingDepth,
    prospect.resolvedHiddenTraits.length,
    remaining,
  );
  if (!check.allowed) throw new Error(check.reason ?? "Private Workout not allowed");

  const [updated] = await prisma.$transaction([
    prisma.draftProspect.update({
      where: { id: prospectId },
      data: { resolvedHiddenTraits: { push: axis } },
      select: { resolvedHiddenTraits: true },
    }),
    prisma.scoutingAssignmentSpend.create({
      data: {
        leagueId,
        season,
        leagueTeamId: userTeamId,
        kind: "PRIVATE_WORKOUT",
        cost: PRIVATE_WORKOUT_COST,
        prospectId,
      },
    }),
  ]);

  revalidatePath(`/leagues/${leagueId}/draft`);
  return {
    resolvedHiddenTraits: updated.resolvedHiddenTraits,
    remaining: remaining - PRIVATE_WORKOUT_COST,
  };
}
