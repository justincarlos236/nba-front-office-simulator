import { prisma } from "@/lib/prisma";
import {
  computeFanCulture,
  FAN_CULTURE_LOOKBACK_SEASONS,
  type SeasonOutcome,
  type FanCultureHistoryInputs,
  type FanCultureTraits,
} from "@/lib/fans/fanCulture";
import { TICKET_POSTURE_FAN_DELTA } from "@/lib/finances/finances";
import type { MarketSize, TicketPricingPosture } from "@/generated/prisma/client";

/**
 * the thin DB shell around
 * src/lib/fans/fanCulture.ts's pure derivation. Every query here is scoped
 * to the bounded lookback window (season > cutoff), so cost stays fixed
 * regardless of how long the save has run.
 */

export interface TeamCultureContext {
  leagueTeamId: string;
  marketSize: MarketSize;
  ticketPricingPosture: TicketPricingPosture;
  hasRelocated: boolean;
  iconScore: number;
}

/**
 * Builds the pure FanCultureHistoryInputs for each team passed in - shared
 * by the season-boundary recompute below and the Fans page (which needs the
 * same inputs to explain a trait's real facts via explainFanCulture, not
 * just its number).
 */
export async function buildFanCultureHistoryInputs(
  leagueId: string,
  season: number,
  teams: TeamCultureContext[],
): Promise<Map<string, FanCultureHistoryInputs>> {
  const result = new Map<string, FanCultureHistoryInputs>();
  if (teams.length === 0) return result;
  const cutoffSeason = season - FAN_CULTURE_LOOKBACK_SEASONS;
  const teamIds = teams.map((t) => t.leagueTeamId);

  const [playoffSeries, happinessSnapshots, iconDepartures] = await Promise.all([
    prisma.playoffSeries.findMany({
      where: {
        leagueId,
        season: { gt: cutoffSeason, lte: season },
        OR: [{ higherSeedTeamId: { in: teamIds } }, { lowerSeedTeamId: { in: teamIds } }],
      },
      select: {
        season: true,
        round: true,
        higherSeedTeamId: true,
        lowerSeedTeamId: true,
        winnerTeamId: true,
      },
    }),
    prisma.fanHappinessSnapshot.findMany({
      where: { leagueId, leagueTeamId: { in: teamIds }, season: { gt: cutoffSeason, lte: season } },
      select: { leagueTeamId: true, fanHappiness: true },
    }),
    prisma.fanSentimentEvent.findMany({
      where: {
        leagueId,
        leagueTeamId: { in: teamIds },
        kind: "ICON_DEPARTURE",
        season: { gt: cutoffSeason, lte: season },
      },
      select: { leagueTeamId: true },
    }),
  ]);

  // Per-team, per-season best playoff depth this team reached (0 if no
  // series found that season) - a direct read of PlayoffSeries rather than
  // computeActualOutcome's single-season expectation-comparison shape,
  // which isn't what an aggregate-over-many-seasons trait needs.
  const outcomesByTeam = new Map<string, Map<number, number>>();
  for (const teamId of teamIds) outcomesByTeam.set(teamId, new Map());
  for (const series of playoffSeries) {
    if (!series.winnerTeamId) continue;
    // round 4 (Finals) win -> depth 6, any other round win -> depth = round + 1
    // (matching computeActualOutcome's scale); a loss's depth is the round
    // itself (eliminated in that round).
    for (const teamId of [series.higherSeedTeamId, series.lowerSeedTeamId]) {
      if (!outcomesByTeam.has(teamId)) continue;
      const won = series.winnerTeamId === teamId;
      const depth = series.round === 4 ? (won ? 6 : 5) : won ? series.round + 1 : series.round;
      const bySeason = outcomesByTeam.get(teamId)!;
      bySeason.set(series.season, Math.max(bySeason.get(series.season) ?? 0, depth));
    }
  }

  const happinessByTeam = new Map<string, number[]>();
  for (const s of happinessSnapshots) {
    const list = happinessByTeam.get(s.leagueTeamId) ?? [];
    list.push(s.fanHappiness);
    happinessByTeam.set(s.leagueTeamId, list);
  }

  const iconDeparturesByTeam = new Map<string, number>();
  for (const e of iconDepartures) {
    iconDeparturesByTeam.set(e.leagueTeamId, (iconDeparturesByTeam.get(e.leagueTeamId) ?? 0) + 1);
  }

  for (const team of teams) {
    const outcomesMap = outcomesByTeam.get(team.leagueTeamId) ?? new Map();
    const seasonOutcomes: SeasonOutcome[] = Array.from(outcomesMap.entries()).map(
      ([s, playoffDepth]) => ({ season: s, playoffDepth }),
    );
    result.set(team.leagueTeamId, {
      marketSize: team.marketSize,
      seasonOutcomes,
      happinessHistory: happinessByTeam.get(team.leagueTeamId) ?? [],
      iconDeparturesInWindow: iconDeparturesByTeam.get(team.leagueTeamId) ?? 0,
      currentIconScore: team.iconScore,
      hasRelocated: team.hasRelocated,
      ticketPostureFanDelta: TICKET_POSTURE_FAN_DELTA[team.ticketPricingPosture],
    });
  }
  return result;
}

/**
 * Recomputes and persists FanCulture for every team passed in. Called once
 * per season boundary from advanceSeasonAction, right after that season's
 * FanHappinessSnapshot rows are written, so the just-completed season is
 * already inside the window it recomputes from.
 *
 * Returns the freshly computed traits and the history inputs used to derive
 * them, so a caller that also needs to recompute FanMandate right afterward
 * (recomputeFanMandates, which depends on this pass's own Patience/
 * Expectation Ceiling) doesn't have to re-run buildFanCultureHistoryInputs's
 * queries a second time.
 */
export async function recomputeFanCultures(
  leagueId: string,
  season: number,
  teams: TeamCultureContext[],
): Promise<{
  traitsByTeam: Map<string, FanCultureTraits>;
  inputsByTeam: Map<string, FanCultureHistoryInputs>;
}> {
  if (teams.length === 0) return { traitsByTeam: new Map(), inputsByTeam: new Map() };
  const inputsByTeam = await buildFanCultureHistoryInputs(leagueId, season, teams);
  const traitsByTeam = new Map<string, FanCultureTraits>();

  await Promise.all(
    teams.map((team) => {
      const inputs = inputsByTeam.get(team.leagueTeamId)!;
      const traits = computeFanCulture(inputs);
      traitsByTeam.set(team.leagueTeamId, traits);
      return prisma.fanCulture.upsert({
        where: { leagueTeamId: team.leagueTeamId },
        create: {
          leagueId,
          leagueTeamId: team.leagueTeamId,
          patience: traits.patience,
          expectationCeiling: traits.expectationCeiling,
          loyalty: traits.loyalty,
          lastRecomputedSeason: season,
        },
        update: {
          patience: traits.patience,
          expectationCeiling: traits.expectationCeiling,
          loyalty: traits.loyalty,
          lastRecomputedSeason: season,
        },
      });
    }),
  );
  return { traitsByTeam, inputsByTeam };
}
