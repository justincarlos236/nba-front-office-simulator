"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateContract } from "@/lib/contracts/generateContract";
import { DRAFT_ROOKIE_ASSUMED_AGE } from "@/lib/gm/draftPickTradeValue";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { computeTeamDraftContexts, fetchRostersByTeam } from "@/lib/gm/teamDraftContext";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import { pickBestProspectForTeam, type DraftAiTeamContext } from "@/lib/draft/draftAi";
import {
  rollForDraftPickTrade,
  type DraftPickTradeTeam,
  type DraftPickForTrade,
} from "@/lib/draft/draftPickTradeRoll";
import { computeExpectedDraftRank, classifySelection } from "@/lib/draft/draftNightNarrative";
import {
  describeTrade,
  describeDraftReach,
  describeDraftSteal,
} from "@/lib/transactions/describeTransaction";
import { generatePersonalityProfile } from "@/lib/morale/generatePersonality";
import { computeBigBoard } from "@/lib/draft/bigBoard";
import {
  computeDraftResolutionSummary,
  type DraftResolutionSummary,
} from "@/lib/draft/draftResolution";
import { Prisma, type NewsImportance, type ProspectPathway } from "@/generated/prisma/client";

const DRAFT_LEAGUE_INCLUDE = { teams: { include: { team: true } } } as const;

export type DraftLeague = Prisma.LeagueGetPayload<{ include: typeof DRAFT_LEAGUE_INCLUDE }>;

async function requireOwnedLeague(leagueId: string): Promise<DraftLeague> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: DRAFT_LEAGUE_INCLUDE,
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
  heightInches: number | null;
  weightLbs: number | null;
  round: number;
  overallPickNumber: number;
  /** Scouting Pillar Redesign (Phase 4) - carried onto the real Player row; previously silently dropped at this exact boundary. */
  pathway: ProspectPathway | null;
}

/**
 * Turns a batch of (pick, prospect) assignments into real roster additions:
 * a reference `Player` row (fictional - no real future draft class exists,
 * see docs/SYSTEMS.md), a `LeaguePlayer`, and a rookie-scale contract,
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
      heightInches: a.heightInches,
      weightLbs: a.weightLbs,
      pathway: a.pathway,
      // Scouting Pillar Redesign (Phase 5) - the durable link back to this
      // prospect's scouting record (Depth, resolvedHiddenTraits), for the
      // post-draft recap and the long-tail "you passed on a future
      // All-Star" News beat.
      draftProspectId: a.prospectId,
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
      reSigningTeamId: a.leagueTeamId,
      overallRating: a.overallRating,
      potentialRating: a.potentialRating,
      // Franchise Finances (Phase D) - a drafted rookie is homegrown, and
      // their tenure clock starts at this draft season. This is what lets a
      // player the team drafted and kept grow into a genuine franchise icon.
      joinedTeamSeason: rookieSeason,
      homegrown: true,
    })),
  });
  const prospectIdToLeaguePlayerId = new Map(
    assignments.map((a, i) => [a.prospectId, createdLeaguePlayers[i].id]),
  );

  // Player Morale & Personality System - every rookie gets a persistent
  // personality the moment they enter the league, same as real players do
  // at bootstrap (src/lib/actions/league.ts).
  await prisma.playerPersonalityProfile.createMany({
    data: createdLeaguePlayers.map((lp) => ({
      leaguePlayerId: lp.id,
      ...generatePersonalityProfile(lp.id),
    })),
  });

  const contractPlans = assignments.map((a) => ({
    prospectId: a.prospectId,
    leagueTeamId: a.leagueTeamId,
    contract: generateContract({
      season: rookieSeason,
      overallRating: a.overallRating,
      // A rookie has never played an NBA game, so there is no production to
      // weigh against his rating - `contractQualityScore` prices him off the
      // rating alone rather than inventing a box score for him.
      performanceScore: null,
      gamesPlayed: 0,
      // Draft classes are generated at 19-22; the exact age isn't carried
      // through the assignment, and the same fixed assumption is already
      // used for projecting future picks (`draftPickTradeValue.ts`).
      age: DRAFT_ROOKIE_ASSUMED_AGE,
      yearsOfExperience: 0,
      position: a.position,
      // First-rounders take the rookie scale; second-rounders price normally
      // and land at the minimum. See src/lib/contracts/rookieScale.ts.
      overallPickNumber: a.overallPickNumber,
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
  /** Set only when this pick changed hands via an in-draft CPU trade right before it was made. */
  tradedFromTeamId: string | null;
  /** "REACH" or "STEAL" only when this selection genuinely clears the notable-movement threshold - see draftNightNarrative.ts. */
  narrative: "REACH" | "STEAL" | null;
  /** Scouting Pillar Redesign (Phase 5) - only ever set for the user's own pick (makeDraftPickAction), never a CPU selection. Deliberately excludes potentialRating/bustRisk/any verdict - see draftResolution.ts. */
  resolutionSummary: DraftResolutionSummary | null;
}

