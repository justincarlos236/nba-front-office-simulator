/**
 * One-time backfill: rolls up completed seasons in leagues that predate
 * `rollupCompletedSeasons` being wired into season advance.
 *
 * New leagues need nothing - they roll up as they go. This exists for the
 * seasons already sitting in the database, which is where the current size
 * problem lives.
 *
 * Reports the size before and after. Postgres does not return freed pages to
 * the operating system on DELETE, so the reclaim needs a VACUUM FULL, which
 * this runs on the box-score table only.
 *
 * Run: npx tsx scripts/rollup-historical-stats.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { rollupCompletedSeasons } from "../src/lib/stats/rollupSeasonStats";

async function databaseSizeMb(): Promise<number> {
  const [{ size }] = await prisma.$queryRawUnsafe<{ size: bigint }[]>(
    `SELECT pg_database_size(current_database()) AS size;`,
  );
  return Number(size) / 1024 / 1024;
}

async function main() {
  const before = await databaseSizeMb();
  const boxScoresBefore = await prisma.playerGameStat.count();
  console.log(`before: ${before.toFixed(0)} MB, ${boxScoresBefore.toLocaleString()} box scores\n`);

  const leagues = await prisma.league.findMany({
    select: { id: true, name: true, currentSeason: true },
    orderBy: { createdAt: "asc" },
  });

  let rowsWritten = 0;
  let boxScoresDeleted = 0;
  for (const league of leagues) {
    const result = await rollupCompletedSeasons(league.id, league.currentSeason);
    rowsWritten += result.rowsWritten;
    boxScoresDeleted += result.boxScoresDeleted;
    if (result.boxScoresDeleted > 0) {
      console.log(
        `  ${league.name.padEnd(28)} s${league.currentSeason}  ` +
          `${result.boxScoresDeleted.toLocaleString().padStart(9)} box scores -> ` +
          `${result.rowsWritten.toLocaleString().padStart(6)} rollup rows`,
      );
    }
  }

  console.log(
    `\ntotal: ${boxScoresDeleted.toLocaleString()} box scores -> ${rowsWritten.toLocaleString()} rollup rows`,
  );
  if (boxScoresDeleted > 0) {
    console.log(`       ${(boxScoresDeleted / Math.max(1, rowsWritten)).toFixed(1)}x fewer rows`);
  }

  console.log("\nreclaiming freed pages...");
  await prisma.$executeRawUnsafe(`VACUUM FULL player_game_stats;`);

  const after = await databaseSizeMb();
  console.log(`\nafter:  ${after.toFixed(0)} MB  (freed ${(before - after).toFixed(0)} MB)`);
  console.log(
    `        ${(await prisma.playerGameStat.count()).toLocaleString()} box scores remain (seasons in progress)`,
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
