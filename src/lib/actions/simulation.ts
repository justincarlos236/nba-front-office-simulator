"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeLeagueTeamStrengths } from "@/lib/actions/leagueTeamStrength";
import { decideAllStarBreak, ALL_STAR_BREAK_GAMES_PLAYED } from "@/lib/simulation/allStarBreak";
import {
  applyLeagueEvents,
  applyPlayerMoraleEvents,
  applyBusinessDecisionEvents,
} from "@/lib/actions/leagueEvents";
import { simulateGame } from "@/lib/simulation/simulateGame";
import { generateBoxScore, type PlayerBoxScoreLine } from "@/lib/simulation/boxScore";
import {
  describeGameResult,
  describeMilestoneGame,
  describeWinStreak,
  type DescribedEvent,
} from "@/lib/transactions/describeGameEvents";
import {
  computeCoachBoxScoreModifier,
  computeCoachWinBonus,
  effectiveStaffQuality,
} from "@/lib/staff/coachModifiers";
import { generateAllStarWeekend } from "@/lib/actions/allStarWeekend";
import {
  applyFanHappinessDelta,
  applyScaledFanHappinessDelta,
  computeStreakSentimentDelta,
} from "@/lib/fans/sentimentEvents";
import { fanSentimentCreateOps, type SentimentRecord } from "@/lib/fans/recordSentiment";
import { describeStreakSentiment } from "@/lib/fans/describeSentiment";
import type { NewsImportance } from "@/generated/prisma/client";

interface RankedEvent {
  event: DescribedEvent;
  teamIds: string[];
  rank: number;
}

// Every qualifying game individually clears a real threshold, but with up
// to 50 games a batch, "every qualifying game" can still be a third of the
// whole batch - real sports coverage headlines the batch's most notable
// handful, not literally every one that technically qualifies. `limit`
// scales with batch size so a single-game click isn't starved and a
// 50-game click isn't flooded.
function topRanked(
  candidates: RankedEvent[],
  limit: number,
): { event: DescribedEvent; teamIds: string[] }[] {
  return [...candidates]
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map((c) => ({ event: c.event, teamIds: c.teamIds }));
}

export type SimulateTarget = "NEXT_GAME" | "NEXT_10_GAMES";

const TARGET_USER_GAMES: Record<SimulateTarget, number> = {
  NEXT_GAME: 1,
  NEXT_10_GAMES: 10,
};

// Simulating an entire ~82-game season in one request risks a serverless
// function timeout (1,230 games league-wide, each needing a DB write) - so
// each inner iteration still only ever resolves a bounded chunk, same as
// the old league-wide batch limit. The outer loop just keeps pulling
// chunks (in chronological gameNumber/dayIndex order) until the user's own
// team has completed enough games, rather than stopping after one chunk -
// every other team's games in that window still resolve automatically,
// same simulate/persist/injury-event logic per chunk as before.
const CHUNK_SIZE = 50;

