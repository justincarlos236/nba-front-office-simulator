"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { computeLeagueTeamStrengths } from "@/lib/actions/leagueTeamStrength";
import {
  pickHigherSeed,
  seedConference,
  type StandingsEntry,
} from "@/lib/simulation/playoffSeeding";
import { simulatePlayIn } from "@/lib/simulation/playInTournament";
import {
  isHigherSeedHomeGame,
  simulateSeriesToCompletion,
  type SeriesState,
} from "@/lib/simulation/simulateSeries";
import {
  simulateLiveGame,
  allocatePlayerStatsAcrossPeriods,
} from "@/lib/simulation/simulateLiveGame";
import { computeHomeWinProbability } from "@/lib/simulation/simulateGame";
import { generateBoxScore, type PlayerBoxScoreLine } from "@/lib/simulation/boxScore";
import { computeCoachBoxScoreModifier, computeCoachWinBonus } from "@/lib/staff/coachModifiers";
import { describeGameResult, describeMilestoneGame } from "@/lib/transactions/describeGameEvents";
import { Prisma } from "@/generated/prisma/client";
import { requireSessionUserId, assertLeagueOwned } from "@/lib/auth/requireOwnedLeague";

type ConferenceName = "EAST" | "WEST";

const PLAYOFFS_LEAGUE_INCLUDE = { teams: { include: { team: true } } } as const;

export type PlayoffsLeague = Prisma.LeagueGetPayload<{ include: typeof PLAYOFFS_LEAGUE_INCLUDE }>;

async function requireOwnedLeague(leagueId: string): Promise<PlayoffsLeague> {
  const userId = await requireSessionUserId();

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: PLAYOFFS_LEAGUE_INCLUDE,
  });
  assertLeagueOwned(league, userId);
  return league;
}

// Real NBA fixed single-elimination bracket (not reseeded each round):
// round-1 slot 0 = seed 1 vs 8, slot 1 = seed 4 vs 5, slot 2 = seed 2 vs 7,
// slot 3 = seed 3 vs 6. Slots 0 & 1 feed round-2 slot 0; slots 2 & 3 feed
// round-2 slot 1 - so the "1/8 or 4/5 survivor" always meets the "2/7 or
// 3/6 survivor" in the conference finals, exactly like the real playoffs.
const ROUND_1_MATCHUPS: [number, number][] = [
  [0, 7],
  [3, 4],
  [1, 6],
  [2, 5],
];

// A plain counter scoped to a single action invocation (not module state,
// which would be shared/racy across concurrent serverless invocations).
async function startingGameNumber(leagueId: string, season: number): Promise<number> {
  const max = await prisma.game.aggregate({
    where: { leagueId, season },
    _max: { gameNumber: true },
  });
  return (max._max.gameNumber ?? 0) + 1;
}

/**
 * Seeds and simulates the play-in tournament, then creates the 8
 * round-1 best-of-7 series (4 per conference) from the results. Requires
 * the regular season to be fully played and playoffs not already started
 * for this season - both enforced server-side, not just hidden in the UI.
 */