interface MutableTeamState {
  leagueTeamId: string;
  teamLabel: string;
  tradeContext: DraftPickTradeTeam;
}

/**
 * Builds every CPU team's draft-relevant context in one pass: roster
 * (for team-needs and in-draft trade value), competitive identity, and
 * persisted GM personality - the same shape `maybeExecuteCpuTrade`
 * (src/lib/actions/leagueEvents.ts) already builds for regular-season
 * CPU-CPU trades, reused here rather than duplicated.
 */
async function buildCpuTeamStates(
  leagueId: string,
  season: number,
  teams: { id: string; wins: number; losses: number; gmPersonality: string }[],
  userTeamId: string | null,
  /** Future seasons each team still owns its own first-rounder for - the Stepien input. */
  ownedFutureFirstsByTeam: Map<string, number[]> = new Map(),
): Promise<
  Map<
    string,
    MutableTeamState & {
      roster: { position: "PG" | "SG" | "SF" | "PF" | "C"; overallRating: number }[];
    }
  >
> {
  const [contextByTeam, rosterByTeam] = await Promise.all([
    computeTeamDraftContexts(leagueId, season, teams),
    fetchRostersByTeam(
      leagueId,
      season,
      teams.map((t) => t.id),
    ),
  ]);

  const states = new Map<
    string,
    MutableTeamState & {
      roster: { position: "PG" | "SG" | "SF" | "PF" | "C"; overallRating: number }[];
    }
  >();
  for (const t of teams) {
    if (t.id === userTeamId) continue;
    const roster = rosterByTeam.get(t.id) ?? [];
    const { identity, needs } = contextByTeam.get(t.id)!;

    states.set(t.id, {
      leagueTeamId: t.id,
      teamLabel: "", // filled in by the caller, which already has team labels
      roster: roster.map((p) => ({ position: p.position, overallRating: p.overallRating })),
      tradeContext: {
        leagueTeamId: t.id,
        identity,
        needs,
        personality: t.gmPersonality as DraftAiTeamContext["personality"],
        roster: roster.map((p) => ({ overallRating: p.overallRating, age: p.age })),
        ownedFutureFirstRoundPickSeasons: ownedFutureFirstsByTeam.get(t.id) ?? [],
      },
    });
  }
  return states;
}

/**
 * Resolves every CPU-owned pick in order using the draft-AI (team needs,
 * identity, and personality - see `draftAi.ts` - not simple best-rating-
 * available) until it reaches a pick owned by the user's team, or the
 * draft ends. Also rolls for occasional in-draft CPU-CPU pick trades
 * (`draftPickTradeRoll.ts`) and detects genuine reaches/steals
 * (`draftNightNarrative.ts`), logging real news for both. Returns the
 * ordered list of what was resolved so the client can animate the board
 * filling in pick by pick instead of jumping straight to the end state.
 */
