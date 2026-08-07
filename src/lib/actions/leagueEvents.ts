import { prisma } from "@/lib/prisma";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { getSeasonCapRules } from "@/lib/cap/constants";
import {
  rollForCpuSigning,
  rollForCpuTrade,
  rollForTeamInjury,
  shouldTriggerEvent,
  type CpuTeam,
} from "@/lib/simulation/leagueEvents";
import {
  describeSigning,
  describeTrade,
  describePlayerMoraleEvent,
  describeTradeRequest,
} from "@/lib/transactions/describeTransaction";
import { highestImportance, importanceForRating } from "@/lib/transactions/newsImportance";
import { buildAllStarPerformancePool } from "@/lib/actions/allStarWeekend";
import { selectAllStars } from "@/lib/allstar/selection";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { departmentQualityDelta } from "@/lib/finances/departments";
import { sumCompletedProjectEffects } from "@/lib/finances/capitalProjects";
import { computeTeamIdentity } from "@/lib/gm/teamIdentity";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import { estimateAge } from "@/lib/players/age";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  applyFanHappinessDelta,
  applyScaledFanHappinessDelta,
  computeTradeSentimentDelta,
  computeSigningSentimentDelta,
  computeInjurySentimentDelta,
  computeInjuryRecoverySentimentDelta,
} from "@/lib/fans/sentimentEvents";
import {
  recordFanSentimentMany,
  recordFanSentimentManyTx,
  fanSentimentCreateOps,
  type SentimentRecord,
} from "@/lib/fans/recordSentiment";
import {
  describeTradeSentiment,
  describeSigningSentiment,
  describeInjurySentiment,
} from "@/lib/fans/describeSentiment";
import { playerFillsNeed } from "@/lib/trade/evaluateTradeOffer";
import {
  computeMoraleAfterTrade,
  computeTeamPerformanceMoraleDelta,
  computeMinutesShortfallMoraleDelta,
  MORALE_NEWS_THRESHOLD,
} from "@/lib/morale/moraleEvents";
import { applyMoraleChange } from "@/lib/morale/moraleLevel";
import type { PlayerPersonalityAxes } from "@/lib/morale/generatePersonality";
import { computeFranchisePopularity } from "@/lib/fans/fanHappiness";
import {
  rollForBusinessDecision,
  MAX_PENDING_BUSINESS_DECISIONS,
  computeMarketingSponsorshipMultiplier,
  type BusinessDecisionOption,
} from "@/lib/finances/businessDecisions";
import type { NewsImportance } from "@/generated/prisma/client";

const INJURY_CHANCE_PER_TEAM_GAME = 0.02;
const TRADE_CHANCE_PER_GAME = 0.006;
const SIGNING_CHANCE_PER_GAME = 0.01;
// All-Star Weekend "buzz" news (the weeks-out anticipation the user asked
// for) - only fires once the user's own team is in a believable pre-break
// window, ranked from the exact same selectAllStars pool the real weekend
// will later use, never a separately invented signal.
const ALL_STAR_BUZZ_CHANCE_PER_GAME = 0.015;
const ALL_STAR_BUZZ_WINDOW_MIN_GAMES = 30;
const ALL_STAR_BUZZ_WINDOW_MAX_GAMES = 40;

export interface SimulatedGameTeams {
  homeLeagueTeamId: string;
  awayLeagueTeamId: string;
}

/**
 * Rolls and applies "around the league" activity for a batch of just-
 * simulated regular-season games: injuries (with a real mechanical effect -
 * an injured player is excluded from `computeLeagueTeamStrengths` until they
 * recover, see that function), CPU-CPU trades (never involving the user's
 * own team - trading the user's players without consent would break the
 * "you're the GM" premise), and CPU free-agent signings. All frequencies
 * scale with the number of games just simulated, not real time or clicks -
 * simulating 1 game produces essentially no news, simulating 50 produces
 * several events, the same way a real season's news ebbs and flows with
 * games played.
 *
 * Must be called *after* the batch's `Game`/`LeagueTeam.wins`/`losses` rows
 * are already persisted - it reads teams' current win/loss totals as the
 * "games played" clock for injury durations and returns. A player injured
 * mid-batch won't affect that same batch's remaining games (this batch's
 * team strengths were already computed and locked in before any games were
 * simulated) - a documented, deliberate simplification consistent with the
 * existing "strength computed once per batch" architecture. It takes
 * effect starting the next `simulateGamesAction` call instead.
 */
