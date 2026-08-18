"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import {
  getRosterPlayersById,
  type RosterPlayerForSimulation,
} from "@/lib/actions/leagueTeamStrength";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import {
  applyFanHappinessDelta,
  applyScaledFanHappinessDelta,
  computeAllStarSelectionSentimentDelta,
  computeAllStarSnubSentimentDelta,
  computeAllStarResultSentimentDelta,
} from "@/lib/fans/sentimentEvents";
import { recordFanSentimentMany, type SentimentRecord } from "@/lib/fans/recordSentiment";
import {
  describeAllStarSelectionSentiment,
  describeAllStarSnubSentiment,
  describeAllStarResultSentiment,
} from "@/lib/fans/describeSentiment";
import {
  selectAllStars,
  type PlayerSeasonPerformanceSnapshot,
  type AllStarSelectionResult,
} from "@/lib/allstar/selection";
import { selectRisingStars, type RisingStarsCandidate } from "@/lib/allstar/risingStars";
import {
  selectThreePointParticipants,
  simulateThreePointContest,
  type ThreePointCandidate,
} from "@/lib/allstar/threePointContest";
import {
  selectDunkContestParticipants,
  simulateDunkContest,
  type DunkContestCandidate,
} from "@/lib/allstar/dunkContest";
import { simulateAllStarGame } from "@/lib/allstar/allStarGame";
import { draftTeams } from "@/lib/allstar/draftTeams";
import {
  classifyDraftHindsight,
  describeDraftHindsight,
  type DraftHindsightType,
} from "@/lib/draft/draftHindsight";
import type { NewsImportance } from "@/generated/prisma/client";
import { requireSessionUserId, assertLeagueOwned } from "@/lib/auth/requireOwnedLeague";

// A real sample by the break - same floor selection.ts uses for All-Star
// eligibility, reused here for the two contests too so a player who's
// barely played this season can't headline a contest.
const MIN_GAMES_FOR_CONTEST_ELIGIBILITY = 20;

interface RoundLike {
  round: number;
  scores: { leaguePlayerId: string; score: number }[];
  advanced: string[];
}

/** Shared by the Three-Point and Slam Dunk contests - both produce the same round-result shape. */
function deriveEventOutcomes(
  rounds: RoundLike[],
  championId: string | null,
): { leaguePlayerId: string; result: string; score: number }[] {
  const outcomes = new Map<string, { result: string; score: number }>();
  rounds.forEach((round, i) => {
    const isFinalRound = i === rounds.length - 1;
    for (const s of round.scores) {
      if (s.leaguePlayerId === championId && isFinalRound) {
        outcomes.set(s.leaguePlayerId, { result: "CHAMPION", score: s.score });
      } else if (isFinalRound) {
        outcomes.set(s.leaguePlayerId, { result: "RUNNER_UP", score: s.score });
      } else if (!round.advanced.includes(s.leaguePlayerId) && !outcomes.has(s.leaguePlayerId)) {
        outcomes.set(s.leaguePlayerId, {
          result: `ELIMINATED_ROUND_${round.round}`,
          score: s.score,
        });
      }
    }
  });
  return [...outcomes.entries()].map(([leaguePlayerId, o]) => ({ leaguePlayerId, ...o }));
}

interface NewsRow {
  type: "ALL_STAR_SELECTION" | "ALL_STAR_SNUB" | "ALL_STAR_RESULT";
  description: string;
  importance: NewsImportance;
  teamIds: string[];
}

/**
 * Generates an entire All-Star Weekend synchronously in one call: real
 * selections from this season's actual simulated performance, all three
 * contests, and the All-Star Game itself, all reusing existing engines
 * (see docs/SYSTEMS.md's All-Star Weekend section). Called once per
 * league-season, from simulateGamesAction's mid-season checkpoint. Writes
 * the AllStarWeekend row as PENDING - regular-season simulation stays
 * blocked until resolveAllStarWeekendAction below flips it to RESOLVED.
 */
export interface AllStarPerformancePool {
  performanceSnapshots: PlayerSeasonPerformanceSnapshot[];
  risingStarsCandidates: RisingStarsCandidate[];
  threePointCandidates: ThreePointCandidate[];
  dunkCandidates: DunkContestCandidate[];
  fullNameById: Map<string, string>;
  teamIdById: Map<string, string>;
}

