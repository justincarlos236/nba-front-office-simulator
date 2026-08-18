import { prisma } from "@/lib/prisma";

/**
 * The real, already-enforced season-progression gate (see
 * `advanceSeasonAction` in `src/lib/actions/offseason.ts`, which hard-blocks
 * on these same three signals in this same order) - not a new rule. Extracted
 * here because it was independently recomputed in three places
 * (`offseason/page.tsx`, `draft/page.tsx`, and the `/leagues` hub's
 * `describeStatus`) with the same underlying queries.
 */
export type LeaguePhase =
  "regular-season" | "playoffs-incomplete" | "pre-draft" | "draft-incomplete" | "ready";

/**
 * Pure decision logic, split out from the DB fetch below so it's unit-testable
 * on its own.
 *
 * Scouting Pillar Redesign added `pre-draft`: the window between a
 * champion being crowned and the lottery being run, when the draft class
 * exists but nobody knows where they pick yet. `draftStarted` (the lottery
 * having assigned pick numbers) is the same signal that previously moved a
 * league into `draft-incomplete` - it's now just checked one step later, so
 * a save already past the lottery lands in exactly the phase it did before.
 */
export function deriveLeaguePhase(
  regularSeasonGamesRemaining: number,
  championCrowned: boolean,
  draftComplete: boolean,
  draftStarted: boolean,
): LeaguePhase {
  if (regularSeasonGamesRemaining > 0) return "regular-season";
  if (!championCrowned) return "playoffs-incomplete";
  if (draftComplete) return "ready";
  return draftStarted ? "draft-incomplete" : "pre-draft";
}

export async function computeLeaguePhase(leagueId: string, season: number): Promise<LeaguePhase> {
  const [regularSeasonGamesRemaining, finals, totalDraftPicks, pendingDraftPicks] =
    await Promise.all([
      prisma.game.count({
        where: { leagueId, season, type: "REGULAR_SEASON", playedAt: null },
      }),
      prisma.playoffSeries.findFirst({ where: { leagueId, season, round: 4 } }),
      // A future-pick placeholder for `season` always exists by now (Phase
      // 11a); `overallPickNumber` is the real "draft started" signal.
      prisma.draftPick.count({
        where: { leagueId, season, overallPickNumber: { not: null } },
      }),
      prisma.draftPick.count({
        where: { leagueId, season, overallPickNumber: { not: null }, selectedProspectId: null },
      }),
    ]);

  return deriveLeaguePhase(
    regularSeasonGamesRemaining,
    Boolean(finals?.winnerTeamId),
    totalDraftPicks > 0 && pendingDraftPicks === 0,
    totalDraftPicks > 0,
  );
}
