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
import { describeSigning, describeTrade } from "@/lib/transactions/describeTransaction";

const INJURY_CHANCE_PER_TEAM_GAME = 0.02;
const TRADE_CHANCE_PER_GAME = 0.006;
const SIGNING_CHANCE_PER_GAME = 0.01;

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

  const [batchTeams, injuredPlayers, healthyPlayers] = await Promise.all([
    prisma.leagueTeam.findMany({ where: { id: { in: teamIds } } }),
    prisma.leaguePlayer.findMany({
      where: { leagueId, leagueTeamId: { in: teamIds }, injuryStatus: { not: "HEALTHY" } },
      include: { player: true },
    }),
    prisma.leaguePlayer.findMany({
      where: { leagueId, leagueTeamId: { in: teamIds }, injuryStatus: "HEALTHY", isActive: true },
      include: { player: true },
    }),
  ]);

  // Already reflects this batch's wins/losses - simulateGamesAction persists
  // game/team updates before calling this function.
  const gamesPlayedByTeam = new Map(batchTeams.map((t) => [t.id, t.wins + t.losses]));

  const transactions: { type: "INJURY" | "TRADE" | "SIGNING"; description: string }[] = [];

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
      });
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
      const result = rollForTeamInjury(pool, Math.random, INJURY_CHANCE_PER_TEAM_GAME);
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
      });
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

  const totalGames = simulatedGames.length;

  if (shouldTriggerEvent(totalGames, TRADE_CHANCE_PER_GAME)) {
    await maybeExecuteCpuTrade(leagueId, season, userControlledTeamId, transactions);
  }
  if (shouldTriggerEvent(totalGames, SIGNING_CHANCE_PER_GAME)) {
    await maybeExecuteCpuSigning(leagueId, season, userControlledTeamId, transactions);
  }

  if (transactions.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: transactions.map((t) => ({
        leagueId,
        season,
        type: t.type,
        description: t.description,
      })),
    });
  }
}

async function maybeExecuteCpuTrade(
  leagueId: string,
  season: number,
  userControlledTeamId: string | null,
  transactions: { type: "INJURY" | "TRADE" | "SIGNING"; description: string }[],
): Promise<void> {
  const cpuLeagueTeams = await prisma.leagueTeam.findMany({
    where: { leagueId, ...(userControlledTeamId ? { id: { not: userControlledTeamId } } : {}) },
    include: {
      team: true,
      players: {
        where: { isActive: true },
        include: { player: true, contract: { include: { years: { where: { season } } } } },
      },
    },
  });

  const cpuTeams: CpuTeam[] = cpuLeagueTeams
    .map((lt) => ({
      leagueTeamId: lt.id,
      teamLabel: `${lt.team.city} ${lt.team.name}`,
      roster: lt.players
        .filter((p) => p.contract?.years[0])
        .map((p) => ({
          leaguePlayerId: p.id,
          playerName: p.player.fullName,
          rating: p.overallRating,
          salaryCents: p.contract!.years[0].salaryCents,
          noTradeClause: p.contract!.noTradeClause,
        })),
      capState: (() => {
        const capSheet = computeCapSheet({
          season,
          contracts: lt.players
            .filter((p) => p.contract?.years[0])
            .map((p) => ({ playerId: p.playerId, salaryCents: p.contract!.years[0].salaryCents })),
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
    }))
    .filter((t) => t.roster.length > 0);

  const result = rollForCpuTrade(cpuTeams, season);
  if (!result) return;

  await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        leagueId,
        proposedById: result.teamA.leagueTeamId,
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
          fromLeagueTeamId: result.teamA.leagueTeamId,
          toLeagueTeamId: result.teamB.leagueTeamId,
          leaguePlayerId: result.teamA.player.leaguePlayerId,
        },
        {
          tradeId: trade.id,
          type: "PLAYER",
          fromLeagueTeamId: result.teamB.leagueTeamId,
          toLeagueTeamId: result.teamA.leagueTeamId,
          leaguePlayerId: result.teamB.player.leaguePlayerId,
        },
      ],
    });
    await tx.leaguePlayer.update({
      where: { id: result.teamA.player.leaguePlayerId },
      data: { leagueTeamId: result.teamB.leagueTeamId, reSigningTeamId: result.teamB.leagueTeamId },
    });
    await tx.contract.update({
      where: { leaguePlayerId: result.teamA.player.leaguePlayerId },
      data: { leagueTeamId: result.teamB.leagueTeamId },
    });
    await tx.leaguePlayer.update({
      where: { id: result.teamB.player.leaguePlayerId },
      data: { leagueTeamId: result.teamA.leagueTeamId, reSigningTeamId: result.teamA.leagueTeamId },
    });
    await tx.contract.update({
      where: { leaguePlayerId: result.teamB.player.leaguePlayerId },
      data: { leagueTeamId: result.teamA.leagueTeamId },
    });
  });

  transactions.push({
    type: "TRADE",
    description: describeTrade(
      { teamLabel: result.teamA.teamLabel, sentAssetNames: [result.teamA.player.playerName] },
      { teamLabel: result.teamB.teamLabel, sentAssetNames: [result.teamB.player.playerName] },
    ),
  });
}

async function maybeExecuteCpuSigning(
  leagueId: string,
  season: number,
  userControlledTeamId: string | null,
  transactions: { type: "INJURY" | "TRADE" | "SIGNING"; description: string }[],
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
      data: { leagueTeamId: team.id, reSigningTeamId: team.id },
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
  });

  transactions.push({
    type: "SIGNING",
    description: describeSigning(
      `${team.team.city} ${team.team.name}`,
      freeAgent.player.fullName,
      1,
      offerSalaryCents,
    ),
  });
}
