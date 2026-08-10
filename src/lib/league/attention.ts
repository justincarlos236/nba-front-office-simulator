import { prisma } from "@/lib/prisma";
import { computeLeaguePhase, type LeaguePhase } from "@/lib/league/leaguePhase";

/**
 * What needs the user, counted once, for the whole product.
 *
 * The audit found seven separate surfaces trying to tell the user something -
 * the Action Center, the business-decision inbox (rendered twice), the news
 * feed, ownership messages on the offseason page, the job-security card, the
 * fans page's reaction feed, and ephemeral sim banners - and exactly **one**
 * badge, on the Finances tab bar, visible only once you were already inside
 * Finances. So the one thing that can hard-block a season was invisible from
 * the navigation.
 *
 * This is the single source: the nav asks it for counts, and every section
 * that needs attention reports through it rather than inventing its own
 * indicator.
 */

/** Nav section ids, matching `subNavSections.ts`. */
export type AttentionSection =
  "finances" | "draft" | "offseason" | "freeAgents" | "playoffs" | "staff";

export type AttentionCounts = Partial<Record<AttentionSection, number>>;

export interface LeagueAttention {
  counts: AttentionCounts;
  /** Something is blocking season progression right now. */
  blocked: boolean;
  total: number;
}

/**
 * Only genuinely actionable state counts. A section is not "needing you"
 * because it contains information - it needs you because something there is
 * waiting on a decision that will not resolve itself.
 */
export async function getLeagueAttention(
  leagueId: string,
  season: number,
  userLeagueTeamId: string | null,
  phase?: LeaguePhase,
): Promise<LeagueAttention> {
  const resolvedPhase = phase ?? (await computeLeaguePhase(leagueId, season));

  const [pendingDecisions, allStarWeekend, pendingDraftPicks, unsignedRosterSpots] =
    await Promise.all([
      userLeagueTeamId
        ? prisma.businessDecision.count({
            where: { leagueId, leagueTeamId: userLeagueTeamId, status: "PENDING" },
          })
        : Promise.resolve(0),
      prisma.allStarWeekend.findUnique({
        where: { leagueId_season: { leagueId, season } },
        select: { status: true },
      }),
      // Only the user's own picks are actionable; CPU picks resolve themselves.
      userLeagueTeamId
        ? prisma.draftPick.count({
            where: {
              leagueId,
              season,
              currentOwnerId: userLeagueTeamId,
              overallPickNumber: { not: null },
              selectedProspectId: null,
            },
          })
        : Promise.resolve(0),
      userLeagueTeamId
        ? prisma.leaguePlayer.count({
            where: { leagueTeamId: userLeagueTeamId, isActive: true },
          })
        : Promise.resolve(0),
    ]);

  const counts: AttentionCounts = {};

  if (pendingDecisions > 0) counts.finances = pendingDecisions;
  if (pendingDraftPicks > 0) counts.draft = pendingDraftPicks;

  // A roster below the league minimum cannot start a season - that is a real
  // block, not a preference.
  const MIN_ROSTER = 12;
  if (
    userLeagueTeamId &&
    unsignedRosterSpots < MIN_ROSTER &&
    (resolvedPhase === "ready" || resolvedPhase === "draft-incomplete")
  ) {
    counts.freeAgents = MIN_ROSTER - unsignedRosterSpots;
  }

  if (resolvedPhase === "ready") counts.offseason = 1;
  if (resolvedPhase === "playoffs-incomplete") counts.playoffs = 1;

  // A PENDING All-Star weekend hard-blocks simulation (see simulateGamesAction),
  // and the route it lives on appears in no navigation at all - the single
  // worst orphan the audit found.
  const allStarPending = allStarWeekend?.status === "PENDING";

  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);

  return {
    counts,
    blocked: allStarPending || pendingDecisions > 0,
    total: total + (allStarPending ? 1 : 0),
  };
}