export async function advanceDraftAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId;

  const [allPicks, allProspects, futurePicks] = await Promise.all([
    prisma.draftPick.findMany({
      where: { leagueId, season, overallPickNumber: { not: null } },
      orderBy: { overallPickNumber: "asc" },
    }),
    prisma.draftProspect.findMany({ where: { leagueId, season } }),
    // Picks in LATER drafts. A future first is the archetypal draft-night
    // sweetener, and without these a team could only move up when it happened
    // to hold a second pick in this same draft.
    prisma.draftPick.findMany({
      where: { leagueId, season: { gt: season }, selectedProspectId: null },
      orderBy: [{ season: "asc" }, { round: "asc" }],
    }),
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
  let availableProspects = allProspects.filter((p) => !draftedProspectIds.has(p.id));
  const expectedRankById = computeExpectedDraftRank(allProspects);

  const teamLabelById = new Map(league.teams.map((t) => [t.id, `${t.team.city} ${t.team.name}`]));
  // Stepien input: which future firsts each team still owns its own copy of.
  const ownedFutureFirstsByTeam = new Map<string, number[]>();
  for (const p of futurePicks) {
    if (p.round !== 1 || p.originalTeamId !== p.currentOwnerId) continue;
    ownedFutureFirstsByTeam.set(p.currentOwnerId, [
      ...(ownedFutureFirstsByTeam.get(p.currentOwnerId) ?? []),
      p.season,
    ]);
  }
  const competitivenessPercentiles = await computeCompetitivenessPercentiles(league.teams);
  const teamStates = await buildCpuTeamStates(
    leagueId,
    season,
    league.teams,
    userTeamId,
    ownedFutureFirstsByTeam,
  );
  for (const state of teamStates.values())
    state.teamLabel = teamLabelById.get(state.leagueTeamId) ?? "Unknown";

  // Mutable in-memory ownership map so an in-draft trade this same batch
  // is immediately reflected for every subsequent pick's evaluation -
  // never written to the DB until this whole batch resolves.
  const ownerByPickId = new Map(
    [...pendingPicks, ...futurePicks].map((p) => [p.id, p.currentOwnerId]),
  );

  const assignments: ProspectAssignment[] = [];
  const resolvedExtras = new Map<
    string,
    { tradedFromTeamId: string | null; narrative: "REACH" | "STEAL" | null }
  >();
  const tradeRows: {
    fromTeamId: string;
    toTeamId: string;
    pickIdsFromTo: string[];
    pickIdsToFrom: string[];
  }[] = [];
  const newsRows: {
    type: "TRADE" | "DRAFT_SELECTION";
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[] = [];

  for (const pick of pendingPicks) {
    const currentOwner = ownerByPickId.get(pick.id)!;
    if (currentOwner === userTeamId) break;

    const teamOnClockState = teamStates.get(currentOwner);
    if (!teamOnClockState) break; // defensive - every non-user team was built above

    // 1. Roll for an in-draft CPU-CPU trade of this pick before it's made.
    const partnersByTeam = new Map<string, DraftPickForTrade[]>();
    const addOffer = (ownerId: string, offer: DraftPickForTrade) => {
      partnersByTeam.set(ownerId, [...(partnersByTeam.get(ownerId) ?? []), offer]);
    };
    for (const other of pendingPicks) {
      if (other.id === pick.id) continue;
      const otherOwner = ownerByPickId.get(other.id)!;
      if (otherOwner === userTeamId || otherOwner === currentOwner) continue;
      if (other.overallPickNumber! <= pick.overallPickNumber!) continue;
      addOffer(otherOwner, {
        pickId: other.id,
        overallPickNumber: other.overallPickNumber!,
        round: other.round as 1 | 2,
        season,
      });
    }
    for (const future of futurePicks) {
      const futureOwner = ownerByPickId.get(future.id)!;
      if (futureOwner === userTeamId || futureOwner === currentOwner) continue;
      addOffer(futureOwner, {
        pickId: future.id,
        // Not ordered yet - the value model projects a slot from the ORIGINAL
        // team's competitiveness, not the current holder's.
        overallPickNumber: null,
        round: future.round as 1 | 2,
        season: future.season,
        originalTeamCompetitivenessPercentile:
          competitivenessPercentiles.get(future.originalTeamId) ?? 0.5,
      });
    }
    const partners = [...partnersByTeam.entries()]
      .map(([teamId, picks]) => {
        const partnerState = teamStates.get(teamId);
        return partnerState ? { team: partnerState.tradeContext, picks } : null;
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    let effectiveOwner = currentOwner;
    if (partners.length > 0) {
      const tradeRng = createSeededRandom(
        `${leagueId}-${season}-draft-trade-${pick.overallPickNumber}`,
      );
      const tradeResult = rollForDraftPickTrade(
        season,
        teamOnClockState.tradeContext,
        { pickId: pick.id, overallPickNumber: pick.overallPickNumber!, round: pick.round as 1 | 2 },
        partners,
        tradeRng,
      );
      if (tradeResult) {
        ownerByPickId.set(pick.id, tradeResult.partner.leagueTeamId);
        for (const received of tradeResult.picksReceived) {
          ownerByPickId.set(received.pickId, currentOwner);
        }
        effectiveOwner = tradeResult.partner.leagueTeamId;
        resolvedExtras.set(pick.id, { tradedFromTeamId: currentOwner, narrative: null });

        const partnerLabel =
          teamStates.get(tradeResult.partner.leagueTeamId)?.teamLabel ?? "Unknown";
        newsRows.push({
          type: "TRADE",
          description: describeTrade(
            {
              teamLabel: teamOnClockState.teamLabel,
              sentAssetNames: [`Pick ${pick.overallPickNumber}`],
            },
            {
              teamLabel: partnerLabel,
              // A future pick has no slot yet, so name it by draft year and
              // round rather than printing "Pick null" onto the wire.
              sentAssetNames: tradeResult.picksReceived.map((p) =>
                p.overallPickNumber !== null
                  ? `Pick ${p.overallPickNumber}`
                  : `${p.season ?? season} ${p.round === 1 ? "1st" : "2nd"} Round Pick`,
              ),
            },
          ),
          importance: "STANDARD" as NewsImportance,
          teamIds: [currentOwner, tradeResult.partner.leagueTeamId],
        });
        tradeRows.push({
          fromTeamId: currentOwner,
          toTeamId: tradeResult.partner.leagueTeamId,
          pickIdsFromTo: [pick.id],
          pickIdsToFrom: tradeResult.picksReceived.map((p) => p.pickId),
        });
      }
    }

    // 2. The (possibly new) owner's draft-AI selects from the board.
    const teamState = teamStates.get(effectiveOwner);
    if (!teamState) break;
    if (availableProspects.length === 0) break;

    const pickRng = createSeededRandom(
      `${leagueId}-${season}-draft-pick-${pick.overallPickNumber}`,
    );
    const chosen = pickBestProspectForTeam(availableProspects, teamState.tradeContext, pickRng);
    availableProspects = availableProspects.filter((p) => p.id !== chosen.id);

    // Update this team's in-memory roster/needs so a second pick later in
    // this same batch (common in round 2) knows about the need it just
    // addressed with its own earlier pick.
    teamState.roster.push({ position: chosen.position, overallRating: chosen.overallRating });
    teamState.tradeContext.needs = computeTeamNeeds(teamState.roster);
    teamState.tradeContext.roster = [
      ...teamState.tradeContext.roster,
      { overallRating: chosen.overallRating, age: 20 },
    ];

    const narrative = classifySelection(expectedRankById.get(chosen.id)!, pick.overallPickNumber!);
    const extra = resolvedExtras.get(pick.id) ?? { tradedFromTeamId: null, narrative: null };
    extra.narrative = narrative;
    resolvedExtras.set(pick.id, extra);
    if (narrative === "REACH") {
      newsRows.push({
        type: "DRAFT_SELECTION",
        description: describeDraftReach(
          teamState.teamLabel,
          chosen.fullName,
          pick.overallPickNumber!,
          expectedRankById.get(chosen.id)!,
        ),
        importance: "MAJOR",
        teamIds: [effectiveOwner],
      });
    } else if (narrative === "STEAL") {
      newsRows.push({
        type: "DRAFT_SELECTION",
        description: describeDraftSteal(
          teamState.teamLabel,
          chosen.fullName,
          pick.overallPickNumber!,
          expectedRankById.get(chosen.id)!,
          chosen.pathway,
        ),
        importance: "MAJOR",
        teamIds: [effectiveOwner],
      });
    }

    assignments.push({
      pickId: pick.id,
      prospectId: chosen.id,
      leagueTeamId: effectiveOwner,
      fullName: chosen.fullName,
      position: chosen.position,
      overallRating: chosen.overallRating,
      potentialRating: chosen.potentialRating,
      heightInches: chosen.heightInches,
      weightLbs: chosen.weightLbs,
      pathway: chosen.pathway,
      round: pick.round,
      overallPickNumber: pick.overallPickNumber!,
    });
  }

  await Promise.all([
    draftProspectsToTeams(leagueId, season + 1, assignments),
    ...tradeRows.map(async (t) => {
      const trade = await prisma.trade.create({
        data: {
          leagueId,
          proposedById: t.fromTeamId,
          status: "EXECUTED",
          resolvedAt: new Date(),
          validationResult: { cpuGenerated: true, context: "in-draft" },
        },
      });
      await prisma.tradeAsset.createMany({
        data: [
          ...t.pickIdsFromTo.map((pickId) => ({
            tradeId: trade.id,
            type: "DRAFT_PICK" as const,
            fromLeagueTeamId: t.fromTeamId,
            toLeagueTeamId: t.toTeamId,
            draftPickId: pickId,
          })),
          ...t.pickIdsToFrom.map((pickId) => ({
            tradeId: trade.id,
            type: "DRAFT_PICK" as const,
            fromLeagueTeamId: t.toTeamId,
            toLeagueTeamId: t.fromTeamId,
            draftPickId: pickId,
          })),
        ],
      });
      await Promise.all([
        ...t.pickIdsFromTo.map((pickId) =>
          prisma.draftPick.update({ where: { id: pickId }, data: { currentOwnerId: t.toTeamId } }),
        ),
        ...t.pickIdsToFrom.map((pickId) =>
          prisma.draftPick.update({
            where: { id: pickId },
            data: { currentOwnerId: t.fromTeamId },
          }),
        ),
      ]);
    }),
  ]);

  if (newsRows.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: newsRows.map((row) => ({ ...row, leagueId, season })),
    });
  }

  revalidatePath(`/leagues/${leagueId}/draft`);

  const resolvedPicks: ResolvedPick[] = assignments.map((a) => {
    const extra = resolvedExtras.get(a.pickId) ?? { tradedFromTeamId: null, narrative: null };
    return {
      pickId: a.pickId,
      overallPickNumber: a.overallPickNumber,
      round: a.round,
      leagueTeamId: a.leagueTeamId,
      prospectId: a.prospectId,
      fullName: a.fullName,
      position: a.position,
      overallRating: a.overallRating,
      potentialRating: a.potentialRating,
      tradedFromTeamId: extra.tradedFromTeamId,
      narrative: extra.narrative,
      resolutionSummary: null,
    };
  });

  return { done: assignments.length === pendingPicks.length, resolvedPicks };
}

/**
 * The user selecting a prospect for their own team's current pick.
 * Re-validates everything server-side (never trusts the client-rendered
 * "available prospects" board): the pick must exist, be unowned, belong
 * to the user's team, and be next in pick order, and the prospect must
 * still be on the board. Reaches/steals are detected symmetrically for
 * the user's own picks too - see draftNightNarrative.ts.
 */
export async function makeDraftPickAction(leagueId: string, prospectId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId;
  if (!userTeamId) throw new Error("You don't control a team in this league");

  const nextPick = await prisma.draftPick.findFirst({
    where: { leagueId, season, overallPickNumber: { not: null }, selectedProspectId: null },
    orderBy: { overallPickNumber: "asc" },
  });
  if (!nextPick) throw new Error("There are no picks remaining in this draft.");
  if (nextPick.currentOwnerId !== userTeamId) {
    throw new Error("It's not your team's turn to pick.");
  }

  const [prospect, allProspects] = await Promise.all([
    prisma.draftProspect.findUnique({ where: { id: prospectId } }),
    prisma.draftProspect.findMany({ where: { leagueId, season } }),
  ]);
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
      heightInches: prospect.heightInches,
      weightLbs: prospect.weightLbs,
      pathway: prospect.pathway,
      round: nextPick.round,
      overallPickNumber: nextPick.overallPickNumber!,
    },
  ]);

  revalidatePath(`/leagues/${leagueId}/draft`);

  const expectedRankById = computeExpectedDraftRank(allProspects);
  const narrative = classifySelection(
    expectedRankById.get(prospect.id)!,
    nextPick.overallPickNumber!,
  );
  if (narrative) {
    const userTeam = league.teams.find((t) => t.id === userTeamId);
    const teamLabel = userTeam ? `${userTeam.team.city} ${userTeam.team.name}` : "Your team";
    const description =
      narrative === "REACH"
        ? describeDraftReach(
            teamLabel,
            prospect.fullName,
            nextPick.overallPickNumber!,
            expectedRankById.get(prospect.id)!,
          )
        : describeDraftSteal(
            teamLabel,
            prospect.fullName,
            nextPick.overallPickNumber!,
            expectedRankById.get(prospect.id)!,
            prospect.pathway,
          );
    await prisma.leagueTransaction.create({
      data: {
        leagueId,
        season,
        type: "DRAFT_SELECTION",
        description,
        importance: "MAJOR",
        teamIds: [userTeamId],
      },
    });
  }

  // Scouting Pillar Redesign (Phase 5) - the post-draft recap's two rank
  // inputs, computed at the exact moment of the pick (never persisted
  // separately - both are cheaply re-derivable from data already loaded
  // above). The tournament factor is always folded in here, same
  // "the window has closed" reasoning DraftExperience already uses for its
  // own Big Board.
  const bookmark = await prisma.draftProspectBookmark.findUnique({
    where: { leagueId_prospectId: { leagueId, prospectId } },
    select: { boardRank: true },
  });
  const bigBoardRank = computeBigBoard(allProspects, true).find(
    (e) => e.prospectId === prospectId,
  )!.publicRank;

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
    tradedFromTeamId: null,
    narrative,
    resolutionSummary: computeDraftResolutionSummary({
      scoutingDepth: prospect.scoutingDepth,
      resolvedHiddenTraits: prospect.resolvedHiddenTraits,
      myBoardRank: bookmark?.boardRank ?? null,
      bigBoardRank,
    }),
  };

  return { drafted: true, resolvedPick };
}