export async function applyLeagueEvents(
  leagueId: string,
  season: number,
  userControlledTeamId: string | null,
  simulatedGames: SimulatedGameTeams[],
): Promise<void> {
  if (simulatedGames.length === 0) return;

  const teamIds = [
    ...new Set(simulatedGames.flatMap((g) => [g.homeLeagueTeamId, g.awayLeagueTeamId])),
  ];

  const [
    batchTeams,
    injuredPlayers,
    healthyPlayers,
    medicalStaff,
    completedProjects,
    batchCultures,
  ] = await Promise.all([
    prisma.leagueTeam.findMany({ where: { id: { in: teamIds } } }),
    prisma.leaguePlayer.findMany({
      where: { leagueId, leagueTeamId: { in: teamIds }, injuryStatus: { not: "HEALTHY" } },
      include: { player: true },
    }),
    prisma.leaguePlayer.findMany({
      where: { leagueId, leagueTeamId: { in: teamIds }, injuryStatus: "HEALTHY", isActive: true },
      include: { player: true },
    }),
    // Medical Staff effect (Phase 15a) - a team with no Medical Staff hired
    // yet rolls injuries exactly as it did before this phase existed (see
    // rollForTeamInjury's null handling).
    prisma.staff.findMany({
      where: { leagueId, leagueTeamId: { in: teamIds }, role: "MEDICAL_STAFF" },
      select: { leagueTeamId: true, quality: true },
    }),
    // Finances as a Gameplay Pillar (Phase 5) - a completed Practice
    // Facility stacks onto the Sports Science department below.
    prisma.capitalProject.findMany({
      where: { leagueId, leagueTeamId: { in: teamIds }, status: "COMPLETE" },
      select: { leagueTeamId: true, kind: true },
    }),
    // Fans Page Redesign (Phase 3).
    prisma.fanCulture.findMany({
      where: { leagueTeamId: { in: teamIds } },
      select: { leagueTeamId: true, patience: true, loyalty: true },
    }),
  ]);

  const cultureByTeam = new Map(batchCultures.map((c) => [c.leagueTeamId, c]));

  // Already reflects this batch's wins/losses - simulateGamesAction persists
  // game/team updates before calling this function.
  const gamesPlayedByTeam = new Map(batchTeams.map((t) => [t.id, t.wins + t.losses]));
  const medicalStaffQualityByTeam = new Map(
    medicalStaff.map((s) => [s.leagueTeamId as string, s.quality]),
  );
  const completedProjectKindsByTeam = new Map<
    string,
    (typeof completedProjects)[number]["kind"][]
  >();
  for (const p of completedProjects) {
    const list = completedProjectKindsByTeam.get(p.leagueTeamId) ?? [];
    list.push(p.kind);
    completedProjectKindsByTeam.set(p.leagueTeamId, list);
  }
  // Finances as a Gameplay Pillar (Phase 4/5) - the Sports Science
  // department is a second injury-frequency lever alongside Medical Staff
  // quality (STANDARD = neutral); a completed Practice Facility stacks a
  // permanent bonus on top. Was medicalInvestment/INVESTMENT_QUALITY_DELTA.
  const sportsScienceDeltaByTeam = new Map(
    batchTeams.map((t) => [
      t.id,
      departmentQualityDelta(t.sportsScienceLevel) +
        sumCompletedProjectEffects(completedProjectKindsByTeam.get(t.id) ?? []).sportsScienceBonus,
    ]),
  );
  // Fan Engagement Deepening (Phase 1) - accumulated per team across the
  // whole batch and flushed once at the end, the same pattern
  // winIncrements/streakByTeam already use, so this never becomes a
  // per-event query on a hot path. rollForTeamInjury's own candidate pool
  // deliberately carries no rating (see its own comment) - the roll itself
  // stays quality-blind; only the sentiment computed afterward looks up
  // rating, from data already fetched above.
  const ratingByPlayerId = new Map([
    ...healthyPlayers.map((p) => [p.id, p.overallRating] as const),
    ...injuredPlayers.map((p) => [p.id, p.overallRating] as const),
  ]);
  const fanHappinessByTeam = new Map(batchTeams.map((t) => [t.id, t.fanHappiness]));
  const fanHappinessDeltaByTeam = new Map<string, number>();
  // Fans Page Redesign (Phase 1) - collected alongside the aggregate so each
  // individual injury/recovery keeps its own attribution instead of being
  // lumped into one per-team total.
  const injurySentimentRows: SentimentRecord[] = [];
  function addFanHappinessDelta(
    teamId: string,
    rawDelta: number,
    ledger?: Omit<SentimentRecord, "leagueId" | "leagueTeamId" | "season" | "delta">,
  ) {
    if (rawDelta === 0) return;
    // Fans Page Redesign (Phase 3) - scaled by this team's Fan Culture
    // before it's accumulated or recorded.
    const delta = applyScaledFanHappinessDelta(
      fanHappinessByTeam.get(teamId) ?? 65,
      rawDelta,
      cultureByTeam.get(teamId) ?? null,
    ).scaledDelta;
    fanHappinessDeltaByTeam.set(teamId, (fanHappinessDeltaByTeam.get(teamId) ?? 0) + delta);
    if (ledger) {
      injurySentimentRows.push({
        leagueId,
        leagueTeamId: teamId,
        season,
        delta,
        ...ledger,
      });
    }
  }

  const transactions: {
    type: "INJURY" | "TRADE" | "SIGNING" | "ALL_STAR_SELECTION";
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[] = [];

  const returningPlayerIds = injuredPlayers
    .filter(
      (lp) =>
        lp.injuryReturnsAtGamesPlayed !== null &&
        (gamesPlayedByTeam.get(lp.leagueTeamId ?? "") ?? 0) >= lp.injuryReturnsAtGamesPlayed,
    )
    .map((lp) => lp.id);
  for (const lp of injuredPlayers) {
    if (returningPlayerIds.includes(lp.id)) {
      transactions.push({
        type: "INJURY",
        description: `${lp.player.fullName} has been cleared to return from injury.`,
        importance: "MINOR",
        teamIds: lp.leagueTeamId ? [lp.leagueTeamId] : [],
      });
      if (lp.leagueTeamId) {
        addFanHappinessDelta(
          lp.leagueTeamId,
          computeInjuryRecoverySentimentDelta(getPlayerValueTier(lp.overallRating)),
          {
            kind: "INJURY_RECOVERY",
            description: describeInjurySentiment(lp.player.fullName, true),
            leaguePlayerId: lp.id,
          },
        );
      }
    }
  }
  if (returningPlayerIds.length > 0) {
    await prisma.leaguePlayer.updateMany({
      where: { id: { in: returningPlayerIds } },
      data: { injuryStatus: "HEALTHY", injuryReturnsAtGamesPlayed: null },
    });
  }

  const healthyByTeam = new Map<string, { leaguePlayerId: string; playerName: string }[]>();
  for (const lp of healthyPlayers) {
    if (!lp.leagueTeamId) continue;
    const list = healthyByTeam.get(lp.leagueTeamId) ?? [];
    list.push({ leaguePlayerId: lp.id, playerName: lp.player.fullName });
    healthyByTeam.set(lp.leagueTeamId, list);
  }

  const newInjuryUpdates: { id: string; returnsAt: number; durationGames: number }[] = [];
  for (const game of simulatedGames) {
    for (const teamId of [game.homeLeagueTeamId, game.awayLeagueTeamId]) {
      const pool = healthyByTeam.get(teamId) ?? [];
      const result = rollForTeamInjury(
        pool,
        Math.random,
        INJURY_CHANCE_PER_TEAM_GAME,
        medicalStaffQualityByTeam.get(teamId) ?? null,
        sportsScienceDeltaByTeam.get(teamId) ?? 0,
      );
      if (!result) continue;

      // Remove from this team's pool so one batch can't injure the same
      // player twice (this batch's strengths were already locked in, but
      // the return-threshold bookkeeping still needs to stay consistent).
      healthyByTeam.set(
        teamId,
        pool.filter((p) => p.leaguePlayerId !== result.leaguePlayerId),
      );

      const returnsAt = (gamesPlayedByTeam.get(teamId) ?? 0) + result.durationGames;
      newInjuryUpdates.push({
        id: result.leaguePlayerId,
        returnsAt,
        durationGames: result.durationGames,
      });
      transactions.push({
        type: "INJURY",
        description: `${result.playerName} suffers ${result.injuryName}, expected to miss ${result.durationGames} games.`,
        // No player-quality signal in this roll (see rollForTeamInjury) -
        // duration is the real, available severity proxy: a multi-week
        // absence is bigger news than a day-to-day tweak regardless of who
        // it happened to.
        importance:
          result.durationGames >= 20 ? "MAJOR" : result.durationGames >= 8 ? "STANDARD" : "MINOR",
        teamIds: [teamId],
      });
      addFanHappinessDelta(
        teamId,
        computeInjurySentimentDelta({
          starTier: getPlayerValueTier(ratingByPlayerId.get(result.leaguePlayerId) ?? 65),
          severity: result.severity,
        }),
        {
          kind: "INJURY",
          description: describeInjurySentiment(result.playerName, false),
          leaguePlayerId: result.leaguePlayerId,
        },
      );
    }
  }
  await Promise.all(
    newInjuryUpdates.map((u) =>
      prisma.leaguePlayer.update({
        where: { id: u.id },
        data: {
          injuryStatus: "OUT",
          injuryReturnsAtGamesPlayed: u.returnsAt,
          // Career injury-history signal for the trade-value model (Phase
          // 11c) - incremented by the games this specific injury cost,
          // right alongside the transaction that announces it.
          careerGamesMissedToInjury: { increment: u.durationGames },
        },
      }),
    ),
  );

  // Fan Engagement Deepening (Phase 1) - one flush for the whole batch's
  // accumulated injury/recovery deltas, reusing batchTeams' fanHappiness
  // already fetched above rather than a per-event query.
  if (fanHappinessDeltaByTeam.size > 0) {
    await Promise.all([
      ...[...fanHappinessDeltaByTeam.entries()].map(([teamId, delta]) =>
        prisma.leagueTeam.update({
          where: { id: teamId },
          data: {
            fanHappiness: applyFanHappinessDelta(fanHappinessByTeam.get(teamId) ?? 65, delta),
          },
        }),
      ),
      // Fans Page Redesign (Phase 1) - the per-event attributions behind the
      // aggregate deltas just applied.
      recordFanSentimentMany(injurySentimentRows),
    ]);
  }

  const totalGames = simulatedGames.length;

  if (shouldTriggerEvent(totalGames, TRADE_CHANCE_PER_GAME)) {
    await maybeExecuteCpuTrade(leagueId, season, userControlledTeamId, transactions);
  }
  if (shouldTriggerEvent(totalGames, SIGNING_CHANCE_PER_GAME)) {
    await maybeExecuteCpuSigning(leagueId, season, userControlledTeamId, transactions);
  }

  const userGamesPlayed = userControlledTeamId
    ? (gamesPlayedByTeam.get(userControlledTeamId) ?? 0)
    : 0;
  if (
    userControlledTeamId &&
    userGamesPlayed >= ALL_STAR_BUZZ_WINDOW_MIN_GAMES &&
    userGamesPlayed <= ALL_STAR_BUZZ_WINDOW_MAX_GAMES &&
    shouldTriggerEvent(totalGames, ALL_STAR_BUZZ_CHANCE_PER_GAME)
  ) {
    await maybeEmitAllStarBuzz(leagueId, season, transactions);
  }

  if (transactions.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: transactions.map((t) => ({
        leagueId,
        season,
        type: t.type,
        description: t.description,
        importance: t.importance,
        teamIds: t.teamIds,
      })),
    });
  }
}