export async function startPlayoffsAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;

  const [unplayedRegularSeasonGames, existingSeries] = await Promise.all([
    prisma.game.count({
      where: { leagueId, season, type: "REGULAR_SEASON", playedAt: null },
    }),
    prisma.playoffSeries.findFirst({ where: { leagueId, season } }),
  ]);
  if (unplayedRegularSeasonGames > 0) {
    throw new Error("Finish the regular season before starting the playoffs.");
  }
  if (existingSeries) {
    throw new Error("Playoffs have already started for this season.");
  }

  const standingsByConference: Record<ConferenceName, StandingsEntry[]> = { EAST: [], WEST: [] };
  for (const lt of league.teams) {
    standingsByConference[lt.team.conference].push({
      leagueTeamId: lt.id,
      wins: lt.wins,
      losses: lt.losses,
    });
  }

  const eastSeeding = seedConference(standingsByConference.EAST);
  const westSeeding = seedConference(standingsByConference.WEST);

  const playInTeamIds = [...eastSeeding.playInTeams, ...westSeeding.playInTeams];
  // Play-in/playoff games don't generate player box scores yet - see
  // docs/SYSTEMS.md's "Player box scores" section for why this is a
  // deliberate, scoped boundary rather than an oversight.
  const { strengthByTeam } = await computeLeagueTeamStrengths(playInTeamIds);

  const eastPlayIn = simulatePlayIn(
    {
      seven: eastSeeding.playInTeams[0],
      eight: eastSeeding.playInTeams[1],
      nine: eastSeeding.playInTeams[2],
      ten: eastSeeding.playInTeams[3],
    },
    strengthByTeam,
  );
  const westPlayIn = simulatePlayIn(
    {
      seven: westSeeding.playInTeams[0],
      eight: westSeeding.playInTeams[1],
      nine: westSeeding.playInTeams[2],
      ten: westSeeding.playInTeams[3],
    },
    strengthByTeam,
  );

  const playInGameRows = [...eastPlayIn.games, ...westPlayIn.games];
  const playedAt = new Date();
  let gameNumber = await startingGameNumber(leagueId, season);
  await prisma.game.createMany({
    data: playInGameRows.map((g) => ({
      leagueId,
      season,
      gameNumber: gameNumber++,
      type: "PLAY_IN" as const,
      homeLeagueTeamId: g.homeTeamId,
      awayLeagueTeamId: g.awayTeamId,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      playedAt,
    })),
  });

  const conferenceSeriesInputs = (
    conference: ConferenceName,
    seeding: ReturnType<typeof seedConference>,
    playIn: ReturnType<typeof simulatePlayIn>,
  ) => {
    const seeds = [...seeding.directQualifiers, playIn.finalSeventhSeed, playIn.finalEighthSeed];
    return ROUND_1_MATCHUPS.map(([higherIdx, lowerIdx], bracketSlot) => ({
      leagueId,
      season,
      round: 1,
      bracketSlot,
      conference,
      higherSeedTeamId: seeds[higherIdx],
      lowerSeedTeamId: seeds[lowerIdx],
      winsNeeded: 4,
    }));
  };

  await prisma.playoffSeries.createMany({
    data: [
      ...conferenceSeriesInputs("EAST", eastSeeding, eastPlayIn),
      ...conferenceSeriesInputs("WEST", westSeeding, westPlayIn),
    ],
  });

  revalidatePath(`/leagues/${leagueId}/playoffs`);
  revalidatePath(`/leagues/${leagueId}/standings`);

  return { started: true };
}

/**
 * Re-checks every series in `activeRound` fresh from the DB and, only once
 * every one of them has a winner, advances the bracket: creates the next
 * round's series from this round's winners, or - at round 4 - crowns the
 * champion. A no-op (returns `{ champion: null }`) if any series in the
 * round - including the user's own, which `simulateRoundAction` may have
 * deliberately left pending - is still undecided. Callable after resolving
 * either just one series (the user's own live game) or a whole batch (the
 * bulk round action), so the bracket advances correctly regardless of which
 * path finished the round.
 */
