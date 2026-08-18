/**
 * One-time backfill for the Fans Page Redesign: every LeagueTeam
 * created before FanCulture shipped has no row at all, so the Fans page
 * would show a flat, meaningless neutral (50/50/50) for every save
 * regardless of its actual history - a 15-season save with a championship,
 * a traded icon, and a market-flooding rebuild would look identical to a
 * brand-new expansion team.
 *
 * This runs the exact same derivation the season-boundary recompute uses
 * (computeFanCulture over buildFanCultureHistoryInputs's bounded lookback
 * window) once, immediately, against each save's real persisted history -
 * so an existing save's culture reflects its actual seasons from the first
 * page load, not a blank slate that only starts developing identity going
 * forward.
 *
 * Safe to re-run: only targets LeagueTeam rows with no FanCulture row yet.
 *
 * Run with: npx tsx scripts/backfill-fan-culture.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeFanCulture } from "../src/lib/fans/fanCulture";
import { computeFranchiseIconScore } from "../src/lib/finances/franchiseIcon";
import { getPlayerValueTier } from "../src/lib/valuation/playerValueTier";
import {
  buildFanCultureHistoryInputs,
  type TeamCultureContext,
} from "../src/lib/actions/fanCulture";

async function main() {
  const leagues = await prisma.league.findMany({
    select: { id: true, currentSeason: true },
  });

  console.log(`Checking ${leagues.length} league(s) for teams needing a Fan Culture backfill.`);

  let totalBackfilled = 0;
  for (const league of leagues) {
    const teamsNeedingBackfill = await prisma.leagueTeam.findMany({
      where: { leagueId: league.id, fanCulture: null },
      select: {
        id: true,
        ticketPricingPosture: true,
        relocatedCityName: true,
        team: { select: { marketSize: true } },
      },
    });
    if (teamsNeedingBackfill.length === 0) continue;

    // Best active player per team, for the "does this team currently have a
    // real icon" input - same derivation offseason.ts's season-boundary
    // pass already uses.
    const bestPlayers = await prisma.leaguePlayer.findMany({
      where: {
        leagueTeamId: { in: teamsNeedingBackfill.map((t) => t.id) },
        isActive: true,
      },
      select: {
        leagueTeamId: true,
        overallRating: true,
        joinedTeamSeason: true,
        homegrown: true,
      },
      orderBy: { overallRating: "desc" },
    });
    const bestPlayerByTeam = new Map<string, (typeof bestPlayers)[number]>();
    for (const p of bestPlayers) {
      if (!p.leagueTeamId) continue;
      if (!bestPlayerByTeam.has(p.leagueTeamId)) bestPlayerByTeam.set(p.leagueTeamId, p);
    }

    const teamContexts: TeamCultureContext[] = teamsNeedingBackfill.map((t) => {
      const bp = bestPlayerByTeam.get(t.id);
      const iconScore = bp
        ? computeFranchiseIconScore({
            starTier: getPlayerValueTier(bp.overallRating),
            tenureSeasons:
              bp.joinedTeamSeason != null
                ? Math.max(0, league.currentSeason - bp.joinedTeamSeason)
                : 0,
            homegrown: bp.homegrown,
            careerAwards: 0,
          })
        : 0;
      return {
        leagueTeamId: t.id,
        marketSize: t.team.marketSize,
        ticketPricingPosture: t.ticketPricingPosture,
        hasRelocated: t.relocatedCityName != null,
        iconScore,
      };
    });

    const inputsByTeam = await buildFanCultureHistoryInputs(
      league.id,
      league.currentSeason,
      teamContexts,
    );

    for (const team of teamContexts) {
      const inputs = inputsByTeam.get(team.leagueTeamId)!;
      const traits = computeFanCulture(inputs);
      await prisma.fanCulture.create({
        data: {
          leagueId: league.id,
          leagueTeamId: team.leagueTeamId,
          patience: traits.patience,
          expectationCeiling: traits.expectationCeiling,
          loyalty: traits.loyalty,
          lastRecomputedSeason: league.currentSeason,
        },
      });
      totalBackfilled += 1;
    }
  }

  console.log(`Backfilled Fan Culture for ${totalBackfilled} team(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
