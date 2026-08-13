/**
 * Collapses a completed season's box scores into one row per player, then
 * deletes the raw rows.
 *
 * Box scores dominate database size: a simulated season writes roughly 24,000
 * `PlayerGameStat` rows (~20 MB), and on a 512 MB instance that caps the whole
 * product at about two dozen simulated seasons across every user combined.
 * Rolling up cuts that to a few hundred rows a season.
 *
 * Nothing in the simulation reads a past season's box scores. All-Star
 * selection, offseason awards, in-season events, league leaders and the award
 * race all scope their queries to `{ leagueId, season }` for the season being
 * played. The one cross-season read is career highs - per-category maxima,
 * preserved exactly by `high*`.
 *
 * Idempotent by design. It runs after the season-advance commit rather than
 * inside it, so a failure here can never block a user's offseason; the next
 * advance, or `scripts/rollup-historical-stats.ts`, picks up whatever was
 * missed.
 */
import { prisma } from "@/lib/prisma";
import type { GameType } from "@/generated/prisma/client";

export interface SeasonRollupResult {
  /** Rollup rows written (one per player per game type). */
  rowsWritten: number;
  /** Raw box scores deleted. */
  boxScoresDeleted: number;
}

const EMPTY: SeasonRollupResult = { rowsWritten: 0, boxScoresDeleted: 0 };

/**
 * Rolls up a single season. Safe to call on a season already rolled up (there
 * will be no raw rows left to find) or on one that was never played.
 */
export async function rollupSeasonStats(
  leagueId: string,
  season: number,
): Promise<SeasonRollupResult> {
  const grouped = await prisma.playerGameStat.groupBy({
    by: ["leaguePlayerId", "gameType"],
    where: { leagueId, season },
    _count: { _all: true },
    _sum: {
      minutesPlayed: true,
      points: true,
      rebounds: true,
      assists: true,
      steals: true,
      blocks: true,
      turnovers: true,
      fgMade: true,
      fgAttempted: true,
      fg3Made: true,
      fg3Attempted: true,
      ftMade: true,
      ftAttempted: true,
    },
    _max: {
      points: true,
      rebounds: true,
      assists: true,
      steals: true,
      blocks: true,
    },
  });

  if (grouped.length === 0) return EMPTY;

  const rows = grouped.map((g) => ({
    leagueId,
    leaguePlayerId: g.leaguePlayerId,
    season,
    gameType: g.gameType as GameType,
    gamesPlayed: g._count._all,
    minutesPlayed: g._sum.minutesPlayed ?? 0,
    points: g._sum.points ?? 0,
    rebounds: g._sum.rebounds ?? 0,
    assists: g._sum.assists ?? 0,
    steals: g._sum.steals ?? 0,
    blocks: g._sum.blocks ?? 0,
    turnovers: g._sum.turnovers ?? 0,
    fgMade: g._sum.fgMade ?? 0,
    fgAttempted: g._sum.fgAttempted ?? 0,
    fg3Made: g._sum.fg3Made ?? 0,
    fg3Attempted: g._sum.fg3Attempted ?? 0,
    ftMade: g._sum.ftMade ?? 0,
    ftAttempted: g._sum.ftAttempted ?? 0,
    highPoints: g._max.points ?? 0,
    highRebounds: g._max.rebounds ?? 0,
    highAssists: g._max.assists ?? 0,
    highSteals: g._max.steals ?? 0,
    highBlocks: g._max.blocks ?? 0,
  }));

  // Write before delete, and in one transaction, so a crash between the two
  // can never lose a season's stats outright. Re-running after a partial
  // failure re-derives the same rows from whatever raw data survived.
  const [, deleted] = await prisma.$transaction([
    prisma.leaguePlayerSeasonStat.createMany({ data: rows, skipDuplicates: true }),
    prisma.playerGameStat.deleteMany({ where: { leagueId, season } }),
  ]);

  return { rowsWritten: rows.length, boxScoresDeleted: deleted.count };
}

/**
 * Rolls up every season strictly before `currentSeason` that still has raw box
 * scores. The season in progress keeps its full game log - that is the one the
 * game log, leaders board and award race all read.
 *
 * Sweeps all prior seasons rather than only the one just finished so a league
 * that predates this rollup, or one where a previous attempt failed, converges
 * on its own without a migration step.
 */
export async function rollupCompletedSeasons(
  leagueId: string,
  currentSeason: number,
): Promise<SeasonRollupResult> {
  const stale = await prisma.playerGameStat.groupBy({
    by: ["season"],
    where: { leagueId, season: { lt: currentSeason } },
  });

  let rowsWritten = 0;
  let boxScoresDeleted = 0;
  for (const { season } of stale.sort((a, b) => a.season - b.season)) {
    const result = await rollupSeasonStats(leagueId, season);
    rowsWritten += result.rowsWritten;
    boxScoresDeleted += result.boxScoresDeleted;
  }
  return { rowsWritten, boxScoresDeleted };
}