/**
 * The same real season-so-far aggregation `generateAllStarWeekend` uses to
 * decide selections - shared so the pre-break "buzz" news roll in
 * leagueEvents.ts ranks candidates from this exact pool rather than a
 * second, separately invented signal.
 */
/**
 * Both exported helpers below are invoked server-side from already-guarded
 * actions - `generateAllStarWeekend` from `simulation.ts` and
 * `buildAllStarPerformancePool` from `leagueEvents.ts`. That is not sufficient
 * on its own: every export of a `"use server"` module is a callable POST
 * endpoint, so each is independently reachable by anyone who can name a
 * league. `generateAllStarWeekend` performs seven writes.
 *
 * 404-shaped rather than 403-shaped, matching `loadOwnedProposal` in
 * `tradeOffers.ts` - a non-owner must not learn that a league exists.
 */
async function requireOwnedLeague(leagueId: string) {
  const userId = await requireSessionUserId();

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  assertLeagueOwned(league, userId);
  return league;
}

export async function buildAllStarPerformancePool(
  leagueId: string,
  season: number,
): Promise<AllStarPerformancePool> {
  await requireOwnedLeague(leagueId);

  const rosteredPlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId, leagueTeamId: { not: null }, isActive: true },
    select: {
      id: true,
      overallRating: true,
      injuryStatus: true,
      leagueTeamId: true,
      player: { select: { fullName: true, position: true, draftYear: true, birthDate: true } },
      leagueTeam: {
        select: { wins: true, losses: true, team: { select: { conference: true } } },
      },
    },
  });

  const boxAggByPlayer = new Map(
    (
      await prisma.playerGameStat.groupBy({
        by: ["leaguePlayerId"],
        where: { leagueId, season },
        _avg: {
          minutesPlayed: true,
          points: true,
          rebounds: true,
          assists: true,
          steals: true,
          blocks: true,
          turnovers: true,
        },
        _sum: {
          points: true,
          fgAttempted: true,
          ftAttempted: true,
          fg3Made: true,
          fg3Attempted: true,
        },
        _count: { _all: true },
      })
    ).map((g) => [g.leaguePlayerId, g]),
  );

  const fullNameById = new Map(rosteredPlayers.map((p) => [p.id, p.player.fullName]));
  const teamIdById = new Map(rosteredPlayers.map((p) => [p.id, p.leagueTeamId as string]));

  const performanceSnapshots: PlayerSeasonPerformanceSnapshot[] = [];
  const risingStarsCandidates: RisingStarsCandidate[] = [];
  const threePointCandidates: ThreePointCandidate[] = [];
  const dunkCandidates: DunkContestCandidate[] = [];

  for (const p of rosteredPlayers) {
    const agg = boxAggByPlayer.get(p.id);
    const gamesPlayed = agg?._count._all ?? 0;
    if (gamesPlayed === 0) continue;

    const minutesPerGame = agg!._avg.minutesPlayed ?? 0;
    const trueShotDenominator =
      2 * ((agg!._sum.fgAttempted ?? 0) + 0.44 * (agg!._sum.ftAttempted ?? 0));
    const trueShootingPct =
      trueShotDenominator > 0 ? (agg!._sum.points ?? 0) / trueShotDenominator : 0.56;
    const gamesPlayedByTeam = p.leagueTeam ? p.leagueTeam.wins + p.leagueTeam.losses : 0;
    const teamWinPct =
      p.leagueTeam && gamesPlayedByTeam > 0 ? p.leagueTeam.wins / gamesPlayedByTeam : 0.5;

    performanceSnapshots.push({
      leaguePlayerId: p.id,
      position: p.player.position,
      conference: p.leagueTeam!.team.conference,
      overallRating: p.overallRating,
      gamesPlayed,
      minutesPerGame,
      pointsPerGame: agg!._avg.points ?? 0,
      reboundsPerGame: agg!._avg.rebounds ?? 0,
      assistsPerGame: agg!._avg.assists ?? 0,
      stealsPerGame: agg!._avg.steals ?? 0,
      blocksPerGame: agg!._avg.blocks ?? 0,
      turnoversPerGame: agg!._avg.turnovers ?? 0,
      trueShootingPct,
      teamWinPct,
      isHealthy: p.injuryStatus === "HEALTHY",
    });

    risingStarsCandidates.push({
      leaguePlayerId: p.id,
      draftYear: p.player.draftYear,
      gamesPlayed,
      minutesPerGame,
      pointsPerGame: agg!._avg.points ?? 0,
      reboundsPerGame: agg!._avg.rebounds ?? 0,
      assistsPerGame: agg!._avg.assists ?? 0,
      stealsPerGame: agg!._avg.steals ?? 0,
      blocksPerGame: agg!._avg.blocks ?? 0,
      turnoversPerGame: agg!._avg.turnovers ?? 0,
      trueShootingPct,
    });

    if (gamesPlayed >= MIN_GAMES_FOR_CONTEST_ELIGIBILITY) {
      threePointCandidates.push({
        leaguePlayerId: p.id,
        fg3Made: agg!._sum.fg3Made ?? 0,
        fg3Attempted: agg!._sum.fg3Attempted ?? 0,
        overallRating: p.overallRating,
      });
      dunkCandidates.push({
        leaguePlayerId: p.id,
        position: p.player.position,
        draftYear: p.player.draftYear,
        birthDate: p.player.birthDate,
        overallRating: p.overallRating,
      });
    }
  }

  return {
    performanceSnapshots,
    risingStarsCandidates,
    threePointCandidates,
    dunkCandidates,
    fullNameById,
    teamIdById,
  };
}

