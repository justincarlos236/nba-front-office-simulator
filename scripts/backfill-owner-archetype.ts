/**
 * One-time backfill for Phase 6, "CPU Selective Depth" (2026-08-06):
 * `OwnerArchetype` moved from `League` (one per save, the user's own owner
 * only) to `LeagueTeam` (one per team, including CPU) - see
 * docs/design/FINANCES_PILLAR_DESIGN.md Part 8.4. The migration itself
 * (`20260805201936_owner_archetype_per_team`) already copied each league's
 * prior `League.ownerArchetype` onto its `userControlledTeamId` row; this
 * script rolls a fresh archetype for every *other* team - the 29 CPU teams
 * per league that never had one, plus the user's own team in the rare case
 * a league predates even the original Phase 3 rollout.
 *
 * Deterministic (seeded by leagueId+teamId, so a re-run reaches the same
 * result rather than re-rolling). Safe to re-run: only targets rows still
 * at ownerArchetypeSince === 0, the unambiguous "never backfilled" sentinel
 * (a real ownership change always sets it to a real season >= the league's
 * founding season).
 *
 * Run with: npx tsx scripts/backfill-owner-archetype.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { rollOwnerArchetype } from "../src/lib/gm/ownerArchetype";
import { createSeededRandom } from "../src/lib/contracts/seededRandom";

async function main() {
  const teams = await prisma.leagueTeam.findMany({
    where: { ownerArchetypeSince: 0 },
    select: { id: true, leagueId: true, league: { select: { currentSeason: true } } },
  });

  console.log(`Found ${teams.length} team(s) needing an owner archetype backfill.`);

  let updated = 0;
  for (const team of teams) {
    const rng = createSeededRandom(`owner-archetype:${team.leagueId}:${team.id}`);
    const archetype = rollOwnerArchetype(rng);
    await prisma.leagueTeam.update({
      where: { id: team.id },
      data: { ownerArchetype: archetype, ownerArchetypeSince: team.league.currentSeason },
    });
    updated += 1;
  }

  console.log(`Backfilled ${updated} team(s) with a rolled owner archetype.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
