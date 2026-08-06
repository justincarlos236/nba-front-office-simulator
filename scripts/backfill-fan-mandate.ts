/**
 * One-time backfill for the Fans Page Redesign (Phase 4): every LeagueTeam
 * created before FanMandate shipped has no row at all, so "What the City
 * Wants" would render blank for every existing save until its next season
 * boundary.
 *
 * Reuses each team's already-persisted FanCulture (see
 * backfill-fan-culture.ts, or the season-boundary recompute if the save has
 * advanced since) as the Patience/Expectation Ceiling input, and derives
 * the rest (roster strength/age, recent lottery picks, franchise
 * popularity) fresh from current state - the same shape
 * recomputeFanMandates uses, just invoked once immediately rather than
 * waiting for the next season boundary.
 *
 * Safe to re-run: only targets LeagueTeam rows with no FanMandate row yet.
 *
 * Run with: npx tsx scripts/backfill-fan-mandate.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { recomputeFanMandates, type TeamMandateContext } from "../src/lib/actions/fanMandate";
import { computeFranchisePopularity } from "../src/lib/fans/fanHappiness";
import { getPlayerValueTier } from "../src/lib/valuation/playerValueTier";

async function main() {
  const leagues = await prisma.league.findMany({ select: { id: true, currentSeason: true } });

  console.log(`Checking ${leagues.length} league(s) for teams needing a Fan Mandate backfill.`);

  let totalBackfilled = 0;
  for (const league of leagues) {
    const teamsNeedingBackfill = await prisma.leagueTeam.findMany({
      where: { leagueId: league.id, fanMandate: null },
      select: {
        id: true,
        fanHappiness: true,
        ticketPricingPosture: true,
        relocatedCityName: true,
        team: { select: { marketSize: true } },
        fanCulture: { select: { patience: true, expectationCeiling: true } },
      },
    });
    if (teamsNeedingBackfill.length === 0) continue;

    const bestPlayers = await prisma.leaguePlayer.findMany({
      where: { leagueTeamId: { in: teamsNeedingBackfill.map((t) => t.id) }, isActive: true },
      select: { leagueTeamId: true, overallRating: true },
      orderBy: { overallRating: "desc" },
    });
    const bestRatingByTeam = new Map<string, number>();
    for (const p of bestPlayers) {
      if (!p.leagueTeamId) continue;
      if (!bestRatingByTeam.has(p.leagueTeamId))
        bestRatingByTeam.set(p.leagueTeamId, p.overallRating);
    }

    const teamContexts: TeamMandateContext[] = teamsNeedingBackfill.map((t) => {
      const bestRating = bestRatingByTeam.get(t.id) ?? null;
      const starTier = bestRating != null ? getPlayerValueTier(bestRating) : null;
      return {
        leagueTeamId: t.id,
        marketSize: t.team.marketSize,
        ticketPricingPosture: t.ticketPricingPosture,
        hasRelocated: t.relocatedCityName != null,
        // iconScore isn't actually consumed by recomputeFanMandates (it
        // recomputes the roster's real icon score itself for the
        // KEEP_OUR_GUY overlay) - 0 here is inert, kept only to satisfy
        // TeamCultureContext's shape.
        iconScore: 0,
        franchisePopularity: computeFranchisePopularity(
          t.fanHappiness,
          starTier,
          t.team.marketSize,
        ),
      };
    });

    const cultureByTeam = new Map(
      teamsNeedingBackfill.map((t) => [
        t.id,
        t.fanCulture ?? { patience: 50, expectationCeiling: 50 },
      ]),
    );

    await recomputeFanMandates(league.id, league.currentSeason, teamContexts, cultureByTeam);
    totalBackfilled += teamContexts.length;
  }

  console.log(`Backfilled Fan Mandate for ${totalBackfilled} team(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
