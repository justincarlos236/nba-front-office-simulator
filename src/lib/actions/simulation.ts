"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeLeagueTeamStrengths } from "@/lib/actions/leagueTeamStrength";
import { applyLeagueEvents } from "@/lib/actions/leagueEvents";
import { simulateGame } from "@/lib/simulation/simulateGame";
import { generateBoxScore, type PlayerBoxScoreLine } from "@/lib/simulation/boxScore";
import {
  describeGameResult,
  describeMilestoneGame,
  describeWinStreak,
  type DescribedEvent,
} from "@/lib/transactions/describeGameEvents";
import { computeCoachBoxScoreModifier, computeCoachWinBonus } from "@/lib/staff/coachModifiers";
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

  const targetUserGames = TARGET_USER_GAMES[target];
  let totalSimulated = 0;
  let userGamesCompleted = 0;

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
        select: { id: true, currentStreak: true, team: { select: { city: true, name: true } } },
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
    const streakByTeam = new Map(teamInfo.map((t) => [t.id, t.currentStreak]));
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
      const result = simulateGame(
        homeStrength,
        awayStrength,
        Math.random,
        computeCoachWinBonus(homeCoach?.quality ?? null),
        computeCoachWinBonus(awayCoach?.quality ?? null),
      );

      gameUpdates.push({ id: game.id, homeScore: result.homeScore, awayScore: result.awayScore });

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
      }
      const loserStreakEvent = describeWinStreak(loserLabel, loserNewStreak);
      if (loserStreakEvent) {
        newsRows.push({ type: "WIN_STREAK", ...loserStreakEvent, teamIds: [loserId] });
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
            homeCoach?.quality ?? null,
            homeCoach?.style ?? null,
          ),
          awayCoachModifier: computeCoachBoxScoreModifier(
            awayCoach?.quality ?? null,
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
    // connection. See docs/ARCHITECTURE.md.
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
  }

  const remaining = await prisma.game.count({
    where: { leagueId, season: league.currentSeason, type: "REGULAR_SEASON", playedAt: null },
  });

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/transactions`);
  revalidatePath(`/leagues/${leagueId}/free-agents`);

  return { simulated: totalSimulated, remaining, userGamesCompleted };
}
