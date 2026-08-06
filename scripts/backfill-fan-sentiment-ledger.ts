/**
 * One-time backfill for the Fans Page Redesign (Phase 1): every league
 * created before FanSentimentEvent shipped has a real fanHappiness number
 * but zero ledger rows explaining it, so "Why They Feel This Way" would
 * render empty for every existing save until its next in-season event.
 *
 * No synthetic *historical* P&L-style precision is fabricated here (same
 * principle as backfill-franchise-finances.ts) - the original per-event
 * deltas from past seasons were never persisted, so they genuinely can't be
 * reconstructed exactly. Instead, this seeds rows for the CURRENT season
 * only, derived from the real LeagueTransaction log already on record,
 * using a small, fixed-magnitude tone classification (the same idea the
 * page's old reaction feed used before Phase 2 replaced it with the real
 * per-event descriptions the ledger now carries) - a conservative, honest
 * approximation rather than a precise-looking guess. Every season from here
 * forward accrues real, exact deltas at the moment they happen, same as a
 * fresh save.
 *
 * Safe to re-run: only targets leagueId+leagueTeamId+season combinations
 * that don't already have at least one FanSentimentEvent row, so a
 * partial/interrupted run just picks up the leagues it hasn't reached yet.
 *
 * Run with: npx tsx scripts/backfill-fan-sentiment-ledger.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { FanSentimentKind } from "../src/generated/prisma/client";

// Deliberately small and flat - this is an approximation of history the
// simulator can no longer know precisely, not a re-simulation of it. Real
// per-event magnitudes (which already vary 1-9 depending on star power,
// severity, etc.) resume the moment a fresh event happens post-backfill.
const TONE_DELTA_BY_TRANSACTION_TYPE: Record<string, number | undefined> = {
  TRADE: 0, // direction unknown from a transaction row alone - see fanReactions.ts's old rationale
  SIGNING: 2,
  WIN_STREAK: 2,
  INJURY: -2,
  STAFF_HIRE: 2,
  STAFF_FIRE: -2,
  ALL_STAR_SELECTION: 2,
  ALL_STAR_SNUB: -2,
  ALL_STAR_RESULT: 2,
  AWARD: 2,
  ROTATION_CHANGE: 0, // direction (promotion vs. demotion) unknown from type alone
  BUSINESS_DECISION: 0, // direction unknown from type alone
};

// LeagueTransaction.type values that already have a real, more specific
// FanSentimentKind - approximated here as the closest match so a backfilled
// row still groups into the right theme/label on the page.
const KIND_BY_TRANSACTION_TYPE: Record<string, FanSentimentKind | undefined> = {
  TRADE: "TRADE",
  SIGNING: "SIGNING",
  WIN_STREAK: "WIN_STREAK",
  INJURY: "INJURY",
  STAFF_HIRE: "STAFF_CHANGE",
  STAFF_FIRE: "STAFF_CHANGE",
  ALL_STAR_SELECTION: "ALL_STAR_SELECTION",
  ALL_STAR_SNUB: "ALL_STAR_SNUB",
  ALL_STAR_RESULT: "ALL_STAR_RESULT",
  AWARD: "AWARD",
  ROTATION_CHANGE: "ROTATION_CHANGE",
  BUSINESS_DECISION: "BUSINESS_DECISION",
};

async function main() {
  const leagues = await prisma.league.findMany({
    where: { userControlledTeamId: { not: null } },
    select: { id: true, currentSeason: true, userControlledTeamId: true },
  });

  console.log(
    `Checking ${leagues.length} league(s) for a missing current-season sentiment ledger.`,
  );

  let seeded = 0;
  let skipped = 0;
  for (const league of leagues) {
    const leagueTeamId = league.userControlledTeamId!;
    const existing = await prisma.fanSentimentEvent.findFirst({
      where: { leagueId: league.id, leagueTeamId, season: league.currentSeason },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const transactions = await prisma.leagueTransaction.findMany({
      where: { leagueId: league.id, season: league.currentSeason, teamIds: { has: leagueTeamId } },
      orderBy: { createdAt: "asc" },
    });

    const rows = transactions
      .map((t) => {
        const kind = KIND_BY_TRANSACTION_TYPE[t.type];
        if (!kind) return null;
        const delta = TONE_DELTA_BY_TRANSACTION_TYPE[t.type] ?? 0;
        if (delta === 0) return null;
        return {
          leagueId: league.id,
          leagueTeamId,
          season: league.currentSeason,
          dayIndex: 0, // real day-level detail wasn't retained on LeagueTransaction either
          kind,
          delta,
          description: t.description,
        };
      })
      .filter((r) => r !== null);

    if (rows.length > 0) {
      await prisma.fanSentimentEvent.createMany({ data: rows });
      seeded += 1;
    }
  }

  console.log(`Seeded ${seeded} league(s), skipped ${skipped} already-populated league(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