async function advanceRoundIfComplete(
  leagueId: string,
  season: number,
  league: { teams: { id: string; wins: number; losses: number }[] },
  activeRound: number,
): Promise<{ champion: string | null }> {
  const roundSeries = await prisma.playoffSeries.findMany({
    where: { leagueId, season, round: activeRound },
  });
  if (roundSeries.length === 0 || roundSeries.some((s) => !s.winnerTeamId)) {
    return { champion: null };
  }

  if (activeRound === 4) {
    return { champion: roundSeries[0].winnerTeamId };
  }

  // Need each winner's regular-season record to decide home-court in the
  // next round (better record hosts, same rule the real playoffs use).
  const winnerStandings = new Map<string, StandingsEntry>(
    league.teams.map((lt) => [lt.id, { leagueTeamId: lt.id, wins: lt.wins, losses: lt.losses }]),
  );

  if (activeRound < 3) {
    // Round 1 -> 2, or round 2 -> 3: pair within each conference by
    // bracket slot (slot 2N & 2N+1 feed next round's slot N).
    const byConference = new Map<ConferenceName, typeof roundSeries>();
    for (const s of roundSeries) {
      const list = byConference.get(s.conference as ConferenceName) ?? [];
      list.push(s);
      byConference.set(s.conference as ConferenceName, list);
    }

    const nextRoundInputs: {
      leagueId: string;
      season: number;
      round: number;
      bracketSlot: number;
      conference: ConferenceName;
      higherSeedTeamId: string;
      lowerSeedTeamId: string;
      winsNeeded: number;
    }[] = [];

    for (const [conference, series] of byConference) {
      const bySlot = [...series].sort((a, b) => a.bracketSlot - b.bracketSlot);
      for (let i = 0; i + 1 < bySlot.length; i += 2) {
        const winnerA = bySlot[i].winnerTeamId!;
        const winnerB = bySlot[i + 1].winnerTeamId!;
        const higher = pickHigherSeed(winnerStandings.get(winnerA)!, winnerStandings.get(winnerB)!);
        const lower = higher.leagueTeamId === winnerA ? winnerB : winnerA;
        nextRoundInputs.push({
          leagueId,
          season,
          round: activeRound + 1,
          bracketSlot: i / 2,
          conference,
          higherSeedTeamId: higher.leagueTeamId,
          lowerSeedTeamId: lower,
          winsNeeded: 4,
        });
      }
    }

    await prisma.playoffSeries.createMany({ data: nextRoundInputs });
  } else {
    // Round 3 (conference finals) -> round 4 (NBA Finals): cross-conference,
    // home-court by better regular-season record rather than conference.
    const eastFinal = roundSeries.find((s) => s.conference === "EAST")!;
    const westFinal = roundSeries.find((s) => s.conference === "WEST")!;
    const eastChamp = eastFinal.winnerTeamId!;
    const westChamp = westFinal.winnerTeamId!;
    const higher = pickHigherSeed(winnerStandings.get(eastChamp)!, winnerStandings.get(westChamp)!);
    const lower = higher.leagueTeamId === eastChamp ? westChamp : eastChamp;

    await prisma.playoffSeries.create({
      data: {
        leagueId,
        season,
        round: 4,
        bracketSlot: 0,
        conference: null,
        higherSeedTeamId: higher.leagueTeamId,
        lowerSeedTeamId: lower,
        winsNeeded: 4,
      },
    });
  }

  return { champion: null };
}

/**
 * Simulates every remaining series in the current (lowest undecided) round
 * to completion, then advances the bracket: creates the next round's series
 * from this round's winners, or - at round 4 - crowns the champion. The
 * user's own series in that round, if still undecided, is deliberately left
 * untouched - it plays out one game at a time via `playLiveSeriesGameAction`
 * instead, and this action won't advance the bracket past that round until
 * it's decided (see `advanceRoundIfComplete`).
 */