async function maybeExecuteCpuTrade(
  leagueId: string,
  season: number,
  userControlledTeamId: string | null,
  transactions: {
    type: "INJURY" | "TRADE" | "SIGNING" | "ALL_STAR_SELECTION";
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[],
): Promise<void> {
  // CPU Autonomous GM Intelligence (Phase 2) - identity needs every team's
  // win/loss, not just the CPU subset, for a correct relative ranking
  // (consistent with every other computeCompetitivenessPercentiles caller).
  // Cheap alongside the roster query - a handful of rows, two columns.
  const [cpuLeagueTeams, allTeamsWinLoss] = await Promise.all([
    prisma.leagueTeam.findMany({
      where: { leagueId, ...(userControlledTeamId ? { id: { not: userControlledTeamId } } : {}) },
      include: {
        team: true,
        players: {
          where: { isActive: true },
          include: {
            player: true,
            contract: { include: { years: { where: { season } } } },
            personalityProfile: true,
          },
        },
      },
    }),
    prisma.leagueTeam.findMany({
      where: { leagueId },
      select: { id: true, wins: true, losses: true },
    }),
  ]);
  const percentileByTeam = await computeCompetitivenessPercentiles(allTeamsWinLoss);

  // Player Morale & Personality System - CpuRosterPlayer (simulation/
  // leagueEvents.ts) doesn't carry morale/personality (it's shared with
  // the trade-scoring engine, which has no reason to know about either),
  // so this side map lets the trade-execution step below look them up by
  // id without threading new fields through that scoring type.
  const moraleInfoByPlayerId = new Map(
    cpuLeagueTeams.flatMap((lt) =>
      lt.players.map((p) => [
        p.id,
        {
          morale: p.morale,
          tradeRequestActive: p.tradeRequestActive,
          personality: p.personalityProfile as PlayerPersonalityAxes | null,
        },
      ]),
    ),
  );

  const cpuTeams: CpuTeam[] = cpuLeagueTeams
    .map((lt) => {
      const roster = lt.players
        .filter((p) => p.contract?.years[0])
        .map((p) => ({
          leaguePlayerId: p.id,
          playerName: p.player.fullName,
          rating: p.overallRating,
          potentialRating: p.potentialRating,
          age: estimateAge(p.player.draftYear, season),
          position: p.player.position,
          salaryCents: p.contract!.years[0].salaryCents,
          noTradeClause: p.contract!.noTradeClause,
          injuryStatus: p.injuryStatus,
          careerGamesMissedToInjury: p.careerGamesMissedToInjury,
          wantsOut: p.tradeRequestActive,
        }));
      const avgAge =
        roster.length > 0 ? roster.reduce((sum, p) => sum + p.age, 0) / roster.length : 27;

      return {
        leagueTeamId: lt.id,
        teamLabel: `${lt.team.city} ${lt.team.name}`,
        roster,
        capState: (() => {
          const capSheet = computeCapSheet({
            season,
            contracts: lt.players
              .filter((p) => p.contract?.years[0])
              .map((p) => ({
                playerId: p.playerId,
                salaryCents: p.contract!.years[0].salaryCents,
              })),
          });
          // Pick ownership isn't tracked yet (same known simplification as
          // executeTradeAction's Stepien-lite check) - CPU trades never
          // involve picks anyway, so this only matters for the check's own
          // internal bookkeeping, not this feature's correctness.
          return {
            apronLevel: capSheet.apronLevel,
            capSpaceCents: capSheet.capSpaceCents,
            ownedFutureFirstRoundPickSeasons: [] as number[],
          };
        })(),
        identity: computeTeamIdentity(percentileByTeam.get(lt.id) ?? 0.5, avgAge),
        needs: computeTeamNeeds(
          roster.map((p) => ({ position: p.position, overallRating: p.rating })),
        ),
        personality: lt.gmPersonality,
      };
    })
    .filter((t) => t.roster.length > 0);

  const identityByTeam = new Map(
    cpuTeams.map((t) => [t.leagueTeamId, { identity: t.identity, needs: t.needs }]),
  );

  const result = rollForCpuTrade(cpuTeams, season);
  if (!result) return;
  const cpuResult = result;

  await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        leagueId,
        proposedById: cpuResult.teamA.leagueTeamId,
        status: "EXECUTED",
        resolvedAt: new Date(),
        validationResult: { cpuGenerated: true },
      },
    });
    await tx.tradeAsset.createMany({
      data: [
        {
          tradeId: trade.id,
          type: "PLAYER",
          fromLeagueTeamId: cpuResult.teamA.leagueTeamId,
          toLeagueTeamId: cpuResult.teamB.leagueTeamId,
          leaguePlayerId: cpuResult.teamA.player.leaguePlayerId,
        },
        {
          tradeId: trade.id,
          type: "PLAYER",
          fromLeagueTeamId: cpuResult.teamB.leagueTeamId,
          toLeagueTeamId: cpuResult.teamA.leagueTeamId,
          leaguePlayerId: cpuResult.teamB.player.leaguePlayerId,
        },
      ],
    });
    // Player Morale & Personality System - a trade is a fresh start for
    // each moving player, same reasoning as the user-initiated trade path
    // (src/lib/actions/trade.ts).
    function moraleUpdateFor(player: typeof cpuResult.teamA.player, newTeamId: string) {
      const info = moraleInfoByPlayerId.get(player.leaguePlayerId);
      const newTeam = identityByTeam.get(newTeamId);
      if (!info?.personality || !newTeam) return {};
      return {
        morale: computeMoraleAfterTrade(info.morale, {
          personality: info.personality,
          newTeamIdentity: newTeam.identity,
          fillsNeed: newTeam.needs.some((need) =>
            playerFillsNeed(
              {
                type: "PLAYER" as const,
                position: player.position,
                overallRating: player.rating,
                potentialRating: player.potentialRating,
                age: player.age,
                currentSalaryCents: player.salaryCents,
                injuryStatus: player.injuryStatus,
                careerGamesMissedToInjury: player.careerGamesMissedToInjury,
              },
              need,
            ),
          ),
        }),
        tradeRequestActive: false,
      };
    }

    await tx.leaguePlayer.update({
      where: { id: cpuResult.teamA.player.leaguePlayerId },
      data: {
        leagueTeamId: cpuResult.teamB.leagueTeamId,
        reSigningTeamId: cpuResult.teamB.leagueTeamId,
        rotationSlot: null,
        targetMinutesPerGame: null,
        // Franchise Finances (Phase D) - tenure resets on the new team.
        joinedTeamSeason: season,
        homegrown: false,
        ...moraleUpdateFor(cpuResult.teamA.player, cpuResult.teamB.leagueTeamId),
      },
    });
    await tx.contract.update({
      where: { leaguePlayerId: cpuResult.teamA.player.leaguePlayerId },
      data: { leagueTeamId: cpuResult.teamB.leagueTeamId },
    });
    await tx.leaguePlayer.update({
      where: { id: cpuResult.teamB.player.leaguePlayerId },
      data: {
        leagueTeamId: cpuResult.teamA.leagueTeamId,
        reSigningTeamId: cpuResult.teamA.leagueTeamId,
        rotationSlot: null,
        targetMinutesPerGame: null,
        joinedTeamSeason: season,
        homegrown: false,
        ...moraleUpdateFor(cpuResult.teamB.player, cpuResult.teamA.leagueTeamId),
      },
    });
    await tx.contract.update({
      where: { leaguePlayerId: cpuResult.teamB.player.leaguePlayerId },
      data: { leagueTeamId: cpuResult.teamA.leagueTeamId },
    });

    // Fan Engagement Deepening (Phase 1) - each side's own fans react to
    // their own perspective: the mutual-accept scores already computed to
    // decide this trade (see rollForCpuTrade), plus the star tier of what
    // each team gained vs. gave up.
    const [teamAFans, teamBFans] = await Promise.all([
      tx.leagueTeam.findUnique({
        where: { id: cpuResult.teamA.leagueTeamId },
        select: { fanHappiness: true, fanCulture: { select: { patience: true, loyalty: true } } },
      }),
      tx.leagueTeam.findUnique({
        where: { id: cpuResult.teamB.leagueTeamId },
        select: { fanHappiness: true, fanCulture: { select: { patience: true, loyalty: true } } },
      }),
    ]);
    const rawTeamADelta = computeTradeSentimentDelta({
      perspectiveScore: cpuResult.teamAScore,
      acquiredStarTier: getPlayerValueTier(cpuResult.teamB.player.rating),
      sentStarTier: getPlayerValueTier(cpuResult.teamA.player.rating),
    });
    const rawTeamBDelta = computeTradeSentimentDelta({
      perspectiveScore: cpuResult.teamBScore,
      acquiredStarTier: getPlayerValueTier(cpuResult.teamA.player.rating),
      sentStarTier: getPlayerValueTier(cpuResult.teamB.player.rating),
    });
    // Fans Page Redesign (Phase 3).
    let teamADelta = rawTeamADelta;
    let teamBDelta = rawTeamBDelta;
    if (teamAFans) {
      const scaled = applyScaledFanHappinessDelta(
        teamAFans.fanHappiness,
        rawTeamADelta,
        teamAFans.fanCulture,
      );
      teamADelta = scaled.scaledDelta;
      await tx.leagueTeam.update({
        where: { id: cpuResult.teamA.leagueTeamId },
        data: { fanHappiness: scaled.newFanHappiness },
      });
    }
    if (teamBFans) {
      const scaled = applyScaledFanHappinessDelta(
        teamBFans.fanHappiness,
        rawTeamBDelta,
        teamBFans.fanCulture,
      );
      teamBDelta = scaled.scaledDelta;
      await tx.leagueTeam.update({
        where: { id: cpuResult.teamB.leagueTeamId },
        data: { fanHappiness: scaled.newFanHappiness },
      });
    }
    // Fans Page Redesign (Phase 1) - a CPU trade involving the user's team
    // still moves their fanbase, so it belongs in the ledger the same way a
    // user-initiated one does.
    await recordFanSentimentManyTx(tx, [
      {
        leagueId,
        leagueTeamId: cpuResult.teamA.leagueTeamId,
        season,
        kind: "TRADE",
        delta: teamADelta,
        description: describeTradeSentiment({
          delta: teamADelta,
          sentNames: [cpuResult.teamA.player.playerName],
          acquiredNames: [cpuResult.teamB.player.playerName],
        }),
      },
      {
        leagueId,
        leagueTeamId: cpuResult.teamB.leagueTeamId,
        season,
        kind: "TRADE",
        delta: teamBDelta,
        description: describeTradeSentiment({
          delta: teamBDelta,
          sentNames: [cpuResult.teamB.player.playerName],
          acquiredNames: [cpuResult.teamA.player.playerName],
        }),
      },
    ]);
  });

  transactions.push({
    type: "TRADE",
    description: describeTrade(
      { teamLabel: result.teamA.teamLabel, sentAssetNames: [result.teamA.player.playerName] },
      { teamLabel: result.teamB.teamLabel, sentAssetNames: [result.teamB.player.playerName] },
    ),
    importance: highestImportance([
      importanceForRating(result.teamA.player.rating),
      importanceForRating(result.teamB.player.rating),
    ]),
    teamIds: [result.teamA.leagueTeamId, result.teamB.leagueTeamId],
  });
}

