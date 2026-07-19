"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeLeagueTeamStrengths } from "@/lib/actions/leagueTeamStrength";
import {
  pickHigherSeed,
  seedConference,
  type StandingsEntry,
} from "@/lib/simulation/playoffSeeding";
import { simulatePlayIn } from "@/lib/simulation/playInTournament";
import { simulateSeriesToCompletion } from "@/lib/simulation/simulateSeries";

type ConferenceName = "EAST" | "WEST";

async function requireOwnedLeague(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
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
  const strengthByTeam = await computeLeagueTeamStrengths(playInTeamIds);

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
 * Simulates every remaining series in the current (lowest undecided) round
 * to completion, then advances the bracket: creates the next round's series
 * from this round's winners, or - at round 4 - crowns the champion.
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
  const roundSeries = undecided.filter((s) => s.round === activeRound);

  const teamIds = [...new Set(roundSeries.flatMap((s) => [s.higherSeedTeamId, s.lowerSeedTeamId]))];
  const strengthByTeam = await computeLeagueTeamStrengths(teamIds);

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

  if (activeRound < 4) {
    // Need each winner's regular-season record to decide home-court in the
    // next round (better record hosts, same rule the real playoffs use).
    const winnerStandings = new Map<string, StandingsEntry>(
      league.teams.map((lt) => [lt.id, { leagueTeamId: lt.id, wins: lt.wins, losses: lt.losses }]),
    );
    const winnerOf = (seriesId: string) =>
      seriesResults.find((r) => r.seriesId === seriesId)!.winnerTeamId;

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
          const winnerA = winnerOf(bySlot[i].id);
          const winnerB = winnerOf(bySlot[i + 1].id);
          const higher = pickHigherSeed(
            winnerStandings.get(winnerA)!,
            winnerStandings.get(winnerB)!,
          );
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
      const [eastFinal, westFinal] = roundSeries;
      const eastChamp = winnerOf(eastFinal.id);
      const westChamp = winnerOf(westFinal.id);
      const higher = pickHigherSeed(
        winnerStandings.get(eastChamp)!,
        winnerStandings.get(westChamp)!,
      );
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
  }

  revalidatePath(`/leagues/${leagueId}/playoffs`);

  const champion =
    activeRound === 4
      ? seriesResults.find((r) => r.seriesId === roundSeries[0].id)?.winnerTeamId
      : null;

  return { roundCompleted: activeRound, champion: champion ?? null, seriesResults };
}
