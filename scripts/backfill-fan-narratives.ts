/**
 * One-time backfill for the Fans Page Redesign (Phase 5): trajectory
 * narratives (Rebuild Progress Watch, Championship Window Watch) only ever
 * open/close at the season boundary, so an existing save with an active
 * SHOW_ME_PROGRESS or CHAMPIONSHIP_OR_BUST mandate (already backfilled in
 * Phase 4) would otherwise show no narrative at all until its next season
 * advances - even though the underlying trajectory has clearly been true
 * for a while.
 *
 * Event-driven narratives (icon-departure fallout) are deliberately NOT
 * backfilled here - they're tied to the specific moment a real trade
 * happened, which has already passed for any existing save. Retroactively
 * inventing "this trade happened N seasons ago, here's a fallout story"
 * would be fabricating a narrative timeline that never actually played out
 * in real time, unlike Franchise Memory (which needs no backfill at all -
 * it's a pure live read over existing LeagueTransaction history, nothing
 * to persist).
 *
 * Safe to re-run: progressFanNarratives itself only ever opens a narrative
 * when one isn't already OPEN for that team+kind, so a second run is a
 * no-op wherever the first one already acted.
 *
 * Run with: npx tsx scripts/backfill-fan-narratives.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { progressFanNarratives } from "../src/lib/actions/fanNarrative";

async function main() {
  const leagues = await prisma.league.findMany({ select: { id: true, currentSeason: true } });

  console.log(`Checking ${leagues.length} league(s) for trajectory narratives to backfill.`);

  let totalTeams = 0;
  for (const league of leagues) {
    const teams = await prisma.leagueTeam.findMany({
      where: { leagueId: league.id },
      select: {
        id: true,
        fanHappiness: true,
        fanMandate: { select: { primary: true } },
      },
    });
    const teamsWithMandate = teams.filter((t) => t.fanMandate);
    if (teamsWithMandate.length === 0) continue;

    // No champion is known retroactively for a season that already
    // happened without this system tracking it - false either way is the
    // honest default (a real title win going forward will still close the
    // window correctly next season).
    await progressFanNarratives(
      league.id,
      teamsWithMandate.map((t) => ({
        leagueTeamId: t.id,
        season: league.currentSeason,
        fanHappiness: t.fanHappiness,
        primaryMandate: t.fanMandate!.primary,
        wonChampionshipThisSeason: false,
      })),
    );
    totalTeams += teamsWithMandate.length;
  }

  console.log(`Checked ${totalTeams} team(s) for trajectory narratives to open.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
