/**
 * Test-only setup helper: opens the whole GM job market for a freshly
 * signed-up e2e user.
 *
 * A new user starts at 50 reputation, and `computeJobOffer` gates the
 * strongest five or so franchises behind a higher number - so a title
 * contender like Boston is genuinely unavailable on a first save. That gate
 * is correct product behaviour and is covered by unit tests over
 * `computeJobOffer`; it is not what the browser specs are testing. They pick
 * a specific team because their later assertions depend on that team's real
 * roster, so they need the job to be takeable.
 *
 * Runs as a separate `tsx` process (via child_process from the spec) rather
 * than being imported into the Playwright test file, because Playwright's own
 * transform can't load the generated Prisma client (ESM-only, uses
 * import.meta) the way `tsx` can. Same reason as
 * `e2e-fast-forward-season.ts`.
 *
 * Run with: npx tsx scripts/e2e-grant-reputation.ts <email>
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: e2e-grant-reputation.ts <email>");

  const result = await prisma.user.updateMany({
    where: { email },
    data: { gmReputation: 100 },
  });
  if (result.count === 0) throw new Error(`No user with email ${email}`);
  console.log(`Granted max GM reputation to ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