/** Toggles a bookmark on/off for "build your own draft board" - a league is one user's save, so no separate per-user dimension is needed. */
export async function toggleDraftProspectBookmarkAction(leagueId: string, prospectId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;

  const existing = await prisma.draftProspectBookmark.findUnique({
    where: { leagueId_prospectId: { leagueId, prospectId } },
  });

  if (existing) {
    await prisma.draftProspectBookmark.delete({ where: { id: existing.id } });
    revalidatePath(`/leagues/${leagueId}/draft`);
    return { bookmarked: false };
  }

  // Scouting Pillar Redesign (Phase 3) - joins the bottom of the player's
  // own Draft Board (docs/SCOUTING_PILLAR_DESIGN.md Part 3.4), one rank
  // past whatever's currently lowest. Starts at 1 for an empty board.
  const lowestRanked = await prisma.draftProspectBookmark.findFirst({
    where: { leagueId, season },
    orderBy: { boardRank: "desc" },
    select: { boardRank: true },
  });
  const boardRank = (lowestRanked?.boardRank ?? 0) + 1;

  await prisma.draftProspectBookmark.create({ data: { leagueId, season, prospectId, boardRank } });
  revalidatePath(`/leagues/${leagueId}/draft`);
  return { bookmarked: true, boardRank };
}

