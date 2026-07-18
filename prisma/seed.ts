import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { TEAM_SEEDS } from "./data/teams";

/**
 * Seeds reference data. Teams are static (see prisma/data/teams.ts) and
 * seeded directly; players/season stats are pulled from a stats API and
 * contracts are generated from the valuation model - both land in a later
 * pass once that pipeline is wired up (see docs/ROADMAP.md, M1).
 */
async function main() {
  console.log(`Seeding ${TEAM_SEEDS.length} teams...`);

  for (const team of TEAM_SEEDS) {
    await prisma.team.upsert({
      where: { abbreviation: team.abbreviation },
      update: {
        name: team.name,
        city: team.city,
        conference: team.conference,
        division: team.division,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
      },
      create: {
        abbreviation: team.abbreviation,
        name: team.name,
        city: team.city,
        conference: team.conference,
        division: team.division,
        primaryColor: team.primaryColor,
        secondaryColor: team.secondaryColor,
      },
    });
  }

  const count = await prisma.team.count();
  console.log(`Done. ${count} teams in the database.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