export async function generateAllStarWeekend(
  leagueId: string,
  season: number,
  triggeredAtDayIndex: number | null = null,
): Promise<{ allStarWeekendId: string }> {
  await requireOwnedLeague(leagueId);

  const {
    performanceSnapshots,
    risingStarsCandidates,
    threePointCandidates,
    dunkCandidates,
    fullNameById,
    teamIdById,
  } = await buildAllStarPerformancePool(leagueId, season);

  // --- All-Star selection ---
  const { selections, snubs } = selectAllStars(performanceSnapshots);
  const isHealthyById = new Map(performanceSnapshots.map((p) => [p.leaguePlayerId, p.isHealthy]));
  const gameRosterSelections = selections.filter(
    (s) => isHealthyById.get(s.leaguePlayerId) !== false,
  );

  // First-timer detection - real history, queried before this weekend's own
  // rows exist yet, not invented.
  const priorSelectionIds = new Set(
    (
      await prisma.allStarSelection.findMany({
        where: {
          leaguePlayerId: { in: selections.map((s) => s.leaguePlayerId) },
          allStarWeekend: { leagueId },
        },
        select: { leaguePlayerId: true },
      })
    ).map((s) => s.leaguePlayerId),
  );

  const rng = createSeededRandom(`${leagueId}-${season}-allstarweekend`);

  // --- All-Star Game ---
  // Guarded rather than assumed: a real 30-team league with real box
  // scores will always have well over 2 eligible selectees by the break,
  // but this stays defensive (e.g. a sparse/custom-sized league or a test
  // fixture with no simulated games yet) rather than crashing the whole
  // weekend - draftTeams itself intentionally throws below 2.
  const asgRoster = await getRosterPlayersById(gameRosterSelections.map((s) => s.leaguePlayerId));
  const asgRosterById = new Map(asgRoster.map((p) => [p.leaguePlayerId, p]));
  const asgSelectees = gameRosterSelections
    .map((s) => ({ player: asgRosterById.get(s.leaguePlayerId), score: s.performanceScore }))
    .filter((s): s is { player: RosterPlayerForSimulation; score: number } => !!s.player);
  const asgDraft =
    asgSelectees.length >= 2
      ? draftTeams(
          asgSelectees.map((s) => ({ leaguePlayerId: s.player.leaguePlayerId, score: s.score })),
        )
      : null;
  const asgResult = asgDraft ? simulateAllStarGame(asgSelectees, rng) : null;

  // --- Rising Stars ---
  const risingStars = selectRisingStars(risingStarsCandidates, season);
  const risingStarsRoster = await getRosterPlayersById(
    risingStars.selections.map((s) => s.leaguePlayerId),
  );
  const risingStarsRosterById = new Map(risingStarsRoster.map((p) => [p.leaguePlayerId, p]));
  const risingStarsSelectees = risingStars.selections
    .map((s) => ({
      player: risingStarsRosterById.get(s.leaguePlayerId),
      score: s.performanceScore,
    }))
    .filter((s): s is { player: RosterPlayerForSimulation; score: number } => !!s.player);
  const risingStarsDraft =
    risingStarsSelectees.length >= 2
      ? draftTeams(
          risingStarsSelectees.map((s) => ({
            leaguePlayerId: s.player.leaguePlayerId,
            score: s.score,
          })),
        )
      : null;
  const risingStarsResult = risingStarsDraft
    ? simulateAllStarGame(risingStarsSelectees, rng)
    : null;

  // --- Three-Point Contest ---
  const threePointParticipants = selectThreePointParticipants(threePointCandidates);
  const threePointResult = simulateThreePointContest(
    threePointParticipants,
    `${leagueId}-${season}-3pt`,
  );
  const threePointOutcomes = deriveEventOutcomes(
    threePointResult.rounds,
    threePointResult.championId,
  );

  // --- Slam Dunk Contest ---
  const dunkParticipants = selectDunkContestParticipants(
    dunkCandidates,
    season,
    `${leagueId}-${season}-dunk`,
  );
  const dunkResult = simulateDunkContest(dunkParticipants, `${leagueId}-${season}-dunk`);
  const dunkOutcomes = deriveEventOutcomes(dunkResult.rounds, dunkResult.championId);

  // --- Persist ---
  const weekend = await prisma.allStarWeekend.create({
    data: { leagueId, season, status: "PENDING", triggeredAtDayIndex },
  });

  await prisma.allStarSelection.createMany({
    data: selections.map((s: AllStarSelectionResult) => ({
      allStarWeekendId: weekend.id,
      leaguePlayerId: s.leaguePlayerId,
      conference: s.conference,
      positionGroup: s.positionGroup,
      role: s.role,
      performanceScore: s.performanceScore,
      pointsPerGame: s.pointsPerGame,
      reboundsPerGame: s.reboundsPerGame,
      assistsPerGame: s.assistsPerGame,
      teamWinPct: s.teamWinPct,
    })),
  });

  const risingStarsSideByPlayerId = new Map<string, string>();
  if (risingStarsDraft) {
    for (const id of risingStarsDraft.teamA)
      risingStarsSideByPlayerId.set(id, risingStarsDraft.captainAId);
    for (const id of risingStarsDraft.teamB)
      risingStarsSideByPlayerId.set(id, risingStarsDraft.captainBId);
  }
  const risingStarsStatByPlayerId = new Map(
    (risingStarsResult?.stats ?? []).map((s) => [s.leaguePlayerId, s]),
  );

  await prisma.allStarEventParticipant.createMany({
    data: [
      ...risingStars.selections.map((s) => {
        const stat = risingStarsStatByPlayerId.get(s.leaguePlayerId);
        const side = risingStarsSideByPlayerId.get(s.leaguePlayerId) ?? "";
        const isMvp = s.leaguePlayerId === risingStarsResult?.mvpLeaguePlayerId;
        return {
          allStarWeekendId: weekend.id,
          eventType: "RISING_STARS" as const,
          leaguePlayerId: s.leaguePlayerId,
          seed: 0,
          result: isMvp ? `${side}_MVP` : stat ? side : "DID_NOT_PLAY",
          score: stat?.points ?? 0,
        };
      }),
      ...threePointParticipants.map((p, i) => {
        const outcome = threePointOutcomes.find((o) => o.leaguePlayerId === p.leaguePlayerId);
        return {
          allStarWeekendId: weekend.id,
          eventType: "THREE_POINT_CONTEST" as const,
          leaguePlayerId: p.leaguePlayerId,
          seed: i,
          result: outcome?.result ?? "ELIMINATED_ROUND_1",
          score: outcome?.score ?? 0,
        };
      }),
      ...dunkParticipants.map((p, i) => {
        const outcome = dunkOutcomes.find((o) => o.leaguePlayerId === p.leaguePlayerId);
        return {
          allStarWeekendId: weekend.id,
          eventType: "SLAM_DUNK_CONTEST" as const,
          leaguePlayerId: p.leaguePlayerId,
          seed: i,
          result: outcome?.result ?? "ELIMINATED_ROUND_1",
          score: outcome?.score ?? 0,
        };
      }),
    ],
  });

  const allStarGame =
    asgDraft && asgResult
      ? await prisma.allStarGame.create({
          data: {
            allStarWeekendId: weekend.id,
            teamACaptainId: asgDraft.captainAId,
            teamBCaptainId: asgDraft.captainBId,
            teamAScore: asgResult.teamAScore,
            teamBScore: asgResult.teamBScore,
            mvpLeaguePlayerId: asgResult.mvpLeaguePlayerId,
          },
        })
      : null;

  if (allStarGame && asgResult) {
    await prisma.allStarGameStat.createMany({
      data: asgResult.stats.map((line) => ({
        allStarGameId: allStarGame.id,
        leaguePlayerId: line.leaguePlayerId,
        side: line.leagueTeamId,
        minutesPlayed: line.minutesPlayed,
        points: line.points,
        rebounds: line.rebounds,
        assists: line.assists,
        steals: line.steals,
        blocks: line.blocks,
        turnovers: line.turnovers,
        fgMade: line.fgMade,
        fgAttempted: line.fgAttempted,
        fg3Made: line.fg3Made,
        fg3Attempted: line.fg3Attempted,
        ftMade: line.ftMade,
        ftAttempted: line.ftAttempted,
      })),
    });
  }

  // --- News (all derived from the real data just computed above) ---
  const newsRows: NewsRow[] = [];
  const teamIdsFor = (leaguePlayerId: string) => {
    const teamId = teamIdById.get(leaguePlayerId);
    return teamId ? [teamId] : [];
  };

  // Fan Engagement Deepening (Phase 1) - only ever knowable right here (the
  // break), so applied directly rather than deferred to season end. The
  // generic "rosters are set" headline below is skipped for sentiment
  // purposes - it would double-credit a captain's team alongside their own
  // individual selection row in the loop right after it.
  const fanHappinessDeltaByTeam = new Map<string, number>();
  // Fans Page Redesign (Phase 1).
  const allStarSentimentRows: SentimentRecord[] = [];
  // Fans Page Redesign (Phase 3) - fetched once, up front, so every call to
  // addFanHappinessDelta below can scale by this team's Fan Culture.
  const involvedTeamIds = [...new Set(teamIdById.values())];
  const teamFanState = await prisma.leagueTeam.findMany({
    where: { id: { in: involvedTeamIds } },
    select: {
      id: true,
      fanHappiness: true,
      fanCulture: { select: { patience: true, loyalty: true } },
    },
  });
  const fanHappinessById = new Map(teamFanState.map((t) => [t.id, t.fanHappiness]));
  const cultureById = new Map(teamFanState.map((t) => [t.id, t.fanCulture]));
  // Scouting Pillar Redesign (Phase 5) - team display labels for the
  // hindsight beat below. Batched alongside teamFanState's team set rather
  // than queried per-selectee.
  const teamLabelRows = await prisma.leagueTeam.findMany({
    where: { id: { in: involvedTeamIds } },
    select: { id: true, team: { select: { city: true, name: true } } },
  });
  const teamLabelById = new Map(teamLabelRows.map((t) => [t.id, `${t.team.city} ${t.team.name}`]));
  function addFanHappinessDelta(
    teamId: string,
    rawDelta: number,
    ledger: Omit<SentimentRecord, "leagueId" | "leagueTeamId" | "season" | "delta">,
  ) {
    const delta = applyScaledFanHappinessDelta(
      fanHappinessById.get(teamId) ?? 65,
      rawDelta,
      cultureById.get(teamId) ?? null,
    ).scaledDelta;
    fanHappinessDeltaByTeam.set(teamId, (fanHappinessDeltaByTeam.get(teamId) ?? 0) + delta);
    allStarSentimentRows.push({ leagueId, leagueTeamId: teamId, season, delta, ...ledger });
  }

  const eastCaptainName = asgDraft ? (fullNameById.get(asgDraft.captainAId) ?? "A player") : null;
  const westCaptainName = asgDraft ? (fullNameById.get(asgDraft.captainBId) ?? "A player") : null;
  if (asgDraft && eastCaptainName && westCaptainName) {
    newsRows.push({
      type: "ALL_STAR_SELECTION",
      description: `All-Star Weekend rosters are set, headlined by captains ${eastCaptainName} and ${westCaptainName}.`,
      importance: "MAJOR",
      teamIds: [...teamIdsFor(asgDraft.captainAId), ...teamIdsFor(asgDraft.captainBId)],
    });
  }

  // Scouting Pillar Redesign (Phase 5) - the long-tail payoff
  // (docs/SCOUTING_PILLAR_DESIGN.md Part 3.5, "years later, via existing
  // systems"). Only ever checked for a first-time selectee (the loop below
  // already filters to that), and only ever queried for the handful of
  // first-timers rather than the whole roster - this stays cheap even in a
  // 25-year save with a large All-Star history. Walks
  // LeaguePlayer -> Player -> DraftProspect, the durable link Phase 5 added
  // specifically to make this reachable years after the draft.
  const firstTimeLeaguePlayerIds = selections
    .filter((s) => s.role !== "INJURY_REPLACEMENT" && !priorSelectionIds.has(s.leaguePlayerId))
    .map((s) => s.leaguePlayerId);
  const userTeamId = (
    await prisma.league.findUnique({
      where: { id: leagueId },
      select: { userControlledTeamId: true },
    })
  )?.userControlledTeamId;
  const hindsightByLeaguePlayerId = new Map<
    string,
    { type: DraftHindsightType; scoutingDepthAtDraft: number }
  >();
  if (firstTimeLeaguePlayerIds.length > 0) {
    const withDraftHistory = await prisma.leaguePlayer.findMany({
      where: { id: { in: firstTimeLeaguePlayerIds } },
      select: {
        id: true,
        leagueTeamId: true,
        player: { select: { draftProspect: { select: { scoutingDepth: true } } } },
      },
    });
    for (const lp of withDraftHistory) {
      const depth = lp.player.draftProspect?.scoutingDepth;
      if (depth == null) continue; // never drafted in this league (imported/free agent), or pre-Phase-5 save with no link
      const type = classifyDraftHindsight({
        scoutingDepthAtDraft: depth,
        isOnUserTeam: lp.leagueTeamId === userTeamId,
      });
      if (type) hindsightByLeaguePlayerId.set(lp.id, { type, scoutingDepthAtDraft: depth });
    }
  }

  for (const s of selections) {
    if (s.role === "INJURY_REPLACEMENT" || priorSelectionIds.has(s.leaguePlayerId)) continue;
    const name = fullNameById.get(s.leaguePlayerId) ?? "A player";
    // No per-selection news row. This loop fires on a player's first selection
    // *in this save*, which for an imported real player says nothing true: the
    // simulator holds no real-world career history, so it announced LeBron
    // James and Stephen Curry as first-time All-Stars in season one. Dropping
    // the wording to "earns an All-Star selection" made it accurate but not
    // worth reading - sixteen near-identical lines that pushed real news off
    // the front page for one simulated weekend.
    //
    // The roster announcement, the game result and the snubs still file, and
    // so does the draft-hindsight beat below, which is about a player this
    // save drafted itself and therefore does know the whole career of.
    const teamId = teamIdById.get(s.leaguePlayerId);
    if (teamId) {
      addFanHappinessDelta(teamId, computeAllStarSelectionSentimentDelta(), {
        kind: "ALL_STAR_SELECTION",
        description: describeAllStarSelectionSentiment(name),
        leaguePlayerId: s.leaguePlayerId,
      });
    }
    const hindsight = hindsightByLeaguePlayerId.get(s.leaguePlayerId);
    if (hindsight && teamId) {
      const currentTeamLabel = teamLabelById.get(teamId) ?? "their team";
      newsRows.push({
        type: "ALL_STAR_SELECTION",
        description: describeDraftHindsight(
          hindsight.type,
          name,
          hindsight.scoutingDepthAtDraft,
          currentTeamLabel,
        ),
        importance: "MAJOR",
        teamIds: teamIdsFor(s.leaguePlayerId),
      });
    }
  }

  for (const snub of snubs) {
    const name = fullNameById.get(snub.leaguePlayerId) ?? "A player";
    const rating =
      performanceSnapshots.find((p) => p.leaguePlayerId === snub.leaguePlayerId)?.overallRating ??
      70;
    newsRows.push({
      type: "ALL_STAR_SNUB",
      description: `${name} headlines this year's All-Star snubs after a strong season.`,
      importance: importanceForRating(rating),
      teamIds: teamIdsFor(snub.leaguePlayerId),
    });
    const teamId = teamIdById.get(snub.leaguePlayerId);
    if (teamId) {
      addFanHappinessDelta(teamId, computeAllStarSnubSentimentDelta(), {
        kind: "ALL_STAR_SNUB",
        description: describeAllStarSnubSentiment(name),
        leaguePlayerId: snub.leaguePlayerId,
      });
    }
  }

  if (threePointResult.championId) {
    const threePointChampName = fullNameById.get(threePointResult.championId) ?? "A player";
    newsRows.push({
      type: "ALL_STAR_RESULT",
      description: `${threePointChampName} wins the Three-Point Contest.`,
      importance: "STANDARD",
      teamIds: teamIdsFor(threePointResult.championId),
    });
    const teamId = teamIdById.get(threePointResult.championId);
    if (teamId) {
      addFanHappinessDelta(teamId, computeAllStarResultSentimentDelta(), {
        kind: "ALL_STAR_RESULT",
        description: describeAllStarResultSentiment(threePointChampName),
        leaguePlayerId: threePointResult.championId,
      });
    }
  }

  if (dunkResult.championId) {
    const dunkChampName = fullNameById.get(dunkResult.championId) ?? "A player";
    newsRows.push({
      type: "ALL_STAR_RESULT",
      description: `${dunkChampName} wins the Slam Dunk Contest.`,
      importance: "STANDARD",
      teamIds: teamIdsFor(dunkResult.championId),
    });
    const teamId = teamIdById.get(dunkResult.championId);
    if (teamId) {
      addFanHappinessDelta(teamId, computeAllStarResultSentimentDelta(), {
        kind: "ALL_STAR_RESULT",
        description: describeAllStarResultSentiment(dunkChampName),
        leaguePlayerId: dunkResult.championId,
      });
    }
  }

  if (risingStarsResult) {
    const risingStarsMvpName = fullNameById.get(risingStarsResult.mvpLeaguePlayerId) ?? "A player";
    newsRows.push({
      type: "ALL_STAR_RESULT",
      description: `${risingStarsMvpName} is named Rising Stars MVP.`,
      importance: "STANDARD",
      teamIds: teamIdsFor(risingStarsResult.mvpLeaguePlayerId),
    });
    const teamId = teamIdById.get(risingStarsResult.mvpLeaguePlayerId);
    if (teamId) {
      addFanHappinessDelta(teamId, computeAllStarResultSentimentDelta(), {
        kind: "ALL_STAR_RESULT",
        description: describeAllStarResultSentiment(risingStarsMvpName),
        leaguePlayerId: risingStarsResult.mvpLeaguePlayerId,
      });
    }
  }

  if (asgResult && eastCaptainName && westCaptainName) {
    const asgMvpName = fullNameById.get(asgResult.mvpLeaguePlayerId) ?? "A player";
    newsRows.push({
      type: "ALL_STAR_RESULT",
      description: `All-Star Game final: ${eastCaptainName}'s team ${asgResult.teamAScore}, ${westCaptainName}'s team ${asgResult.teamBScore}. ${asgMvpName} named All-Star Game MVP.`,
      importance: "MAJOR",
      teamIds: teamIdsFor(asgResult.mvpLeaguePlayerId),
    });
    const teamId = teamIdById.get(asgResult.mvpLeaguePlayerId);
    if (teamId) {
      addFanHappinessDelta(teamId, computeAllStarResultSentimentDelta(), {
        kind: "ALL_STAR_RESULT",
        description: describeAllStarResultSentiment(asgMvpName),
        leaguePlayerId: asgResult.mvpLeaguePlayerId,
      });
    }
  }

  await prisma.leagueTransaction.createMany({
    data: newsRows.map((row) => ({
      leagueId,
      season,
      type: row.type,
      description: row.description,
      importance: row.importance,
      teamIds: row.teamIds,
    })),
  });

  // Fan Engagement Deepening (Phase 1) - one flush for everything accumulated
  // above, reusing the fanHappiness snapshot fetched up front (Phase 3) -
  // it's read-only for this whole pass, no event in this function re-reads
  // a team's happiness mid-way through.
  if (fanHappinessDeltaByTeam.size > 0) {
    await Promise.all([
      ...[...fanHappinessDeltaByTeam.entries()].map(([teamId, delta]) =>
        prisma.leagueTeam.update({
          where: { id: teamId },
          data: {
            fanHappiness: applyFanHappinessDelta(fanHappinessById.get(teamId) ?? 65, delta),
          },
        }),
      ),
      recordFanSentimentMany(allStarSentimentRows),
    ]);
  }

  return { allStarWeekendId: weekend.id };
}

/** The one action that unblocks simulateGamesAction again once the user has viewed (or skipped) the weekend. */
export async function resolveAllStarWeekendAction(leagueId: string): Promise<void> {
  const userId = await requireSessionUserId();

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  assertLeagueOwned(league, userId);

  await prisma.allStarWeekend.updateMany({
    where: { leagueId, season: league.currentSeason, status: "PENDING" },
    data: { status: "RESOLVED" },
  });

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/all-star`);
}
