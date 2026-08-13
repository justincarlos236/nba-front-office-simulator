/**
 * Removes `Player` rows that no longer appear in the current dataset and that
 * no league references.
 *
 * **Why this is needed.** `prisma/seed.ts` is additive by design - it upserts on
 * `externalId` and never deletes - and `createLeagueAction` builds a new league
 * from the whole `Player` table, not from the dataset file. That combination is
 * fine while `externalId` is stable, and quietly corrupting when it is not: a
 * re-import that changed the id source created a second row for all 585 players
 * (see `enrichBios.ts`, where the ref order is load-bearing), and every league
 * created afterwards drew from a mix of the old rows and the new. The visible
 * symptom was two Joel Embiids in the trade builder and LaMelo Ball on the team
 * he had left.
 *
 * **Safety.** Only rows that are (a) absent from the current dataset and (b)
 * referenced by no `LeaguePlayer` are touched. Anything an existing save is
 * built on is left alone - `Player.leaguePlayers` has no `onDelete`, so the
 * database would refuse anyway; this just refuses first, with an explanation.
 *
 * Dry-run by default. Pass `--apply` to actually delete.
 *
 * Run: npx tsx scripts/prune-stale-players.ts [--apply]
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/prisma";

const DATASET = path.join(import.meta.dirname, "..", "prisma", "data", "nbaDataset.json");

async function main() {
  const apply = process.argv.includes("--apply");
  const file = JSON.parse(await readFile(DATASET, "utf8")) as {
    players: { externalId: string | null; fullName: string }[];
  };
  const current = new Set(
    file.players.map((p) => p.externalId).filter((id): id is string => id !== null),
  );
  console.log(`Dataset carries ${current.size} externalIds.`);

  const seeded = await prisma.player.findMany({
    where: { seedOverallRating: { not: null } },
    select: {
      id: true,
      externalId: true,
      fullName: true,
      _count: { select: { leaguePlayers: true } },
    },
  });
  console.log(`Player rows with a seed rating: ${seeded.length}\n`);

  const stale = seeded.filter((p) => p.externalId === null || !current.has(p.externalId));
  const orphaned = stale.filter((p) => p._count.leaguePlayers === 0);
  const referenced = stale.filter((p) => p._count.leaguePlayers > 0);

  console.log(`Not in the current dataset: ${stale.length}`);
  console.log(`  referenced by a league (kept):  ${referenced.length}`);
  console.log(`  orphaned (safe to remove):      ${orphaned.length}\n`);

  const sample = orphaned.slice(0, 8);
  if (sample.length > 0) {
    console.log("Sample of what would be removed:");
    for (const p of sample) console.log(`  ${p.fullName.padEnd(26)} externalId=${p.externalId}`);
    console.log("");
  }

  if (!apply) {
    console.log("DRY RUN - nothing deleted. Re-run with --apply to remove the orphaned rows.");
    await prisma.$disconnect();
    return;
  }

  const ids = orphaned.map((p) => p.id);
  // Children first: both have a required Player relation with no cascade.
  const stats = await prisma.playerSeasonStat.deleteMany({ where: { playerId: { in: ids } } });
  const years = await prisma.playerSeedContractYear.deleteMany({
    where: { playerId: { in: ids } },
  });
  const removed = await prisma.player.deleteMany({ where: { id: { in: ids } } });
  console.log(
    `Deleted ${removed.count} players, ${stats.count} season stats, ${years.count} contract years.`,
  );
  console.log(`Kept ${referenced.length} stale rows that existing leagues still reference.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