async function maybeExecuteCpuSigning(
  leagueId: string,
  season: number,
  userControlledTeamId: string | null,
  transactions: {
    type: "INJURY" | "TRADE" | "SIGNING" | "ALL_STAR_SELECTION";
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[],
): Promise<void> {
  const [cpuLeagueTeams, freeAgents] = await Promise.all([
    prisma.leagueTeam.findMany({
      where: { leagueId, ...(userControlledTeamId ? { id: { not: userControlledTeamId } } : {}) },
      include: { team: true },
    }),
    prisma.leaguePlayer.findMany({
      where: { leagueId, leagueTeamId: null, isActive: true },
      include: { player: true },
    }),
  ]);

  const result = rollForCpuSigning(
    cpuLeagueTeams.map((t) => t.id),
    freeAgents.map((fa) => fa.id),
  );
  if (!result) return;

  const team = cpuLeagueTeams.find((t) => t.id === result.leagueTeamId);
  const freeAgent = freeAgents.find((fa) => fa.id === result.leaguePlayerId);
  if (!team || !freeAgent) return;

  // Always a minimum-salary, 1-year deal - the only signing mechanism that's
  // legal regardless of a CPU team's cap situation (see validateSigning),
  // and realistically the bulk of in-season free-agent activity anyway.
  const offerSalaryCents = getSeasonCapRules(season).emptyRosterChargeCents;

  await prisma.$transaction(async (tx) => {
    await tx.leaguePlayer.update({
      where: { id: freeAgent.id },
      data: {
        leagueTeamId: team.id,
        reSigningTeamId: team.id,
        rotationSlot: null,
        targetMinutesPerGame: null,
        // Franchise Finances (Phase D) - CPU signing: fresh tenure, not homegrown.
        joinedTeamSeason: season,
        homegrown: false,
      },
    });
    const contract = await tx.contract.create({
      data: {
        leaguePlayerId: freeAgent.id,
        leagueTeamId: team.id,
        signedSeason: season,
        startSeason: season,
        endSeason: season,
        signedUsing: "VETERAN_MINIMUM",
      },
    });
    await tx.contractYear.create({
      data: {
        contractId: contract.id,
        season,
        salaryCents: offerSalaryCents,
        guaranteedCents: offerSalaryCents,
      },
    });

    // Fan Engagement Deepening (Phase 1).
    const teamFans = await tx.leagueTeam.findUnique({
      where: { id: team.id },
      select: { fanHappiness: true, fanCulture: { select: { patience: true, loyalty: true } } },
    });
    if (teamFans) {
      const isReSigning = freeAgent.reSigningTeamId === team.id;
      const rawDelta = computeSigningSentimentDelta({
        signedStarTier: getPlayerValueTier(freeAgent.overallRating),
        isReSigning,
      });
      // Fans Page Redesign (Phase 3).
      const { newFanHappiness, scaledDelta: delta } = applyScaledFanHappinessDelta(
        teamFans.fanHappiness,
        rawDelta,
        teamFans.fanCulture,
      );
      await tx.leagueTeam.update({
        where: { id: team.id },
        data: { fanHappiness: newFanHappiness },
      });
      // Fans Page Redesign (Phase 1).
      await recordFanSentimentManyTx(tx, [
        {
          leagueId,
          leagueTeamId: team.id,
          season,
          kind: "SIGNING",
          delta,
          description: describeSigningSentiment({
            playerName: freeAgent.player.fullName,
            isReSigning,
            delta,
          }),
          leaguePlayerId: freeAgent.id,
        },
      ]);
    }
  });

  transactions.push({
    type: "SIGNING",
    description: describeSigning(
      `${team.team.city} ${team.team.name}`,
      freeAgent.player.fullName,
      1,
      offerSalaryCents,
    ),
    importance: importanceForRating(freeAgent.overallRating),
    teamIds: [team.id],
  });
}

/**
 * Ranks the same real season-so-far pool selectAllStars will later use for
 * the actual weekend, and names its current top starter as a "building a
 * case" story - a real early read on who selection.ts would pick if the
 * break were today, not an independently invented headline.
 */
async function maybeEmitAllStarBuzz(
  leagueId: string,
  season: number,
  transactions: {
    type: "INJURY" | "TRADE" | "SIGNING" | "ALL_STAR_SELECTION";
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[],
): Promise<void> {
  const pool = await buildAllStarPerformancePool(leagueId, season);
  if (pool.performanceSnapshots.length === 0) return;

  const { selections } = selectAllStars(pool.performanceSnapshots);
  const starters = selections.filter((s) => s.role === "STARTER");
  if (starters.length === 0) return;

  const top = starters.reduce((best, s) => (s.performanceScore > best.performanceScore ? s : best));
  const name = pool.fullNameById.get(top.leaguePlayerId) ?? "A player";
  const rating =
    pool.performanceSnapshots.find((p) => p.leaguePlayerId === top.leaguePlayerId)?.overallRating ??
    70;
  const teamId = pool.teamIdById.get(top.leaguePlayerId);

  transactions.push({
    type: "ALL_STAR_SELECTION",
    description: `${name} is building a strong All-Star case as the break approaches.`,
    importance: importanceForRating(rating),
    teamIds: teamId ? [teamId] : [],
  });
}

// Player Morale & Personality System - a season-to-date average (not a
// last-N-games window) is used for the minutes-shortfall signal, gated to
// a minimum sample size, since PlayerGameStat has no stored chronological
// sequence number to reliably slice "the last 3 games" from without an
// extra join through Game - a season-to-date read is simpler, more robust,
// and arguably a fairer signal anyway (no reaction to one rough night).
const MIN_GAMES_FOR_MINUTES_SIGNAL = 5;
const MORALE_UPDATE_BATCH_SIZE = 50;
// Matches describeWinStreak's own STANDARD_WIN_STREAK/STANDARD_LOSS_STREAK
// threshold (describeGameEvents.ts) - the same real streak length fans'
// win-streak news already requires, not a separate tuning constant.
const NOTABLE_STREAK_LENGTH = 5;

/**
 * Runs once per simulated batch (right after applyLeagueEvents, so this
 * batch's box scores and any CPU trades are already reflected) for every
 * active rostered player league-wide, not just the user's team - same
 * "all 30 teams" reach as Fan Happiness. Reuses computeCompetitivenessPercentiles
 * for the team-performance signal and LeaguePlayer.targetMinutesPerGame +
 * this season's real PlayerGameStat rows for the minutes-shortfall signal
 * - no new derived state, no per-game persistence.
 */
export async function applyPlayerMoraleEvents(leagueId: string, season: number): Promise<void> {
  const [players, teams] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueId, isActive: true, leagueTeamId: { not: null } },
      include: { player: true, personalityProfile: true, leagueTeam: { include: { team: true } } },
    }),
    prisma.leagueTeam.findMany({
      where: { leagueId },
      select: { id: true, wins: true, losses: true },
    }),
  ]);
  if (players.length === 0) return;

  const percentileByTeam = await computeCompetitivenessPercentiles(teams);

  const targetedPlayerIds = players.filter((p) => p.targetMinutesPerGame !== null).map((p) => p.id);
  const seasonAvgMinutesByPlayer = new Map<string, number>();
  if (targetedPlayerIds.length > 0) {
    const agg = await prisma.playerGameStat.groupBy({
      by: ["leaguePlayerId"],
      where: { leagueId, season, leaguePlayerId: { in: targetedPlayerIds } },
      _avg: { minutesPlayed: true },
      _count: { _all: true },
    });
    for (const row of agg) {
      if (row._count._all >= MIN_GAMES_FOR_MINUTES_SIGNAL && row._avg.minutesPlayed !== null) {
        seasonAvgMinutesByPlayer.set(row.leaguePlayerId, row._avg.minutesPlayed);
      }
    }
  }

  const updates: { id: string; morale: number; tradeRequestActive: boolean }[] = [];
  const newsRows: {
    description: string;
    importance: NewsImportance;
    teamIds: string[];
    subjectLeaguePlayerId: string;
  }[] = [];
  // Team performance is a team-wide event, not a personal one - like
  // describeWinStreak, it should read as one story about the team, not a
  // dozen duplicate stories (one per rostered player) every time a streak
  // continues. Track only the single most-affected player per team and
  // narrate just that one, same "most notable" convention
  // simulateGamesAction's own per-batch news ranking already uses.
  const teamPerfNewsCandidateByTeam = new Map<
    string,
    { player: (typeof players)[number]; delta: number }
  >();

  for (const p of players) {
    if (!p.personalityProfile || !p.leagueTeamId || !p.leagueTeam) continue;
    const personality = p.personalityProfile;

    // Only reacts to a real, notable streak (the same 5+ game threshold
    // describeWinStreak already requires for its own news) - not a
    // continuous background hum tied to season-long percentile, which
    // would otherwise fire for roughly half the league every single
    // batch regardless of anything actually changing.
    const hasNotableStreak = Math.abs(p.leagueTeam.currentStreak) >= NOTABLE_STREAK_LENGTH;
    const teamPerfDelta = hasNotableStreak
      ? computeTeamPerformanceMoraleDelta({
          personality,
          competitivenessPercentile: percentileByTeam.get(p.leagueTeamId) ?? 0.5,
          currentStreak: p.leagueTeam.currentStreak,
        })
      : 0;
    const seasonAvgMinutes = seasonAvgMinutesByPlayer.get(p.id);
    const minutesDelta =
      p.targetMinutesPerGame !== null && seasonAvgMinutes !== undefined
        ? computeMinutesShortfallMoraleDelta({
            personality,
            targetMinutesPerGame: p.targetMinutesPerGame,
            recentActualMinutesPerGame: seasonAvgMinutes,
          })
        : 0;
    const totalDelta = teamPerfDelta + minutesDelta;
    if (totalDelta === 0) continue;

    const result = applyMoraleChange(
      p.morale,
      totalDelta,
      personality.loyalty,
      p.tradeRequestActive,
    );
    updates.push({
      id: p.id,
      morale: result.morale,
      tradeRequestActive: result.tradeRequestActive,
    });

    const teamLabel = `${p.leagueTeam.team.city} ${p.leagueTeam.team.name}`;
    // Minutes-shortfall is a genuinely personal event (tied to one
    // player's own target) - narrated per-player, same as before. Team
    // performance is queued as a candidate instead of narrated directly.
    if (
      Math.abs(minutesDelta) >= Math.abs(teamPerfDelta) &&
      Math.abs(minutesDelta) >= MORALE_NEWS_THRESHOLD
    ) {
      newsRows.push({
        description: describePlayerMoraleEvent(
          p.player.fullName,
          teamLabel,
          "MINUTES_SHORTFALL",
          minutesDelta > 0 ? "up" : "down",
        ),
        importance: importanceForRating(p.overallRating),
        teamIds: [p.leagueTeamId],
        subjectLeaguePlayerId: p.id,
      });
    } else if (Math.abs(teamPerfDelta) >= MORALE_NEWS_THRESHOLD) {
      const existing = teamPerfNewsCandidateByTeam.get(p.leagueTeamId);
      if (!existing || Math.abs(teamPerfDelta) > Math.abs(existing.delta)) {
        teamPerfNewsCandidateByTeam.set(p.leagueTeamId, { player: p, delta: teamPerfDelta });
      }
    }
    if (result.justActivated) {
      newsRows.push({
        description: describeTradeRequest(p.player.fullName, teamLabel),
        importance: importanceForRating(p.overallRating),
        teamIds: [p.leagueTeamId],
        subjectLeaguePlayerId: p.id,
      });
    }
  }

  for (const [teamId, candidate] of teamPerfNewsCandidateByTeam) {
    const { player: p, delta } = candidate;
    if (!p.leagueTeam) continue;
    newsRows.push({
      description: describePlayerMoraleEvent(
        p.player.fullName,
        `${p.leagueTeam.team.city} ${p.leagueTeam.team.name}`,
        delta > 0 ? "TEAM_PERFORMANCE_UP" : "TEAM_PERFORMANCE_DOWN",
        delta > 0 ? "up" : "down",
      ),
      importance: importanceForRating(p.overallRating),
      teamIds: [teamId],
      subjectLeaguePlayerId: p.id,
    });
  }

  for (let i = 0; i < updates.length; i += MORALE_UPDATE_BATCH_SIZE) {
    const batch = updates.slice(i, i + MORALE_UPDATE_BATCH_SIZE);
    await Promise.all(
      batch.map((u) =>
        prisma.leaguePlayer.update({
          where: { id: u.id },
          data: { morale: u.morale, tradeRequestActive: u.tradeRequestActive },
        }),
      ),
    );
  }

  if (newsRows.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: newsRows.map((row) => ({
        leagueId,
        season,
        type: "PLAYER_MORALE" as const,
        description: row.description,
        importance: row.importance,
        teamIds: row.teamIds,
        subjectLeaguePlayerId: row.subjectLeaguePlayerId,
      })),
    });
  }
}

