/**
 * Pushes the branding fields in `prisma/data/teams.ts` onto the 30 `Team` rows.
 *
 * `Team` is seeded once and then read for the life of a database, so correcting
 * a logo URL in the source file does nothing for a deployment that is already
 * seeded - Chicago's mark stayed broken on the live site after the fix landed.
 * `npm run db:seed` would push it, but that also re-imports the entire player
 * dataset, which is far more than is wanted against a database holding saves.
 *
 * Only branding is touched: logo, colours, market size. Nothing here is
 * referenced by a league's state, so this is safe to run at any time, and it is
 * idempotent - running it twice changes nothing the second time.
 *
 * Run with: npx tsx scripts/backfill-team-logos.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TEAM_SEEDS } from "../prisma/data/teams";

async function main() {
  const existing = await prisma.team.findMany({
    select: { abbreviation: true, logoUrl: true, primaryColor: true, secondaryColor: true },
  });
  const byAbbreviation = new Map(existing.map((t) => [t.abbreviation, t]));

  let changed = 0;
  for (const seed of TEAM_SEEDS) {
    const current = byAbbreviation.get(seed.abbreviation);
    if (!current) {
      console.log(`  ${seed.abbreviation}  not in this database - skipped`);
      continue;
    }
    const differs =
      current.logoUrl !== seed.logoUrl ||
      current.primaryColor !== seed.primaryColor ||
      current.secondaryColor !== seed.secondaryColor;
    if (!differs) continue;

    await prisma.team.update({
      where: { abbreviation: seed.abbreviation },
      data: {
        logoUrl: seed.logoUrl,
        primaryColor: seed.primaryColor,
        secondaryColor: seed.secondaryColor,
        marketSize: seed.marketSize,
      },
    });
    changed += 1;
    if (current.logoUrl !== seed.logoUrl) {
      console.log(`  ${seed.abbreviation}  logo`);
      console.log(`      was ${current.logoUrl}`);
      console.log(`      now ${seed.logoUrl}`);
    } else {
      console.log(`  ${seed.abbreviation}  colours`);
    }
  }

  console.log(`\n${changed} of ${TEAM_SEEDS.length} teams updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
