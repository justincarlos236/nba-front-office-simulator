/**
 * A player's performance *inside this save*, for pricing.
 *
 * **Contracts were priced off statistics that never advance.** `seasonStats` is
 * seeded real-world data, and every free-agency path queries it with
 * `season = league.currentSeason`. Leagues start at 2026 and the dataset
 * carries mostly 2025, so 21% of players have stats in a save's first season
 * and **none at all from its second onward** - see docs/CONTRACT_AUDIT.md
 * C-P1-2. A player who averages thirty points for five in-sim seasons was
 * priced identically to a benchwarmer of the same rating, and an in-sim drafted
 * rookie had no statistics at all, which is why `cpuFreeAgentMarket` used to
 * skip him entirely (C-P2-5).
 *
 * The simulation has been recording all of this the whole time. This reads it.
 *
 * Two sources, because a season's box scores are collapsed once it ends:
 *
 *   - a **completed** season comes from `LeaguePlayerSeasonStat`, the rollup
 *     written at season advance (src/lib/stats/rollupSeasonStats.ts)
 *   - a season **in progress** comes from the raw `PlayerGameStat` rows
 *
 * Regular season only. Playoff samples are small, selective and unrepresentative
 * of what a player is paid for.
 */
import { prisma } from "@/lib/prisma";
import type { PlayerValuationStats } from "./playerValue";

export interface InSimPerformance extends PlayerValuationStats {
  gamesPlayed: number;
}

/**
 * Below this, a season is too small a sample to price off and the caller should
 * fall back. Mirrors the sample-size weighting `contractQualityScore` already
 * applies - a player with four good games is not a star.
 */
const MIN_GAMES_FOR_PRICING = 10;

/** Points per possession-ish denominator; the standard true-shooting formula. */
function trueShooting(points: number, fgAttempted: number, ftAttempted: number): number {
  const denominator = 2 * (fgAttempted + 0.44 * ftAttempted);
  return denominator > 0 ? points / denominator : 0.56;
}

function fromTotals(totals: {
  gamesPlayed: number;
  minutesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgAttempted: number;
  ftAttempted: number;
}): InSimPerformance | null {
  if (totals.gamesPlayed < MIN_GAMES_FOR_PRICING) return null;
  const per = (total: number) => total / totals.gamesPlayed;
  return {
    gamesPlayed: totals.gamesPlayed,
    minutesPerGame: per(totals.minutesPlayed),
    pointsPerGame: per(totals.points),
    reboundsPerGame: per(totals.rebounds),
    assistsPerGame: per(totals.assists),
    stealsPerGame: per(totals.steals),
    blocksPerGame: per(totals.blocks),
    turnoversPerGame: per(totals.turnovers),
    trueShootingPct: trueShooting(totals.points, totals.fgAttempted, totals.ftAttempted),
  };
}

/**
 * In-sim regular-season performance for a whole league, keyed by
 * `leaguePlayerId`. Absent from the map means "no usable in-sim sample" and the
 * caller should fall back to seeded stats.
 *
 * Looks at `season` first and `season - 1` behind it, because pricing runs at
 * the season boundary: during the offseason the season just completed is the
 * relevant record, and it has already been rolled up.
 */
export async function loadInSimPerformance(
  leagueId: string,
  season: number,
): Promise<Map<string, InSimPerformance>> {
  const [rollups, live] = await Promise.all([
    prisma.leaguePlayerSeasonStat.findMany({
      where: { leagueId, season: { in: [season, season - 1] }, gameType: "REGULAR_SEASON" },
      orderBy: { season: "desc" },
    }),
    prisma.playerGameStat.groupBy({
      by: ["leaguePlayerId"],
      where: { leagueId, season, gameType: "REGULAR_SEASON" },
      _count: { _all: true },
      _sum: {
        minutesPlayed: true,
        points: true,
        rebounds: true,
        assists: true,
        steals: true,
        blocks: true,
        turnovers: true,
        fgAttempted: true,
        ftAttempted: true,
      },
    }),
  ]);

  const performance = new Map<string, InSimPerformance>();

  // Rollups are ordered newest first, so the first write for a player wins and
  // an older season never overwrites a newer one.
  for (const row of rollups) {
    if (performance.has(row.leaguePlayerId)) continue;
    const stats = fromTotals(row);
    if (stats) performance.set(row.leaguePlayerId, stats);
  }

  // A season in progress is the most current record there is, so it takes
  // precedence over any rollup - but only once it is a real sample.
  for (const row of live) {
    const stats = fromTotals({
      gamesPlayed: row._count._all,
      minutesPlayed: row._sum.minutesPlayed ?? 0,
      points: row._sum.points ?? 0,
      rebounds: row._sum.rebounds ?? 0,
      assists: row._sum.assists ?? 0,
      steals: row._sum.steals ?? 0,
      blocks: row._sum.blocks ?? 0,
      turnovers: row._sum.turnovers ?? 0,
      fgAttempted: row._sum.fgAttempted ?? 0,
      ftAttempted: row._sum.ftAttempted ?? 0,
    });
    if (stats) performance.set(row.leaguePlayerId, stats);
  }

  return performance;
}
