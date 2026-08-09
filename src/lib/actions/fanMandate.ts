import { prisma } from "@/lib/prisma";
import {
  computeFanMandate,
  computeMandateSatisfaction,
  LOTTERY_PICK_MAX,
  RECENT_LOTTERY_WINDOW_SEASONS,
  type FanMandateKind,
} from "@/lib/fans/fanMandate";
import { computeFranchiseIconScore, ICON_DEPARTURE_THRESHOLD } from "@/lib/finances/franchiseIcon";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { resolvePlayerAge } from "@/lib/players/age";
import { buildFanCultureHistoryInputs, type TeamCultureContext } from "@/lib/actions/fanCulture";
import type { FanCultureHistoryInputs } from "@/lib/fans/fanCulture";

/**
 * Fans Page Redesign (Phase 4) - the thin DB shell around
 * src/lib/fans/fanMandate.ts's pure derivation. Recomputed alongside
 * FanCulture at every season boundary (the mandate depends on that same
 * pass's Patience/Expectation Ceiling values, so it's computed second).
 */

export interface TeamMandateContext extends TeamCultureContext {
  franchisePopularity: number;
}

/**
 * Recomputes and persists FanMandate for every team passed in, using each
 * team's FanCulture (already computed this pass - see recomputeFanCultures)
 * as an input. Reuses buildFanCultureHistoryInputs for the shared playoff-
 * history window rather than re-querying PlayoffSeries a second time.
 */
export async function recomputeFanMandates(
  leagueId: string,
  season: number,
  teams: TeamMandateContext[],
  cultureByTeam: Map<string, { patience: number; expectationCeiling: number }>,
  historyInputsByTeam?: Map<string, FanCultureHistoryInputs>,
): Promise<Map<string, FanMandateKind>> {
  const primaryByTeam = new Map<string, FanMandateKind>();
  if (teams.length === 0) return primaryByTeam;
  const teamIds = teams.map((t) => t.leagueTeamId);

  const historyInputs =
    historyInputsByTeam ?? (await buildFanCultureHistoryInputs(leagueId, season, teams));

  const [roster, lotteryPicks] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId: { in: teamIds }, isActive: true },
      select: {
        id: true,
        leagueTeamId: true,
        overallRating: true,
        joinedTeamSeason: true,
        homegrown: true,
        player: { select: { birthDate: true, draftYear: true } },
      },
    }),
    // A team's OWN lottery pick actually used (drafted a prospect with it) -
    // originalTeamId === currentOwnerId excludes a lottery pick acquired via
    // trade, which doesn't reflect this team's own rebuild investment the
    // way keeping and using your own top-14 pick does.
    prisma.draftPick.findMany({
      where: {
        leagueId,
        currentOwnerId: { in: teamIds },
        originalTeamId: { in: teamIds },
        season: { gt: season - RECENT_LOTTERY_WINDOW_SEASONS, lte: season },
        overallPickNumber: { lte: LOTTERY_PICK_MAX, not: null },
        selectedProspectId: { not: null },
      },
      select: { currentOwnerId: true },
    }),
  ]);

  const rosterByTeam = new Map<string, typeof roster>();
  for (const p of roster) {
    if (!p.leagueTeamId) continue;
    const list = rosterByTeam.get(p.leagueTeamId) ?? [];
    list.push(p);
    rosterByTeam.set(p.leagueTeamId, list);
  }
  const lotteryPickCountByTeam = new Map<string, number>();
  for (const pick of lotteryPicks) {
    lotteryPickCountByTeam.set(
      pick.currentOwnerId,
      (lotteryPickCountByTeam.get(pick.currentOwnerId) ?? 0) + 1,
    );
  }

  await Promise.all(
    teams.map((team) => {
      const teamRoster = rosterByTeam.get(team.leagueTeamId) ?? [];
      const teamStrength = computeTeamStrength(teamRoster.map((p) => p.overallRating));
      const ages = teamRoster.map((p) => resolvePlayerAge(p.player, season));
      const averageRosterAge = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 26;
      const recentLotteryPicks = lotteryPickCountByTeam.get(team.leagueTeamId) ?? 0;
      const culture = cultureByTeam.get(team.leagueTeamId) ?? {
        patience: 50,
        expectationCeiling: 50,
      };
      const inputs = historyInputs.get(team.leagueTeamId)!;

      const primary = computeFanMandate(
        {
          marketSize: team.marketSize,
          seasonOutcomes: inputs.seasonOutcomes,
          teamStrength,
          averageRosterAge,
          recentLotteryPicks,
          franchisePopularity: team.franchisePopularity,
          patience: culture.patience,
          expectationCeiling: culture.expectationCeiling,
        },
        season,
      );

      const latestSeasonOutcome =
        [...inputs.seasonOutcomes].sort((a, b) => b.season - a.season)[0] ?? null;
      const satisfaction = computeMandateSatisfaction({
        mandate: primary,
        teamStrength,
        latestSeasonOutcome,
        recentLotteryPicks,
      });

      // KEEP_OUR_GUY overlay - the roster's own longest-tenured real icon,
      // same computeFranchiseIconScore/ICON_DEPARTURE_THRESHOLD (CORNERSTONE
      // and up) Phase 1/3 already use as "this departure would be a real
      // business event," not a separate bar.
      const bestIcon = teamRoster
        .map((p) => {
          const tenure = p.joinedTeamSeason != null ? Math.max(0, season - p.joinedTeamSeason) : 0;
          return {
            id: p.id,
            iconScore: computeFranchiseIconScore({
              starTier: getPlayerValueTier(p.overallRating),
              tenureSeasons: tenure,
              homegrown: p.homegrown,
              careerAwards: 0,
            }),
          };
        })
        .filter((p) => p.iconScore >= ICON_DEPARTURE_THRESHOLD)
        .sort((a, b) => b.iconScore - a.iconScore)[0];
      const keepOurGuyPlayerId = bestIcon?.id ?? null;
      primaryByTeam.set(team.leagueTeamId, primary);

      return prisma.fanMandate.upsert({
        where: { leagueTeamId: team.leagueTeamId },
        create: {
          leagueId,
          leagueTeamId: team.leagueTeamId,
          primary,
          keepOurGuy: keepOurGuyPlayerId !== null,
          keepOurGuyPlayerId,
          satisfaction,
          lastRecomputedSeason: season,
        },
        update: {
          primary,
          keepOurGuy: keepOurGuyPlayerId !== null,
          keepOurGuyPlayerId,
          satisfaction,
          lastRecomputedSeason: season,
        },
      });
    }),
  );
  return primaryByTeam;
}