// Finances as a Gameplay Pillar (Phase 1), System 7 "Business Events" - the
// per-game chance of a new business decision landing in the user's Front
// Office Inbox. Tuned toward the design target of ~6-10 decisions across an
// 82-game season (see docs/FINANCES_PILLAR_DESIGN.md), same "chance per game
// in the batch" convention as TRADE_CHANCE_PER_GAME/SIGNING_CHANCE_PER_GAME
// above - an approximation of "per user game," not an exact one, consistent
// with how those existing rolls already work.
const BUSINESS_EVENT_CHANCE_PER_GAME = 0.012;
// Finances as a Gameplay Pillar (Phase 2) - "preseason-ish" window
// sponsorship offers cluster in (see BusinessDecisionContext.
// isEarlySeasonWindow). This simulator goes straight to the regular season
// at bootstrap (no separate preseason phase), so the first month of games
// is the closest available proxy.
const EARLY_SEASON_WINDOW_DAYS = 30;
const MIN_OWNER_CONFIDENCE = 0;
const MAX_OWNER_CONFIDENCE = 100;

function clampOwnerConfidence(value: number): number {
  return Math.max(MIN_OWNER_CONFIDENCE, Math.min(MAX_OWNER_CONFIDENCE, value));
}

/** Applies one BusinessDecisionOption's effects to a team's cash/fan-happiness and the league's owner confidence - shared by both the auto-expiry path below and the user-driven resolveBusinessDecisionAction. */
export function applyBusinessDecisionOption(
  option: BusinessDecisionOption,
  current: {
    cashReserveCents: bigint;
    fanHappiness: number;
    ownerConfidence: number;
    fanCulture?: { patience: number; loyalty: number } | null;
  },
): {
  cashReserveCents: bigint;
  fanHappiness: number;
  ownerConfidence: number;
  scaledFanHappinessDelta: number;
} {
  // Fans Page Redesign (Phase 3) - scaled by this team's Fan Culture before
  // it's applied; callers use scaledFanHappinessDelta (not
  // option.fanHappinessDelta) for the sentiment ledger row, so it always
  // explains the real number fanHappiness moved by.
  const { newFanHappiness, scaledDelta } = applyScaledFanHappinessDelta(
    current.fanHappiness,
    option.fanHappinessDelta,
    current.fanCulture ?? null,
  );
  return {
    cashReserveCents: current.cashReserveCents + BigInt(Math.round(option.cashDeltaCents)),
    fanHappiness: newFanHappiness,
    ownerConfidence: clampOwnerConfidence(current.ownerConfidence + option.ownerConfidenceDelta),
    scaledFanHappinessDelta: scaledDelta,
  };
}

