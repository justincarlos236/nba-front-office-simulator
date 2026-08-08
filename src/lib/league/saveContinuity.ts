import { prisma } from "@/lib/prisma";

/**
 * "What happened while you were gone."
 *
 * The audit found that a returning player after five days saw exactly what a
 * returning player after five minutes saw: the Action Center is a snapshot of
 * current state, and a snapshot engine structurally cannot report change.
 * `League.updatedAt` cannot fill the gap either - it moves on every write,
 * including the CPU activity of a simulation, so by the time the user is back
 * it reflects the simulation rather than the visit.
 *
 * These two timestamps are the missing boundary. Reading is separated from
 * advancing on purpose: the surface computing the welcome-back needs the *old*
 * `lastSeenAt`, so the advance has to happen after the diff is taken.
 */

export interface SaveContinuity {
  /** Null the first time a save is opened after this feature existed. */
  lastSeenAt: Date | null;
  /** Real-world days since the last visit; null when unknown. */
  daysAway: number | null;
  /** Transactions written since the last visit, newest first. */
  since: {
    id: string;
    type: string;
    description: string;
    importance: string;
    createdAt: Date;
  }[];
  /** Unread news, counted against the read boundary rather than the visit. */
  unreadCount: number;
}

/** How many "while you were away" items a surface should ever show at once. */
export const CONTINUITY_DISPLAY_LIMIT = 4;

/**
 * Reads the continuity window without mutating it. Safe to call from any
 * surface; call `markSaveSeen` separately once the diff has been rendered.
 */
export async function getSaveContinuity(
  leagueId: string,
  lastSeenAt: Date | null,
  newsReadThroughAt: Date | null,
): Promise<SaveContinuity> {
  if (!lastSeenAt) {
    return { lastSeenAt: null, daysAway: null, since: [], unreadCount: 0 };
  }

  const [since, unreadCount] = await Promise.all([
    prisma.leagueTransaction.findMany({
      where: {
        leagueId,
        createdAt: { gt: lastSeenAt },
        // A returning player wants the headlines, not every routine game
        // result - the full feed is what /transactions is for.
        importance: { in: ["BREAKING", "MAJOR"] },
      },
      orderBy: { createdAt: "desc" },
      take: CONTINUITY_DISPLAY_LIMIT,
      select: {
        id: true,
        type: true,
        description: true,
        importance: true,
        createdAt: true,
      },
    }),
    prisma.leagueTransaction.count({
      where: newsReadThroughAt
        ? { leagueId, createdAt: { gt: newsReadThroughAt } }
        : { leagueId },
    }),
  ]);

  const daysAway = Math.floor((Date.now() - lastSeenAt.getTime()) / 86_400_000);

  return { lastSeenAt, daysAway, since, unreadCount };
}

/**
 * Advances the visit clock. Call after the continuity window has been read,
 * never before - doing it first erases the very diff the surface is about to
 * show.
 */
export async function markSaveSeen(leagueId: string): Promise<void> {
  await prisma.league.update({
    where: { id: leagueId },
    data: { lastSeenAt: new Date() },
  });
}

/**
 * Advances the news read boundary. Separate from `markSaveSeen` so glancing at
 * the dashboard does not silently mark the whole feed read - only opening the
 * feed does that.
 */
export async function markNewsRead(leagueId: string): Promise<void> {
  await prisma.league.update({
    where: { id: leagueId },
    data: { newsReadThroughAt: new Date() },
  });
}
