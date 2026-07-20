/**
 * Test-only setup helper for the playoffs e2e test: plays out every
 * remaining regular-season game for a league, using the exact same pure
 * simulation functions and league-event logic `simulateGamesAction` uses
 * (see src/lib/actions/simulation.ts) - just invoked directly here instead
 * of through an authenticated server action. Finishing an 870-game season
 * one UI-driven batch of 50 at a time is what season-simulation.spec.ts
 * already covers, and would make a playoffs-focused test prohibitively slow.
 *
 * Processes games in batches of 50 (mirroring the real action's max batch
 * size) rather than one giant batch, both to match production behavior more
 * closely (team strength is recomputed - and injuries applied - every
 * batch, not once for the whole season) and to give the probabilistic
 * league events (injuries/CPU trades/CPU signings) the same number of
 * independent rolls a real playthrough would get.
 *
 * Runs as a separate `tsx` process (via child_process from the e2e test)
 * rather than being imported directly into the Playwright test file,
 * because Playwright's own test transform can't load the generated Prisma
 * client (ESM-only, uses import.meta) the way `tsx` can.
 *
 * Run with: npx tsx scripts/e2e-fast-forward-season.ts <leagueId>
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { computeLeagueTeamStrengths } from "../src/lib/actions/leagueTeamStrength";
import { applyLeagueEvents } from "../src/lib/actions/leagueEvents";
import { simulateGame } from "../src/lib/simulation/simulateGame";

const BATCH_SIZE = 50;

async function main() {
  const leagueId = process.argv[2];
  if (!leagueId) throw new Error("Usage: e2e-fast-forward-season.ts <leagueId>");

  const league = await prisma.league.findUniqueOrThrow({ where: { id: leagueId } });

  for (;;) {
    const games = await prisma.game.findMany({
      where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
      orderBy: { gameNumber: "asc" },
      take: BATCH_SIZE,
    });
    if (games.length === 0) break;

    const teamIds = [...new Set(games.flatMap((g) => [g.homeLeagueTeamId, g.awayLeagueTeamId]))];
    const strengthByTeam = await computeLeagueTeamStrengths(teamIds);

    const winIncrements = new Map<string, number>();
    const lossIncrements = new Map<string, number>();
    const playedAt = new Date();

    const gameUpdates = games.map((g) => {
      const result = simulateGame(
        strengthByTeam.get(g.homeLeagueTeamId) ?? 0,
        strengthByTeam.get(g.awayLeagueTeamId) ?? 0,
      );
      const winnerId = result.homeWon ? g.homeLeagueTeamId : g.awayLeagueTeamId;
      const loserId = result.homeWon ? g.awayLeagueTeamId : g.homeLeagueTeamId;
      winIncrements.set(winnerId, (winIncrements.get(winnerId) ?? 0) + 1);
      lossIncrements.set(loserId, (lossIncrements.get(loserId) ?? 0) + 1);
      return prisma.game.update({
        where: { id: g.id },
        data: { homeScore: result.homeScore, awayScore: result.awayScore, playedAt },
      });
    });

    await Promise.all([
      ...gameUpdates,
      ...[...winIncrements.entries()].map(([id, wins]) =>
        prisma.leagueTeam.update({ where: { id }, data: { wins: { increment: wins } } }),
      ),
      ...[...lossIncrements.entries()].map(([id, losses]) =>
        prisma.leagueTeam.update({ where: { id }, data: { losses: { increment: losses } } }),
      ),
    ]);

    await applyLeagueEvents(
      leagueId,
      league.currentSeason,
      league.userControlledTeamId,
      games.map((g) => ({
        homeLeagueTeamId: g.homeLeagueTeamId,
        awayLeagueTeamId: g.awayLeagueTeamId,
      })),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
