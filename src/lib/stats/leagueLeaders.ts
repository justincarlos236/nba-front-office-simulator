import { prisma } from "@/lib/prisma";

export interface LeagueLeaderEntry {
  leaguePlayerId: string;
  fullName: string;
  photoUrl: string | null;
  teamAbbreviation: string | null;
  teamPrimaryColor: string | null;
  gamesPlayed: number;
  value: number;
}

export interface LeagueLeadersResult {
  pointsPerGame: LeagueLeaderEntry[];
  reboundsPerGame: LeagueLeaderEntry[];
  assistsPerGame: LeagueLeaderEntry[];
  stealsPerGame: LeagueLeaderEntry[];
  blocksPerGame: LeagueLeaderEntry[];
  fieldGoalPct: LeagueLeaderEntry[];
  threePointPct: LeagueLeaderEntry[];
}

const LEADERS_PER_CATEGORY = 5;
// Below this many games, a per-game average is a small-sample fluke (a
// single 50-point night shouldn't top a season leaderboard) - same spirit
// as the valuation model's own confidence-shrinkage guard.
const MIN_GAMES_FOR_PER_GAME_LEADERS = 3;
// Below this many attempts, a shooting percentage is noise (a 2-for-2
// night isn't a real efficiency leader).
const MIN_ATTEMPTS_FOR_PCT_LEADERS = 20;

const EMPTY_RESULT: LeagueLeadersResult = {
  pointsPerGame: [],
  reboundsPerGame: [],
  assistsPerGame: [],
  stealsPerGame: [],
  blocksPerGame: [],
  fieldGoalPct: [],
  threePointPct: [],
};

/** Live league leaders for one league-season, aggregated from real simulated box scores. */
export async function getLeagueLeaders(
  leagueId: string,
  season: number,
): Promise<LeagueLeadersResult> {
  const grouped = await prisma.playerGameStat.groupBy({
    by: ["leaguePlayerId"],
    where: { leagueId, season },
    _avg: { points: true, rebounds: true, assists: true, steals: true, blocks: true },
    _sum: { fgMade: true, fgAttempted: true, fg3Made: true, fg3Attempted: true },
    _count: { _all: true },
  });
  if (grouped.length === 0) return EMPTY_RESULT;

  const leaguePlayerIds = grouped.map((g) => g.leaguePlayerId);
  const players = await prisma.leaguePlayer.findMany({
    where: { id: { in: leaguePlayerIds } },
    select: {
      id: true,
      player: { select: { fullName: true, photoUrl: true } },
      leagueTeam: { select: { team: { select: { abbreviation: true, primaryColor: true } } } },
    },
  });
  const playerById = new Map(players.map((p) => [p.id, p]));

  function baseEntry(
    leaguePlayerId: string,
    gamesPlayed: number,
    value: number,
  ): LeagueLeaderEntry {
    const p = playerById.get(leaguePlayerId);
    return {
      leaguePlayerId,
      fullName: p?.player.fullName ?? "Unknown",
      photoUrl: p?.player.photoUrl ?? null,
      teamAbbreviation: p?.leagueTeam?.team.abbreviation ?? null,
      teamPrimaryColor: p?.leagueTeam?.team.primaryColor ?? null,
      gamesPlayed,
      value,
    };
  }

  function topByAverage(statKey: "points" | "rebounds" | "assists" | "steals" | "blocks") {
    return grouped
      .filter((g) => g._count._all >= MIN_GAMES_FOR_PER_GAME_LEADERS)
      .map((g) => baseEntry(g.leaguePlayerId, g._count._all, g._avg[statKey] ?? 0))
      .sort((a, b) => b.value - a.value)
      .slice(0, LEADERS_PER_CATEGORY);
  }

  function topByPercentage(
    madeKey: "fgMade" | "fg3Made",
    attemptedKey: "fgAttempted" | "fg3Attempted",
  ) {
    return grouped
      .filter((g) => (g._sum[attemptedKey] ?? 0) >= MIN_ATTEMPTS_FOR_PCT_LEADERS)
      .map((g) =>
        baseEntry(
          g.leaguePlayerId,
          g._count._all,
          (g._sum[madeKey] ?? 0) / (g._sum[attemptedKey] || 1),
        ),
      )
      .sort((a, b) => b.value - a.value)
      .slice(0, LEADERS_PER_CATEGORY);
  }

  return {
    pointsPerGame: topByAverage("points"),
    reboundsPerGame: topByAverage("rebounds"),
    assistsPerGame: topByAverage("assists"),
    stealsPerGame: topByAverage("steals"),
    blocksPerGame: topByAverage("blocks"),
    fieldGoalPct: topByPercentage("fgMade", "fgAttempted"),
    threePointPct: topByPercentage("fg3Made", "fg3Attempted"),
  };
}
