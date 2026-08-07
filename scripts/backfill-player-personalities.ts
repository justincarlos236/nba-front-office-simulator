/**
 * One-time backfill for the Player Morale & Personality System: every
 * LeaguePlayer created before this feature shipped has no
 * PlayerPersonalityProfile row yet. `morale`/`tradeRequestActive` already
 * get their schema defaults for free on existing rows (a plain migration
 * default), but the personality profile is a full generated record, not a
 * scalar default - it needs an explicit pass. Safe to re-run: only
 * targets LeaguePlayers missing a profile, so a partial/interrupted run
 * just picks up where it left off.
 *
 * Run with: npx tsx scripts/backfill-player-personalities.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { generatePersonalityProfile } from "../src/lib/morale/generatePersonality";

const BATCH_SIZE = 500;

async function main() {
  let totalCreated = 0;
  for (;;) {
    const missing = await prisma.leaguePlayer.findMany({
      where: { personalityProfile: null },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (missing.length === 0) break;

    await prisma.playerPersonalityProfile.createMany({
      data: missing.map((lp) => ({
        leaguePlayerId: lp.id,
        ...generatePersonalityProfile(lp.id),
      })),
    });
    totalCreated += missing.length;
    console.log(`Backfilled ${totalCreated} personality profiles so far...`);
  }
  console.log(`Done. Backfilled ${totalCreated} personality profiles.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