export async function simulateRoundAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;

  const allSeries = await prisma.playoffSeries.findMany({ where: { leagueId, season } });
  if (allSeries.length === 0) {
    throw new Error("Playoffs haven't started yet for this season.");
  }

  const undecided = allSeries.filter((s) => !s.winnerTeamId);
  if (undecided.length === 0) {
    const finals = allSeries.find((s) => s.round === 4);
    return { roundCompleted: 4, champion: finals?.winnerTeamId ?? null, seriesResults: [] };
  }

  const activeRound = Math.min(...undecided.map((s) => s.round));
  const roundSeriesAll = undecided.filter((s) => s.round === activeRound);

  const userTeamId = league.userControlledTeamId;
  const userSeriesInRound = userTeamId
    ? roundSeriesAll.find(
        (s) => s.higherSeedTeamId === userTeamId || s.lowerSeedTeamId === userTeamId,
      )
    : undefined;
  // Every other series in the round still resolves in bulk exactly as
  // before; the user's own game-by-game series (if any) is skipped here.
  const roundSeries = userSeriesInRound
    ? roundSeriesAll.filter((s) => s.id !== userSeriesInRound.id)
    : roundSeriesAll;

  if (roundSeries.length === 0) {
    return {
      roundCompleted: activeRound,
      champion: null,
      seriesResults: [],
      pendingUserSeries: true,
    };
  }

  const teamIds = [...new Set(roundSeries.flatMap((s) => [s.higherSeedTeamId, s.lowerSeedTeamId]))];
  const { strengthByTeam } = await computeLeagueTeamStrengths(teamIds);

  const playedAt = new Date();
  const gameRows: {
    leagueId: string;
    season: number;
    gameNumber: number;
    type: "PLAYOFF";
    seriesId: string;
    homeLeagueTeamId: string;
    awayLeagueTeamId: string;
    homeScore: number;
    awayScore: number;
    playedAt: Date;
  }[] = [];
  const seriesUpdates: {
    id: string;
    higherSeedWins: number;
    lowerSeedWins: number;
    winnerTeamId: string;
  }[] = [];
  const seriesResults: {
    seriesId: string;
    winnerTeamId: string;
    higherSeedWins: number;
    lowerSeedWins: number;
  }[] = [];

  let gameNumber = await startingGameNumber(leagueId, season);
  for (const series of roundSeries) {
    const higherStrength = strengthByTeam.get(series.higherSeedTeamId) ?? 0;
    const lowerStrength = strengthByTeam.get(series.lowerSeedTeamId) ?? 0;
    const result = simulateSeriesToCompletion(higherStrength, lowerStrength, series.winsNeeded, {
      higherSeedWins: series.higherSeedWins,
      lowerSeedWins: series.lowerSeedWins,
    });
    const winnerTeamId = result.winnerIsHigherSeed
      ? series.higherSeedTeamId
      : series.lowerSeedTeamId;

    for (const game of result.games) {
      gameRows.push({
        leagueId,
        season,
        gameNumber: gameNumber++,
        type: "PLAYOFF",
        seriesId: series.id,
        homeLeagueTeamId: game.isHigherSeedHome ? series.higherSeedTeamId : series.lowerSeedTeamId,
        awayLeagueTeamId: game.isHigherSeedHome ? series.lowerSeedTeamId : series.higherSeedTeamId,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        playedAt,
      });
    }
    seriesUpdates.push({
      id: series.id,
      higherSeedWins: result.finalState.higherSeedWins,
      lowerSeedWins: result.finalState.lowerSeedWins,
      winnerTeamId,
    });
    seriesResults.push({
      seriesId: series.id,
      winnerTeamId,
      higherSeedWins: result.finalState.higherSeedWins,
      lowerSeedWins: result.finalState.lowerSeedWins,
    });
  }

  await Promise.all([
    prisma.game.createMany({ data: gameRows }),
    ...seriesUpdates.map((update) =>
      prisma.playoffSeries.update({
        where: { id: update.id },
        data: {
          higherSeedWins: update.higherSeedWins,
          lowerSeedWins: update.lowerSeedWins,
          winnerTeamId: update.winnerTeamId,
        },
      }),
    ),
  ]);

  const { champion } = await advanceRoundIfComplete(leagueId, season, league, activeRound);

  revalidatePath(`/leagues/${leagueId}/playoffs`);

  return {
    roundCompleted: activeRound,
    champion,
    seriesResults,
    pendingUserSeries: Boolean(userSeriesInRound),
  };
}

/**
 * Locates the user's own team's next game in their current, undecided
 * playoff series, simulates it via the independent quarter-by-quarter live
 * engine (`simulateLiveGame`), generates its authoritative box score, and
 * persists the `Game`, `PlayerGameStat`, and updated `PlayoffSeries` rows -
 * exactly one game per call. Returns the full quarter-by-quarter payload for
 * the client's animated reveal. If this game decides the series, the shared
 * round-advancement helper is invoked so the bracket progresses correctly.
 */
