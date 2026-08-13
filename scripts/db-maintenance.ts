/**
 * Reports and reclaims index bloat.
 *
 * Measured 2026-08-14, this was the single largest consumer of database size -
 * far larger than the box scores that were assumed to be the problem:
 *
 *   contract_years                43.2 MB ->  0.4 MB    (1,816 rows)
 *   player_personality_profiles   18.3 MB ->  0.2 MB      (777 rows)
 *   draft_picks                   11.3 MB ->  0.2 MB      (600 rows)
 *
 * Forty megabytes of index against under two megabytes of data. These are the
 * churn-heavy tables: contract years are deleted and recreated wholesale every
 * offseason, and Postgres reclaims a dead index entry's space for reuse
 * without ever returning the page. Autovacuum handles the heap and leaves the
 * indexes; on Neon the compute also autosuspends, so autovacuum gets less
 * chance to run than it would on an always-on instance.
 *
 * VACUUM FULL rewrites table and indexes from scratch. It takes an ACCESS
 * EXCLUSIVE lock, so it blocks all reads and writes on that table for its
 * duration - run it when nobody is playing, not on a schedule during the day.
 *
 * Run: npx tsx scripts/db-maintenance.ts          (report only)
 *      npx tsx scripts/db-maintenance.ts --apply  (reclaim)
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

/** Below this, the reclaim is not worth an exclusive lock. */
const REPORT_THRESHOLD_MB = 1;

interface TableSize {
  table: string;
  totalMb: number;
  dataMb: number;
  indexMb: number;
  rows: number;
}

async function tableSizes(): Promise<TableSize[]> {
  const rows = await prisma.$queryRawUnsafe<
    { t: string; total: bigint; tbl: bigint; idx: bigint; n: bigint }[]
  >(`
    SELECT c.relname AS t,
           pg_total_relation_size(c.oid) AS total,
           pg_table_size(c.oid)          AS tbl,
           pg_indexes_size(c.oid)        AS idx,
           c.reltuples::bigint           AS n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC;`);
  return rows.map((r) => ({
    table: r.t,
    totalMb: Number(r.total) / 1048576,
    dataMb: Number(r.tbl) / 1048576,
    indexMb: Number(r.idx) / 1048576,
    rows: Number(r.n),
  }));
}

async function databaseSizeMb(): Promise<number> {
  const [{ size }] = await prisma.$queryRawUnsafe<{ size: bigint }[]>(
    `SELECT pg_database_size(current_database()) AS size;`,
  );
  return Number(size) / 1048576;
}

async function main() {
  const before = await databaseSizeMb();
  const sizes = await tableSizes();

  console.log(`database: ${before.toFixed(0)} MB of 512 MB\n`);
  console.log(
    "TABLE".padEnd(32) + "TOTAL".padStart(9) + "DATA".padStart(9) + "INDEX".padStart(9) + "ROWS".padStart(11),
  );
  for (const s of sizes.filter((s) => s.totalMb >= REPORT_THRESHOLD_MB)) {
    console.log(
      s.table.padEnd(32) +
        s.totalMb.toFixed(1).padStart(9) +
        s.dataMb.toFixed(1).padStart(9) +
        s.indexMb.toFixed(1).padStart(9) +
        s.rows.toLocaleString().padStart(11),
    );
  }

  const candidates = sizes.filter((s) => s.totalMb >= REPORT_THRESHOLD_MB);
  if (!APPLY) {
    console.log(`\n${candidates.length} table(s) above ${REPORT_THRESHOLD_MB} MB. Re-run with --apply to reclaim.`);
    console.log("VACUUM FULL locks each table exclusively - do it while nobody is playing.");
    await prisma.$disconnect();
    return;
  }

  console.log("\nreclaiming (exclusive lock per table)...");
  for (const s of candidates) {
    await prisma.$executeRawUnsafe(`VACUUM FULL ${s.table};`);
    const [after] = (await tableSizes()).filter((t) => t.table === s.table);
    const saved = s.totalMb - (after?.totalMb ?? s.totalMb);
    if (saved >= 0.5) {
      console.log(
        `  ${s.table.padEnd(32)} ${s.totalMb.toFixed(1).padStart(7)} -> ${(after?.totalMb ?? 0).toFixed(1).padStart(7)} MB`,
      );
    }
  }

  const after = await databaseSizeMb();
  console.log(`\ndatabase: ${before.toFixed(0)} MB -> ${after.toFixed(0)} MB  (freed ${(before - after).toFixed(0)} MB)`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
