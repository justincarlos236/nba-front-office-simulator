/**
 * One-time backfill for the Franchise Finances & Business Operations
 * system: every LeagueTeam created before this feature shipped starts with
 * cashReserveCents = 0 and franchiseValueCents = 0 (the migration defaults).
 * This seeds each such team a market-scaled starting balance sheet - the
 * same values a brand-new franchise gets at bootstrap (src/lib/actions/
 * league.ts) - so the /finances dashboard has believable current numbers to
 * show immediately. Per-season FinancialSnapshot history then accrues
 * naturally the next time each league advances a season (no synthetic
 * historical P&L is fabricated here, and no snapshot is created for the
 * current, not-yet-advanced season - advancing it would collide on the
 * unique [leagueId, leagueTeamId, season] constraint).
 *
 * Safe to re-run: only targets teams still at the 0/0 default, so a
 * partial/interrupted run just picks up where it left off. A team that has
 * legitimately been driven to a 0 balance by gameplay would be re-seeded,
 * but that can't happen yet (the first season pass hasn't run for these
 * leagues), so the 0/0 sentinel is unambiguous at backfill time.
 *
 * Run with: npx tsx scripts/backfill-franchise-finances.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  computeFranchiseValue,
  startingCashReserveCents,
  pickCpuTicketPosture,
} from "../src/lib/finances/finances";
import { computeFranchisePopularity } from "../src/lib/fans/fanHappiness";

async function main() {
  const teams = await prisma.leagueTeam.findMany({
    where: { cashReserveCents: 0n, franchiseValueCents: 0n },
    include: { team: { select: { marketSize: true } } },
  });

  console.log(`Found ${teams.length} league-teams needing a starting balance sheet.`);

  let updated = 0;
  for (const lt of teams) {
    const startingCash = startingCashReserveCents(lt.team.marketSize);
    const startingValue = computeFranchiseValue({
      marketSize: lt.team.marketSize,
      // Neutral start - fanHappiness defaults to 65, no star assumed. The
      // first real season pass recomputes this from the actual roster.
      franchisePopularity: computeFranchisePopularity(65, null, lt.team.marketSize),
      playoffOutcomeIndex: 0,
      cashReserveCents: startingCash,
      priorValueCents: 0,
    });
    await prisma.leagueTeam.update({
      where: { id: lt.id },
      data: {
        cashReserveCents: BigInt(Math.round(startingCash)),
        franchiseValueCents: BigInt(Math.round(startingValue)),
      },
    });
    updated += 1;
  }

  console.log(`Backfilled ${updated} starting balance sheets.`);

  // Phase B - give existing CPU teams a market-based ticket posture for
  // revenue variety (Phase A left them all at the STANDARD default). The
  // user-controlled team in each league is left untouched, so the lever
  // stays the user's choice. Only rewrites teams still at STANDARD, so it's
  // safe to re-run and never clobbers a CPU posture already set at bootstrap.
  const leagues = await prisma.league.findMany({
    select: {
      userControlledTeamId: true,
      teams: { include: { team: { select: { marketSize: true } } } },
    },
  });
  let postures = 0;
  for (const league of leagues) {
    for (const lt of league.teams) {
      if (lt.id === league.userControlledTeamId) continue;
      if (lt.ticketPricingPosture !== "STANDARD") continue;
      const posture = pickCpuTicketPosture(lt.team.marketSize);
      if (posture === "STANDARD") continue;
      await prisma.leagueTeam.update({
        where: { id: lt.id },
        data: { ticketPricingPosture: posture },
      });
      postures += 1;
    }
  }
  console.log(`Set ${postures} CPU ticket postures.`);

  // Phase D - seed tenure for existing rostered players so the franchise-icon
  // model works on existing saves immediately. We can't know each player's
  // real join season, so we approximate with the league's first season (the
  // earliest Game season): the large majority of a save's rostered players
  // have been there since the start, and this is the honest best estimate
  // short of fabricating history. homegrown stays false (no draft record for
  // pre-existing players). Only touches players still missing joinedTeamSeason.
  const leaguesForTenure = await prisma.league.findMany({
    select: { id: true, currentSeason: true },
  });
  let tenured = 0;
  for (const league of leaguesForTenure) {
    const firstGame = await prisma.game.findFirst({
      where: { leagueId: league.id },
      orderBy: { season: "asc" },
      select: { season: true },
    });
    const startSeason = firstGame?.season ?? league.currentSeason;
    const res = await prisma.leaguePlayer.updateMany({
      where: { leagueId: league.id, leagueTeamId: { not: null }, joinedTeamSeason: null },
      data: { joinedTeamSeason: startSeason },
    });
    tenured += res.count;
  }
  console.log(`Seeded tenure for ${tenured} rostered players.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
