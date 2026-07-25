import { prisma } from "@/lib/prisma";
import { describeBestPlayoffFinish } from "@/lib/gm/careerRecord";

export interface CareerRecordSnapshot {
  seasons: number;
  wins: number;
  losses: number;
  championships: number;
  playoffAppearances: number;
  bestPlayoffFinish: string;
  notableTradeDescription: string | null;
}

/**
 * Gathers every stat a career-end snapshot needs, straight from permanent
 * league data - no new tracking required for any of this (career earnings
 * is the one exception, tracked incrementally on `LeagueTeam` and passed
 * in separately by the caller, since expired `Contract` rows don't
 * survive to be reconstructed after the fact). Read-only; the caller
 * writes the actual `CareerRecord`.
 */
export async function computeCareerRecordSnapshot(
  leagueId: string,
  userLeagueTeamId: string,
): Promise<CareerRecordSnapshot> {
  const [seasons, games, playoffSeries, notableTradeDescription] = await Promise.all([
    prisma.seasonExpectation.count({ where: { leagueId } }),
    prisma.game.findMany({
      where: {
        leagueId,
        type: "REGULAR_SEASON",
        playedAt: { not: null },
        OR: [{ homeLeagueTeamId: userLeagueTeamId }, { awayLeagueTeamId: userLeagueTeamId }],
      },
      select: { homeLeagueTeamId: true, awayLeagueTeamId: true, homeScore: true, awayScore: true },
    }),
    prisma.playoffSeries.findMany({
      where: {
        leagueId,
        OR: [{ higherSeedTeamId: userLeagueTeamId }, { lowerSeedTeamId: userLeagueTeamId }],
      },
      select: { season: true, round: true, winnerTeamId: true },
    }),
    findNotableTradeDescription(leagueId, userLeagueTeamId),
  ]);

  let wins = 0;
  let losses = 0;
  for (const g of games) {
    const isHome = g.homeLeagueTeamId === userLeagueTeamId;
    const teamScore = isHome ? g.homeScore : g.awayScore;
    const opponentScore = isHome ? g.awayScore : g.homeScore;
    if (teamScore === null || opponentScore === null) continue;
    if (teamScore > opponentScore) wins++;
    else losses++;
  }

  const playoffSeasons = new Set(playoffSeries.map((s) => s.season));
  const championships = playoffSeries.filter(
    (s) => s.round === 4 && s.winnerTeamId === userLeagueTeamId,
  ).length;
  const maxRoundReached =
    playoffSeries.length > 0 ? Math.max(...playoffSeries.map((s) => s.round)) : null;
  const wonFinals = playoffSeries.some((s) => s.round === 4 && s.winnerTeamId === userLeagueTeamId);

  return {
    seasons,
    wins,
    losses,
    championships,
    playoffAppearances: playoffSeasons.size,
    bestPlayoffFinish: describeBestPlayoffFinish(maxRoundReached, wonFinals),
    notableTradeDescription,
  };
}

/**
 * A one-time retroactive scan, run only at career-end - not a stored
 * grade. Ranks every executed trade this team was part of by net rating
 * gained (acquired players' *current* overallRating minus surrendered
 * players' current overallRating) - an honest "how did this look in
 * hindsight" measure, not a value-at-the-time model (which would need
 * historical salary/age data this app doesn't preserve).
 */
async function findNotableTradeDescription(
  leagueId: string,
  userLeagueTeamId: string,
): Promise<string | null> {
  const trades = await prisma.trade.findMany({
    where: {
      leagueId,
      status: "EXECUTED",
      assets: {
        some: {
          OR: [{ fromLeagueTeamId: userLeagueTeamId }, { toLeagueTeamId: userLeagueTeamId }],
        },
      },
    },
    include: {
      assets: {
        where: { type: "PLAYER" },
        include: { leaguePlayer: { include: { player: true } } },
      },
    },
  });

  let best: { netGain: number; acquired: string[]; given: string[] } | null = null;
  for (const trade of trades) {
    const acquired = trade.assets.filter(
      (a) => a.toLeagueTeamId === userLeagueTeamId && a.leaguePlayer,
    );
    const given = trade.assets.filter(
      (a) => a.fromLeagueTeamId === userLeagueTeamId && a.leaguePlayer,
    );
    const acquiredRating = acquired.reduce((sum, a) => sum + a.leaguePlayer!.overallRating, 0);
    const givenRating = given.reduce((sum, a) => sum + a.leaguePlayer!.overallRating, 0);
    const netGain = acquiredRating - givenRating;
    if (netGain > 0 && (!best || netGain > best.netGain)) {
      best = {
        netGain,
        acquired: acquired.map((a) => a.leaguePlayer!.player.fullName),
        given: given.map((a) => a.leaguePlayer!.player.fullName),
      };
    }
  }

  if (!best) return null;
  return describeBestTrade(best);
}

function describeBestTrade(best: { acquired: string[]; given: string[] }): string {
  const acquiredText = best.acquired.length > 0 ? best.acquired.join(", ") : "a future asset";
  const givenText = best.given.length > 0 ? best.given.join(", ") : "a future asset";
  return `Acquired ${acquiredText} for ${givenText}`;
}