export async function simulateGamesAction(leagueId: string, target: SimulateTarget) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }

  // A PENDING weekend already exists from a prior call - regular-season
  // simulation stays genuinely blocked (not just interrupted once) until
  // resolveAllStarWeekendAction flips it to RESOLVED.
  const existingWeekend = await prisma.allStarWeekend.findUnique({
    where: { leagueId_season: { leagueId, season: league.currentSeason } },
  });
  if (existingWeekend?.status === "PENDING") {
    const remaining = await prisma.game.count({
      where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
    });
    return {
      simulated: 0,
      remaining,
      userGamesCompleted: 0,
      allStarWeekendTriggered: true,
      businessDecisionPending: false,
      myCompletedGames: [],
    };
  }

  // Finances as a Gameplay Pillar (Phase 1) - a BREAKING business decision
  // already sits PENDING in the user's Front Office Inbox from a prior
  // call. Same "must resolve before continuing" shape as the All-Star-
  // weekend gate above; every other severity queues without blocking.
  if (league.userControlledTeamId) {
    const breakingPending = await prisma.businessDecision.findFirst({
      where: {
        leagueId,
        leagueTeamId: league.userControlledTeamId,
        status: "PENDING",
        severity: "BREAKING",
      },
      select: { id: true },
    });
    if (breakingPending) {
      const remaining = await prisma.game.count({
        where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
      });
      return {
        simulated: 0,
        remaining,
        userGamesCompleted: 0,
        allStarWeekendTriggered: false,
        businessDecisionPending: true,
        myCompletedGames: [],
      };
    }
  }

  const targetUserGames = TARGET_USER_GAMES[target];
  let totalSimulated = 0;
  let userGamesCompleted = 0;
  let allStarWeekendTriggered = false;
  let businessDecisionPending = false;
  // Animated schedule-calendar reveal - the user's own team's games,
  // captured in day order as they're resolved below, so the client can
  // reveal them one at a time instead of jumping straight to the final
  // state. Every game is already computed for standings/box-score
  // purposes; this just keeps the user-team subset instead of discarding it.
  const myCompletedGames: {
    dayIndex: number;
    opponentLabel: string;
    opponentLogoUrl: string | null;
    isHome: boolean;
    won: boolean;
    teamScore: number;
    opponentScore: number;
  }[] = [];

  while (userGamesCompleted < targetUserGames) {
    // type filter matters once play-in/playoff games exist for this season -
    // those are always created already-played (see src/lib/actions/playoffs.ts),
    // but this guards against ever picking one up as an "unplayed" regular
    // season game regardless.
    const fetchedGames = await prisma.game.findMany({
      where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
      orderBy: { gameNumber: "asc" },
      take: CHUNK_SIZE,
    });
    if (fetchedGames.length === 0) break; // season's regular-season games are all played

    // A 50-game chunk can easily contain more than one of the user's own
    // games (they're interleaved chronologically with 29 other teams'), so
    // "Sim Next Game" must not simulate past the exact game that satisfies
    // the target - truncate right after it rather than processing the
    // whole fetched chunk regardless of the user's own progress.
    let unplayedGames = fetchedGames;
    if (league.userControlledTeamId) {
      const stillNeeded = targetUserGames - userGamesCompleted;
      let userGamesSeen = 0;
      for (let i = 0; i < fetchedGames.length; i++) {
        const g = fetchedGames[i];
        const isUserGame =
          g.homeLeagueTeamId === league.userControlledTeamId ||
          g.awayLeagueTeamId === league.userControlledTeamId;
        if (isUserGame) userGamesSeen += 1;
        if (userGamesSeen === stillNeeded) {
          unplayedGames = fetchedGames.slice(0, i + 1);
          break;
        }
      }
    }

    const teamIds = new Set<string>();
    for (const game of unplayedGames) {
      teamIds.add(game.homeLeagueTeamId);
      teamIds.add(game.awayLeagueTeamId);
    }

    const [{ strengthByTeam, rostersByTeam }, teamInfo, headCoaches] = await Promise.all([
      computeLeagueTeamStrengths([...teamIds]),
      prisma.leagueTeam.findMany({
        where: { id: { in: [...teamIds] } },
        select: {
          id: true,
          currentStreak: true,
          fanHappiness: true,
          // Finances as a Gameplay Pillar (Phase 4) - Coaching Support.
          coachingSupportLevel: true,
          // Fans Page Redesign (Phase 3).
          fanCulture: { select: { patience: true, loyalty: true } },
          team: { select: { city: true, name: true, logoUrl: true } },
        },
      }),
      // Head Coach effects (Phase 15a) - a team with no coach hired yet
      // behaves exactly as it did before this phase existed (see
      // computeCoachWinBonus/computeCoachBoxScoreModifier's null handling).
      prisma.staff.findMany({
        where: { leagueId, leagueTeamId: { in: [...teamIds] }, role: "HEAD_COACH" },
        select: { leagueTeamId: true, quality: true, style: true },
      }),
    ]);

    const teamLabelById = new Map(teamInfo.map((t) => [t.id, `${t.team.city} ${t.team.name}`]));
    const teamLogoById = new Map(teamInfo.map((t) => [t.id, t.team.logoUrl]));
    // Finances as a Gameplay Pillar (Phase 4) - Coaching Support.
    const coachingSupportByTeam = new Map(teamInfo.map((t) => [t.id, t.coachingSupportLevel]));
    const streakByTeam = new Map(teamInfo.map((t) => [t.id, t.currentStreak]));
    // Fan Engagement Deepening (Phase 1) - accumulated across the whole
    // batch and flushed once alongside the other per-team updates below,
    // the same pattern winIncrements/lossIncrements/streakByTeam already use.
    const fanHappinessByTeam = new Map(teamInfo.map((t) => [t.id, t.fanHappiness]));
    // Fans Page Redesign (Phase 3).
    const fanCultureByTeam = new Map(teamInfo.map((t) => [t.id, t.fanCulture]));
    const fanHappinessDeltaByTeam = new Map<string, number>();
    const streakSentimentRows: SentimentRecord[] = [];
    function addFanHappinessDelta(teamId: string, delta: number) {
      if (delta === 0) return;
      fanHappinessDeltaByTeam.set(teamId, (fanHappinessDeltaByTeam.get(teamId) ?? 0) + delta);
    }
    const headCoachByTeam = new Map(headCoaches.map((c) => [c.leagueTeamId as string, c]));
    const playerNameById = new Map<string, string>();
    for (const roster of rostersByTeam.values()) {
      for (const p of roster) playerNameById.set(p.leaguePlayerId, p.fullName);
    }

    const winIncrements = new Map<string, number>();
    const lossIncrements = new Map<string, number>();
    const gameUpdates: { id: string; homeScore: number; awayScore: number }[] = [];
    const boxScoreRows: (PlayerBoxScoreLine & { gameId: string })[] = [];
    const newsRows: {
      type: string;
      description: string;
      importance: NewsImportance;
      teamIds: string[];
    }[] = [];
    const gameResultCandidates: RankedEvent[] = [];
    const milestoneCandidates: RankedEvent[] = [];

    for (const game of unplayedGames) {
      const homeStrength = strengthByTeam.get(game.homeLeagueTeamId) ?? 0;
      const awayStrength = strengthByTeam.get(game.awayLeagueTeamId) ?? 0;
      const homeCoach = headCoachByTeam.get(game.homeLeagueTeamId) ?? null;
      const awayCoach = headCoachByTeam.get(game.awayLeagueTeamId) ?? null;
      // Finances as a Gameplay Pillar (Phase 4) - Coaching Support amplifies
      // whichever Head Coach a team has already hired; a team with no coach
      // stays exactly at "no effect," same as effectiveStaffQuality's null
      // handling.
      const homeCoachQuality = effectiveStaffQuality(
        homeCoach?.quality ?? null,
        coachingSupportByTeam.get(game.homeLeagueTeamId) ?? "STANDARD",
      );
      const awayCoachQuality = effectiveStaffQuality(
        awayCoach?.quality ?? null,
        coachingSupportByTeam.get(game.awayLeagueTeamId) ?? "STANDARD",
      );
      const result = simulateGame(
        homeStrength,
        awayStrength,
        Math.random,
        computeCoachWinBonus(homeCoachQuality),
        computeCoachWinBonus(awayCoachQuality),
      );

      gameUpdates.push({ id: game.id, homeScore: result.homeScore, awayScore: result.awayScore });

      if (
        league.userControlledTeamId &&
        (game.homeLeagueTeamId === league.userControlledTeamId ||
          game.awayLeagueTeamId === league.userControlledTeamId) &&
        game.dayIndex !== null
      ) {
        const isHome = game.homeLeagueTeamId === league.userControlledTeamId;
        const opponentId = isHome ? game.awayLeagueTeamId : game.homeLeagueTeamId;
        myCompletedGames.push({
          dayIndex: game.dayIndex,
          opponentLabel: teamLabelById.get(opponentId) ?? "Opponent",
          opponentLogoUrl: teamLogoById.get(opponentId) ?? null,
          isHome,
          won: isHome ? result.homeWon : !result.homeWon,
          teamScore: isHome ? result.homeScore : result.awayScore,
          opponentScore: isHome ? result.awayScore : result.homeScore,
        });
      }

      const winnerId = result.homeWon ? game.homeLeagueTeamId : game.awayLeagueTeamId;
      const loserId = result.homeWon ? game.awayLeagueTeamId : game.homeLeagueTeamId;
      winIncrements.set(winnerId, (winIncrements.get(winnerId) ?? 0) + 1);
      lossIncrements.set(loserId, (lossIncrements.get(loserId) ?? 0) + 1);

      // Real, box-score/standings-driven news (Phase 14d) - generated from
      // this exact game's actual outcome, not invented. Streaks are tracked
      // per game within the batch (not just the batch's final total) so a
      // team blowing past 10 straight to 15 without stopping still gets both
      // threshold stories, not just the last one.
      const winnerPrevStreak = streakByTeam.get(winnerId) ?? 0;
      const winnerNewStreak = winnerPrevStreak > 0 ? winnerPrevStreak + 1 : 1;
      streakByTeam.set(winnerId, winnerNewStreak);
      const loserPrevStreak = streakByTeam.get(loserId) ?? 0;
      const loserNewStreak = loserPrevStreak < 0 ? loserPrevStreak - 1 : -1;
      streakByTeam.set(loserId, loserNewStreak);

      const winnerLabel = teamLabelById.get(winnerId) ?? "Team";
      const loserLabel = teamLabelById.get(loserId) ?? "Team";

      const winnerStreakEvent = describeWinStreak(winnerLabel, winnerNewStreak);
      if (winnerStreakEvent) {
        newsRows.push({ type: "WIN_STREAK", ...winnerStreakEvent, teamIds: [winnerId] });
        const rawWinnerDelta = computeStreakSentimentDelta(winnerStreakEvent.importance, 1);
        // Fans Page Redesign (Phase 3).
        const streakDelta = applyScaledFanHappinessDelta(
          fanHappinessByTeam.get(winnerId) ?? 65,
          rawWinnerDelta,
          fanCultureByTeam.get(winnerId) ?? null,
        ).scaledDelta;
        addFanHappinessDelta(winnerId, streakDelta);
        // Fans Page Redesign (Phase 1) - a real dayIndex here is what lets
        // the page draw an in-season sentiment trend, which the once-a-season
        // FanHappinessSnapshot never could.
        streakSentimentRows.push({
          leagueId,
          leagueTeamId: winnerId,
          season: league.currentSeason,
          dayIndex: game.dayIndex ?? 0,
          kind: "WIN_STREAK",
          delta: streakDelta,
          description: describeStreakSentiment(Math.abs(winnerNewStreak), true),
        });
      }
      const loserStreakEvent = describeWinStreak(loserLabel, loserNewStreak);
      if (loserStreakEvent) {
        newsRows.push({ type: "WIN_STREAK", ...loserStreakEvent, teamIds: [loserId] });
        const rawLoserDelta = computeStreakSentimentDelta(loserStreakEvent.importance, -1);
        // Fans Page Redesign (Phase 3).
        const streakDelta = applyScaledFanHappinessDelta(
          fanHappinessByTeam.get(loserId) ?? 65,
          rawLoserDelta,
          fanCultureByTeam.get(loserId) ?? null,
        ).scaledDelta;
        addFanHappinessDelta(loserId, streakDelta);
        streakSentimentRows.push({
          leagueId,
          leagueTeamId: loserId,
          season: league.currentSeason,
          dayIndex: game.dayIndex ?? 0,
          kind: "LOSS_STREAK",
          delta: streakDelta,
          description: describeStreakSentiment(Math.abs(loserNewStreak), false),
        });
      }

      const margin = Math.abs(result.homeScore - result.awayScore);
      const winnerWinProbability = result.homeWon
        ? result.homeWinProbability
        : 1 - result.homeWinProbability;
      const gameResultEvent = describeGameResult(
        winnerLabel,
        loserLabel,
        winnerWinProbability,
        margin,
      );
      if (gameResultEvent) {
        // Rank by how extreme the result was (a bigger upset or a bigger
        // margin), not just that it cleared the threshold at all - only the
        // most extreme few per batch actually get reported.
        gameResultCandidates.push({
          event: gameResultEvent,
          teamIds: [winnerId, loserId],
          rank: (1 - winnerWinProbability) * 100 + margin,
        });
      }

      // Uses the same pre-batch roster/strength snapshot applyLeagueEvents
      // already treats as locked for the whole batch - a mid-batch injury
      // must not affect this game's box score any more than it affects this
      // batch's win probabilities, which it already doesn't.
      const lines = generateBoxScore(
        {
          homeTeamId: game.homeLeagueTeamId,
          awayTeamId: game.awayLeagueTeamId,
          homeRoster: rostersByTeam.get(game.homeLeagueTeamId) ?? [],
          awayRoster: rostersByTeam.get(game.awayLeagueTeamId) ?? [],
          homeStrength,
          awayStrength,
          homeCoachModifier: computeCoachBoxScoreModifier(
            homeCoachQuality,
            homeCoach?.style ?? null,
          ),
          awayCoachModifier: computeCoachBoxScoreModifier(
            awayCoachQuality,
            awayCoach?.style ?? null,
          ),
        },
        result.homeScore,
        result.awayScore,
      );
      for (const line of lines) {
        boxScoreRows.push({ ...line, gameId: game.id });

        const milestoneEvent = describeMilestoneGame({
          playerName: playerNameById.get(line.leaguePlayerId) ?? "A player",
          teamLabel: teamLabelById.get(line.leagueTeamId) ?? "their team",
          points: line.points,
          rebounds: line.rebounds,
          assists: line.assists,
          steals: line.steals,
          blocks: line.blocks,
        });
        if (milestoneEvent) {
          milestoneCandidates.push({
            event: milestoneEvent,
            teamIds: [line.leagueTeamId],
            rank: line.points,
          });
        }
      }
    }

    // Cap both categories to the batch's most notable handful (see
    // topRanked) - scales with batch size so a single-game click isn't
    // starved and a 50-game click isn't flooded with every game that
    // technically cleared a threshold.
    for (const { event, teamIds } of topRanked(
      gameResultCandidates,
      Math.max(1, Math.ceil(unplayedGames.length / 20)),
    )) {
      newsRows.push({ type: "GAME_RESULT", ...event, teamIds });
    }
    for (const { event, teamIds } of topRanked(
      milestoneCandidates,
      Math.max(2, Math.ceil(unplayedGames.length / 10)),
    )) {
      newsRows.push({ type: "GAME_MILESTONE", ...event, teamIds });
    }

    // Each game/team update is independent of the others (this batch doesn't
    // need all-or-nothing atomicity the way a trade or signing does), so
    // these run concurrently via the connection pool rather than as one
    // strictly sequential Postgres transaction - a batch of 50 sequential
    // round trips to a remote DB risked a serverless timeout in production
    // even though it looked fine when tested locally on a lower-latency
    // connection. See docs/SYSTEMS.md.
    const gameTypeById = new Map(unplayedGames.map((g) => [g.id, g.type]));
    const playedAt = new Date();
    await Promise.all([
      ...gameUpdates.map((update) =>
        prisma.game.update({
          where: { id: update.id },
          data: { homeScore: update.homeScore, awayScore: update.awayScore, playedAt },
        }),
      ),
      ...[...winIncrements.entries()].map(([teamId, wins]) =>
        prisma.leagueTeam.update({ where: { id: teamId }, data: { wins: { increment: wins } } }),
      ),
      ...[...lossIncrements.entries()].map(([teamId, losses]) =>
        prisma.leagueTeam.update({
          where: { id: teamId },
          data: { losses: { increment: losses } },
        }),
      ),
      ...[...streakByTeam.entries()].map(([teamId, currentStreak]) =>
        prisma.leagueTeam.update({ where: { id: teamId }, data: { currentStreak } }),
      ),
      // Fan Engagement Deepening (Phase 1) - one update per affected team,
      // folded into this same batch flush rather than a separate query.
      ...[...fanHappinessDeltaByTeam.entries()].map(([teamId, delta]) =>
        prisma.leagueTeam.update({
          where: { id: teamId },
          data: {
            fanHappiness: applyFanHappinessDelta(fanHappinessByTeam.get(teamId) ?? 65, delta),
          },
        }),
      ),
      // Fans Page Redesign (Phase 1) - the streak deltas above, recorded with
      // the day they happened.
      ...fanSentimentCreateOps(streakSentimentRows),
      prisma.playerGameStat.createMany({
        data: boxScoreRows.map((row) => ({
          ...row,
          leagueId,
          season: league.currentSeason,
          gameType: gameTypeById.get(row.gameId) ?? "REGULAR_SEASON",
        })),
      }),
      newsRows.length > 0
        ? prisma.leagueTransaction.createMany({
            data: newsRows.map((row) => ({
              leagueId,
              season: league.currentSeason,
              type: row.type as "GAME_MILESTONE" | "WIN_STREAK" | "GAME_RESULT",
              description: row.description,
              importance: row.importance,
              teamIds: row.teamIds,
            })),
          })
        : Promise.resolve(),
    ]);

    await applyLeagueEvents(
      leagueId,
      league.currentSeason,
      league.userControlledTeamId,
      unplayedGames.map((g) => ({
        homeLeagueTeamId: g.homeLeagueTeamId,
        awayLeagueTeamId: g.awayLeagueTeamId,
      })),
    );

    // Player Morale & Personality System - runs after applyLeagueEvents so
    // this batch's box scores and any CPU trades are already reflected.
    await applyPlayerMoraleEvents(leagueId, league.currentSeason);

    // Finances as a Gameplay Pillar (Phase 1) - rolls/expires this batch's
    // business decisions. lastDayIndex anchors both the new deadline and
    // the expiry check to this batch's actual place in the season.
    const businessDecisionResult = league.userControlledTeamId
      ? await applyBusinessDecisionEvents(
          leagueId,
          league.currentSeason,
          league.userControlledTeamId,
          unplayedGames[unplayedGames.length - 1]?.dayIndex ?? 0,
          unplayedGames.length,
        )
      : { breakingDecisionPending: false };

    totalSimulated += unplayedGames.length;
    if (league.userControlledTeamId) {
      userGamesCompleted += unplayedGames.filter(
        (g) =>
          g.homeLeagueTeamId === league.userControlledTeamId ||
          g.awayLeagueTeamId === league.userControlledTeamId,
      ).length;
    } else {
      // No user-controlled team - shouldn't normally happen post-team-
      // selection, but stop after one chunk rather than looping forever.
      break;
    }

    // Mid-season checkpoint: the season does not roll past the All-Star break
    // until the weekend is resolved. Games played is read fresh from the DB
    // rather than from the increments above, since it has to be the team's
    // true cumulative total and not just this batch's delta.
    //
    // Note the decision keys off the weekend's *status*, not its existence -
    // see `decideAllStarBreak`. A RESOLVED weekend is history, and stopping on
    // it capped every request in the back half of the season at one chunk.
    const userTeam = await prisma.leagueTeam.findUnique({
      where: { id: league.userControlledTeamId },
      select: { wins: true, losses: true },
    });
    const weekend = await prisma.allStarWeekend.findUnique({
      where: { leagueId_season: { leagueId, season: league.currentSeason } },
      select: { status: true },
    });
    const breakDecision = decideAllStarBreak({
      userGamesPlayed: (userTeam?.wins ?? 0) + (userTeam?.losses ?? 0),
      weekendState: weekend?.status ?? null,
    });
    if (breakDecision === "generate-and-pause") {
      const lastDayIndex = unplayedGames[unplayedGames.length - 1]?.dayIndex ?? null;
      await generateAllStarWeekend(leagueId, league.currentSeason, lastDayIndex);
      allStarWeekendTriggered = true;
      break;
    }
    if (breakDecision === "pause") {
      allStarWeekendTriggered = true;
      break;
    }

    // Finances as a Gameplay Pillar (Phase 1) - a BREAKING decision just
    // landed in the inbox. Stop before pulling the next chunk so the user
    // sees and resolves it rather than the season quietly rolling past it;
    // the All-Star checkpoint above still takes priority if both land in
    // the same batch.
    if (businessDecisionResult.breakingDecisionPending) {
      businessDecisionPending = true;
      break;
    }
  }

  const remaining = await prisma.game.count({
    where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
  });

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/transactions`);
  revalidatePath(`/leagues/${leagueId}/free-agents`);
  if (allStarWeekendTriggered) revalidatePath(`/leagues/${leagueId}/all-star`);
  revalidatePath(`/leagues/${leagueId}/finances`);

  return {
    simulated: totalSimulated,
    remaining,
    userGamesCompleted,
    allStarWeekendTriggered,
    businessDecisionPending,
    myCompletedGames,
  };
}