/**
 * Finances as a Gameplay Pillar (Phase 1), System 7 "Business Events" - the
 * Front Office Inbox's live feed. Business decisions are a user-facing
 * mechanic only (never rolled for CPU teams - see
 * docs/FINANCES_PILLAR_DESIGN.md's Tier 2 CPU abstraction), so this always
 * targets `userControlledTeamId`.
 *
 * Does two things in one pass: (1) auto-resolves any PENDING decision whose
 * deadline has already passed to its own (deliberately suboptimal) default
 * option - ignoring the business side is a legitimate playable strategy
 * with a real, understood cost, not a free pass; (2) rolls a chance at a
 * brand-new decision, gated on the MAX_PENDING_BUSINESS_DECISIONS inbox cap
 * so the feed can't flood a save that's behind on responses.
 *
 * Returns whether a BREAKING-severity decision now sits PENDING (either
 * just rolled, or was already there before this call) - simulateGamesAction
 * uses this to stop simulating and force the user back to the inbox, the
 * same "must resolve before continuing" shape as the All-Star-weekend gate.
 */
export async function applyBusinessDecisionEvents(
  leagueId: string,
  season: number,
  userControlledTeamId: string | null,
  lastDayIndex: number,
  gamesInBatch: number,
): Promise<{ breakingDecisionPending: boolean }> {
  if (!userControlledTeamId) return { breakingDecisionPending: false };

  const pending = await prisma.businessDecision.findMany({
    where: { leagueId, leagueTeamId: userControlledTeamId, status: "PENDING" },
  });

  const expired = pending.filter((d) => d.deadlineDayIndex <= lastDayIndex);
  const stillPending = pending.filter((d) => d.deadlineDayIndex > lastDayIndex);

  if (expired.length > 0) {
    const team = await prisma.leagueTeam.findUnique({
      where: { id: userControlledTeamId },
      select: {
        cashReserveCents: true,
        fanHappiness: true,
        fanCulture: { select: { patience: true, loyalty: true } },
      },
    });
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { ownerConfidence: true },
    });
    if (team && league) {
      let cashReserveCents = team.cashReserveCents;
      let fanHappiness = team.fanHappiness;
      let ownerConfidence = league.ownerConfidence;
      let lastScaledFanHappinessDelta = 0;
      const ledgerRows: {
        category: "EVENT_INCOME" | "EVENT_EXPENSE";
        amountCents: bigint;
        description: string;
        businessDecisionId: string;
      }[] = [];
      const newsRows: { description: string; importance: NewsImportance }[] = [];
      const businessSentimentRows: SentimentRecord[] = [];

      for (const decision of expired) {
        const options = decision.options as unknown as BusinessDecisionOption[];
        const defaultOption = options.find((o) => o.id === decision.defaultOptionId) ?? options[0];
        const applied = applyBusinessDecisionOption(defaultOption, {
          cashReserveCents,
          fanHappiness,
          ownerConfidence,
          fanCulture: team.fanCulture,
        });
        cashReserveCents = applied.cashReserveCents;
        fanHappiness = applied.fanHappiness;
        ownerConfidence = applied.ownerConfidence;
        lastScaledFanHappinessDelta = applied.scaledFanHappinessDelta;

        if (defaultOption.cashDeltaCents !== 0) {
          ledgerRows.push({
            category: defaultOption.cashDeltaCents > 0 ? "EVENT_INCOME" : "EVENT_EXPENSE",
            amountCents: BigInt(Math.abs(Math.round(defaultOption.cashDeltaCents))),
            description: `${decision.headline} - no response, default action taken (${defaultOption.label})`,
            businessDecisionId: decision.id,
          });
        }
        newsRows.push({
          description: `${decision.headline}: with no response, the front office defaulted to "${defaultOption.label}."`,
          importance: decision.severity,
        });
        // Fans Page Redesign (Phase 1) - letting a decision expire is itself
        // a choice the fanbase reacts to, so it's recorded the same way an
        // actively-resolved one is.
        businessSentimentRows.push({
          leagueId,
          leagueTeamId: userControlledTeamId,
          season,
          dayIndex: lastDayIndex,
          kind: "BUSINESS_DECISION",
          delta: lastScaledFanHappinessDelta,
          description: `${decision.headline} - no response, so "${defaultOption.label}" happened by default.`,
        });
      }

      await prisma.$transaction([
        ...expired.map((decision) =>
          prisma.businessDecision.update({
            where: { id: decision.id },
            data: {
              status: "EXPIRED",
              resolvedOptionId: decision.defaultOptionId,
              resolvedAt: new Date(),
            },
          }),
        ),
        prisma.leagueTeam.update({
          where: { id: userControlledTeamId },
          data: { cashReserveCents, fanHappiness },
        }),
        prisma.league.update({ where: { id: leagueId }, data: { ownerConfidence } }),
        ...(ledgerRows.length > 0
          ? [
              prisma.businessLedgerEntry.createMany({
                data: ledgerRows.map((row) => ({
                  leagueId,
                  leagueTeamId: userControlledTeamId,
                  season,
                  dayIndex: lastDayIndex,
                  category: row.category,
                  amountCents: row.amountCents,
                  description: row.description,
                  businessDecisionId: row.businessDecisionId,
                })),
              }),
            ]
          : []),
        prisma.leagueTransaction.createMany({
          data: newsRows.map((row) => ({
            leagueId,
            season,
            type: "BUSINESS_DECISION" as const,
            description: row.description,
            importance: row.importance,
            teamIds: [userControlledTeamId],
          })),
        }),
        ...fanSentimentCreateOps(businessSentimentRows),
      ]);
    }
  }

  let breakingDecisionPending = stillPending.some((d) => d.severity === "BREAKING");

  if (
    stillPending.length < MAX_PENDING_BUSINESS_DECISIONS &&
    shouldTriggerEvent(gamesInBatch, BUSINESS_EVENT_CHANCE_PER_GAME)
  ) {
    const [team, bestPlayer, completedProjects, conferenceStandings, lastPlayedGame] =
      await Promise.all([
        prisma.leagueTeam.findUnique({
          where: { id: userControlledTeamId },
          select: {
            cashReserveCents: true,
            fanHappiness: true,
            ticketPricingPosture: true,
            // Finances as a Gameplay Pillar (Phase 4) - Marketing.
            marketingLevel: true,
            // Business Decision catalog expansion (2026-08-06) - already
            // maintained incrementally alongside wins/losses, no derivation
            // needed.
            currentStreak: true,
            wins: true,
            losses: true,
            team: { select: { marketSize: true, conference: true } },
          },
        }),
        prisma.leaguePlayer.findFirst({
          where: { leagueTeamId: userControlledTeamId, isActive: true },
          orderBy: { overallRating: "desc" },
          select: { id: true, overallRating: true, player: { select: { fullName: true } } },
        }),
        // Finances as a Gameplay Pillar (Phase 5) - a completed International
        // Academy stacks a sponsorship-multiplier bonus onto Marketing's own.
        prisma.capitalProject.findMany({
          where: { leagueId, leagueTeamId: userControlledTeamId, status: "COMPLETE" },
          select: { kind: true },
        }),
        // Business Decision catalog expansion (2026-08-06) - the user's own
        // conference standings, for a cheap "top 6 / bottom of the conference"
        // contention read. Not a precise playoff seed (no tiebreakers), just an
        // eligibility signal - see BusinessDecisionContext.isPlayoffContender.
        prisma.leagueTeam.findMany({
          where: { leagueId },
          select: { id: true, wins: true, losses: true, team: { select: { conference: true } } },
        }),
        // Business Decision catalog expansion (2026-08-06) - the margin of the
        // most recently completed game, for the two blowout-result cards.
        prisma.game.findFirst({
          where: {
            leagueId,
            season,
            playedAt: { not: null },
            OR: [
              { homeLeagueTeamId: userControlledTeamId },
              { awayLeagueTeamId: userControlledTeamId },
            ],
          },
          orderBy: { dayIndex: "desc" },
          select: { homeLeagueTeamId: true, homeScore: true, awayScore: true },
        }),
      ]);

    if (team) {
      const starTier = bestPlayer ? getPlayerValueTier(bestPlayer.overallRating) : null;
      const isStar = starTier === "STAR" || starTier === "SUPERSTAR";
      const franchisePopularity = computeFranchisePopularity(
        team.fanHappiness,
        starTier,
        team.team.marketSize,
      );

      // Business Decision catalog expansion (2026-08-06) - top 6 of the
      // user's conference (the direct-playoff-qualifier line seedConference
      // uses) counts as "contending"; outside the top 10 (below the play-in
      // field) counts as "lottery-bound."
      const sameConference = conferenceStandings.filter(
        (t) => t.team.conference === team.team.conference,
      );
      const rank =
        1 +
        sameConference.filter((t) => {
          const tPct = t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0;
          const myPct = team.wins + team.losses > 0 ? team.wins / (team.wins + team.losses) : 0;
          return tPct > myPct;
        }).length;
      const isPlayoffContender = rank <= 6;
      const isLotteryBound = rank > 10;

      const lastGameMargin =
        lastPlayedGame && lastPlayedGame.homeScore !== null && lastPlayedGame.awayScore !== null
          ? lastPlayedGame.homeLeagueTeamId === userControlledTeamId
            ? lastPlayedGame.homeScore - lastPlayedGame.awayScore
            : lastPlayedGame.awayScore - lastPlayedGame.homeScore
          : null;

      const content = rollForBusinessDecision({
        cashReserveCents: team.cashReserveCents,
        fanHappiness: team.fanHappiness,
        franchisePopularity,
        starPlayer:
          isStar && bestPlayer
            ? { leaguePlayerId: bestPlayer.id, fullName: bestPlayer.player.fullName }
            : null,
        ticketPricingPosture: team.ticketPricingPosture,
        // Finances as a Gameplay Pillar (Phase 2) - "preseason-ish" proxy:
        // this simulator has no separate preseason phase, so sponsorship
        // offers cluster in the first month of games instead.
        isEarlySeasonWindow: lastDayIndex <= EARLY_SEASON_WINDOW_DAYS,
        // Finances as a Gameplay Pillar (Phase 4/5) - Marketing, plus a
        // completed International Academy's stacked bonus.
        marketingMultiplier:
          computeMarketingSponsorshipMultiplier(team.marketingLevel) +
          sumCompletedProjectEffects(completedProjects.map((p) => p.kind))
            .sponsorshipMultiplierBonus,
        currentStreak: team.currentStreak,
        isPlayoffContender,
        isLotteryBound,
        lastGameMargin,
      });

      if (content) {
        await prisma.businessDecision.create({
          data: {
            leagueId,
            leagueTeamId: userControlledTeamId,
            season,
            dayIndex: lastDayIndex,
            kind: content.kind,
            severity: content.severity,
            headline: content.headline,
            body: content.body,
            options: content.options as unknown as object,
            defaultOptionId: content.defaultOptionId,
            deadlineDayIndex: lastDayIndex + content.deadlineDays,
          },
        });
        if (content.severity === "BREAKING") breakingDecisionPending = true;
      }
    }
  }

  return { breakingDecisionPending };
}
