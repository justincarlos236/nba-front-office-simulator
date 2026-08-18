import { prisma } from "@/lib/prisma";
import type { FanSentimentKind } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

/**
 * the one shared write path for the
 * sentiment ledger, so the ~14 call sites that already compute a
 * fan-happiness delta don't each hand-roll the same insert.
 *
 * Every call site already had the delta; this only persists what was
 * previously discarded (see docs/design/FANS_PAGE_REDESIGN.md Part 1.2). Nothing
 * here computes or judges sentiment - src/lib/fans/sentimentEvents.ts stays
 * the sole owner of "how much does this move the fanbase."
 */

export interface SentimentRecord {
  leagueId: string;
  leagueTeamId: string;
  season: number;
  /** Season-day index; 0 for season-boundary events (awards, season result). */
  dayIndex?: number;
  kind: FanSentimentKind;
  delta: number;
  description: string;
  leaguePlayerId?: string | null;
}

/**
 * Zero-delta events are dropped rather than stored. An event that moved the
 * fanbase by 0 isn't a contributor to how they feel, and keeping them would
 * dilute the "biggest movers" ranking the page is built around (a fanbase
 * doesn't remember the trade that made them feel nothing). Callers can
 * therefore pass a delta unconditionally without guarding first.
 */
function toCreateInput(record: SentimentRecord): Prisma.FanSentimentEventCreateManyInput | null {
  if (record.delta === 0) return null;
  return {
    leagueId: record.leagueId,
    leagueTeamId: record.leagueTeamId,
    season: record.season,
    dayIndex: record.dayIndex ?? 0,
    kind: record.kind,
    delta: record.delta,
    description: record.description,
    leaguePlayerId: record.leaguePlayerId ?? null,
  };
}

/** Records a single sentiment event. No-ops on a zero delta. */
export async function recordFanSentiment(record: SentimentRecord): Promise<void> {
  const data = toCreateInput(record);
  if (!data) return;
  await prisma.fanSentimentEvent.create({ data });
}

/** Batch form for call sites that resolve several teams' deltas at once (trades, league-wide event passes). */
export async function recordFanSentimentMany(records: SentimentRecord[]): Promise<void> {
  const data = records.map(toCreateInput).filter((d) => d !== null);
  if (data.length === 0) return;
  await prisma.fanSentimentEvent.createMany({ data });
}

/**
 * Prisma-operation form for call sites that already build a `$transaction`
 * array - returns the create operations to splice in, so a sentiment row
 * commits atomically with the happiness change it explains rather than in a
 * separate round trip that could partially fail.
 */
export function fanSentimentCreateOps(records: SentimentRecord[]) {
  const data = records.map(toCreateInput).filter((d) => d !== null);
  if (data.length === 0) return [];
  return [prisma.fanSentimentEvent.createMany({ data })];
}

/**
 * Interactive-transaction form, for call sites already inside a
 * `prisma.$transaction(async (tx) => ...)` block (trade execution being the
 * main one). Writing through the same `tx` client is what makes the ledger
 * row and the fanHappiness update it explains commit or roll back together -
 * a ledger that survived a rolled-back trade would be actively misleading.
 */
export async function recordFanSentimentManyTx(
  tx: Pick<typeof prisma, "fanSentimentEvent">,
  records: SentimentRecord[],
): Promise<void> {
  const data = records.map(toCreateInput).filter((d) => d !== null);
  if (data.length === 0) return;
  await tx.fanSentimentEvent.createMany({ data });
}