export async function playLiveSeriesGameAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId;
  if (!userTeamId) {
    throw new Error("This league has no user-controlled team.");
  }

  const series = await prisma.playoffSeries.findFirst({
    where: {
      leagueId,
      season,
      winnerTeamId: null,
      OR: [{ higherSeedTeamId: userTeamId }, { lowerSeedTeamId: userTeamId }],
    },
  });
  if (!series) {
    throw new Error("Your team has no pending playoff series to play.");
  }

  const gameNumberInSeries = series.higherSeedWins + series.lowerSeedWins + 1;
  const isHigherSeedHome = isHigherSeedHomeGame(gameNumberInSeries);
  const homeTeamId = isHigherSeedHome ? series.higherSeedTeamId : series.lowerSeedTeamId;
  const awayTeamId = isHigherSeedHome ? series.lowerSeedTeamId : series.higherSeedTeamId;

  const [{ strengthByTeam, rostersByTeam }, teamInfo, headCoaches] = await Promise.all([
    computeLeagueTeamStrengths([homeTeamId, awayTeamId]),
    prisma.leagueTeam.findMany({
      where: { id: { in: [homeTeamId, awayTeamId] } },
      select: { id: true, team: { select: { city: true, name: true, logoUrl: true } } },
    }),
    prisma.staff.findMany({
      where: { leagueId, leagueTeamId: { in: [homeTeamId, awayTeamId] }, role: "HEAD_COACH" },
      select: { leagueTeamId: true, quality: true, style: true },
    }),
  ]);

  const homeStrength = strengthByTeam.get(homeTeamId) ?? 0;
  const awayStrength = strengthByTeam.get(awayTeamId) ?? 0;
  const homeCoach = headCoaches.find((c) => c.leagueTeamId === homeTeamId) ?? null;
  const awayCoach = headCoaches.find((c) => c.leagueTeamId === awayTeamId) ?? null;

  const liveGame = simulateLiveGame(
    homeStrength,
    awayStrength,
    computeCoachWinBonus(homeCoach?.quality ?? null),
    computeCoachWinBonus(awayCoach?.quality ?? null),
  );

  const boxScore = generateBoxScore(
    {
      homeTeamId,
      awayTeamId,
      homeRoster: rostersByTeam.get(homeTeamId) ?? [],
      awayRoster: rostersByTeam.get(awayTeamId) ?? [],
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
    liveGame.finalHomeScore,
    liveGame.finalAwayScore,
  );

  const higherSeedWonGame = isHigherSeedHome ? liveGame.homeWon : !liveGame.homeWon;
  const newState: SeriesState = {
    higherSeedWins: series.higherSeedWins + (higherSeedWonGame ? 1 : 0),
    lowerSeedWins: series.lowerSeedWins + (higherSeedWonGame ? 0 : 1),
  };
  const winnerTeamId =
    newState.higherSeedWins >= series.winsNeeded
      ? series.higherSeedTeamId
      : newState.lowerSeedWins >= series.winsNeeded
        ? series.lowerSeedTeamId
        : null;

  const gameNumber = await startingGameNumber(leagueId, season);
  const playedAt = new Date();
  const game = await prisma.game.create({
    data: {
      leagueId,
      season,
      gameNumber,
      type: "PLAYOFF",
      seriesId: series.id,
      homeLeagueTeamId: homeTeamId,
      awayLeagueTeamId: awayTeamId,
      homeScore: liveGame.finalHomeScore,
      awayScore: liveGame.finalAwayScore,
      playedAt,
    },
  });

  const teamLabelById = new Map(teamInfo.map((t) => [t.id, `${t.team.city} ${t.team.name}`]));
  const teamLogoById = new Map(teamInfo.map((t) => [t.id, t.team.logoUrl]));
  const playerNameById = new Map<string, string>();
  for (const roster of rostersByTeam.values()) {
    for (const p of roster) playerNameById.set(p.leaguePlayerId, p.fullName);
  }

  const homeWinProbability = computeHomeWinProbability(
    homeStrength,
    awayStrength,
    computeCoachWinBonus(homeCoach?.quality ?? null),
    computeCoachWinBonus(awayCoach?.quality ?? null),
  );
  const gameResultEvent = describeGameResult(
    teamLabelById.get(liveGame.homeWon ? homeTeamId : awayTeamId) ?? "Team",
    teamLabelById.get(liveGame.homeWon ? awayTeamId : homeTeamId) ?? "Team",
    liveGame.homeWon ? homeWinProbability : 1 - homeWinProbability,
    Math.abs(liveGame.finalHomeScore - liveGame.finalAwayScore),
  );
  const milestoneEvents = boxScore
    .map((line) =>
      describeMilestoneGame({
        playerName: playerNameById.get(line.leaguePlayerId) ?? "A player",
        teamLabel: teamLabelById.get(line.leagueTeamId) ?? "their team",
        points: line.points,
        rebounds: line.rebounds,
        assists: line.assists,
        steals: line.steals,
        blocks: line.blocks,
      }),
    )
    .filter((e): e is NonNullable<typeof e> => e !== null);

  const newsRows = [
    ...(gameResultEvent
      ? [
          {
            ...gameResultEvent,
            type: "GAME_RESULT" as const,
            leagueId,
            season,
            teamIds: [homeTeamId, awayTeamId],
          },
        ]
      : []),
    ...milestoneEvents.map((e) => ({
      ...e,
      type: "GAME_MILESTONE" as const,
      leagueId,
      season,
      teamIds: [homeTeamId, awayTeamId],
    })),
  ];

  await Promise.all([
    prisma.playerGameStat.createMany({
      data: boxScore.map((line: PlayerBoxScoreLine) => ({
        ...line,
        gameId: game.id,
        leagueId,
        season,
        gameType: "PLAYOFF" as const,
      })),
    }),
    prisma.playoffSeries.update({
      where: { id: series.id },
      data: {
        higherSeedWins: newState.higherSeedWins,
        lowerSeedWins: newState.lowerSeedWins,
        winnerTeamId,
      },
    }),
    ...(newsRows.length > 0 ? [prisma.leagueTransaction.createMany({ data: newsRows })] : []),
  ]);

  let champion: string | null = null;
  if (winnerTeamId) {
    ({ champion } = await advanceRoundIfComplete(leagueId, season, league, series.round));
  }

  revalidatePath(`/leagues/${leagueId}/playoffs`);

  return {
    seriesId: series.id,
    homeTeamId,
    awayTeamId,
    homeTeamLabel: teamLabelById.get(homeTeamId) ?? "Home",
    awayTeamLabel: teamLabelById.get(awayTeamId) ?? "Away",
    homeTeamLogoUrl: teamLogoById.get(homeTeamId) ?? null,
    awayTeamLogoUrl: teamLogoById.get(awayTeamId) ?? null,
    quarters: liveGame.quarters,
    overtimes: liveGame.overtimes,
    perPeriodStats: allocatePlayerStatsAcrossPeriods(
      boxScore,
      [...liveGame.quarters, ...liveGame.overtimes],
      homeTeamId,
    ),
    finalHomeScore: liveGame.finalHomeScore,
    finalAwayScore: liveGame.finalAwayScore,
    homeWon: liveGame.homeWon,
    boxScore: boxScore.map((line) => ({
      ...line,
      playerName: playerNameById.get(line.leaguePlayerId) ?? "Unknown",
    })),
    seriesHigherSeedWins: newState.higherSeedWins,
    seriesLowerSeedWins: newState.lowerSeedWins,
    higherSeedTeamId: series.higherSeedTeamId,
    lowerSeedTeamId: series.lowerSeedTeamId,
    seriesWinnerTeamId: winnerTeamId,
    champion,
    news: newsRows.map((n) => ({ description: n.description, importance: n.importance })),
  };
}