/**
 * Reorders the player's Draft Board (Scouting Pillar Redesign, Phase 3) -
 * takes the full new ordering of prospect ids and rewrites every boardRank
 * to match, rather than a series of individual swaps that could race with
 * each other or leave gaps. `orderedProspectIds` must be exactly the set of
 * currently-bookmarked prospects for this league/season - anything else is
 * rejected rather than silently reconciled, since a mismatch means the
 * client's view of the board is already stale.
 */
export async function reorderDraftBoardAction(
  leagueId: string,
  orderedProspectIds: string[],
): Promise<void> {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;

  const existing = await prisma.draftProspectBookmark.findMany({
    where: { leagueId, season },
    select: { id: true, prospectId: true },
  });
  const idByProspectId = new Map(existing.map((b) => [b.prospectId, b.id]));

  if (
    orderedProspectIds.length !== existing.length ||
    !orderedProspectIds.every((id) => idByProspectId.has(id))
  ) {
    throw new Error("Draft Board is out of date - refresh and try again.");
  }

  await prisma.$transaction(
    orderedProspectIds.map((prospectId, index) =>
      prisma.draftProspectBookmark.update({
        where: { id: idByProspectId.get(prospectId)! },
        data: { boardRank: index + 1 },
      }),
    ),
  );

  revalidatePath(`/leagues/${leagueId}/draft`);
}
