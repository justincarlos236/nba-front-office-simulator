import { prisma } from "@/lib/prisma";
import { estimateExperience } from "@/lib/players/age";
import {
  computeDefensivePlayerOfTheYear,
  computeMVP,
  computeRookieOfTheYear,
  computeSixthManOfTheYear,
  type BenchSeasonSnapshot,
  type DefensiveSeasonSnapshot,
  type PlayerSeasonSnapshot,
} from "@/lib/development/seasonAwards";

export interface AwardRaceEntry {
  leaguePlayerId: string;
  fullName: string;
  photoUrl: string | null;
  teamAbbreviation: string | null;
  teamPrimaryColor: string | null;
  value: number;
}

export interface LiveAwardRace {
  mvp: AwardRaceEntry | null;
  rookieOfTheYear: AwardRaceEntry | null;
  defensivePlayerOfTheYear: AwardRaceEntry | null;
  sixthManOfTheYear: AwardRaceEntry | null;
}

/**
 * "If the season ended today" award standings, computed live from the same
 * functions the real season-end awards use (src/lib/development/seasonAwards.ts)
 * - not a separate approximation. Most Improved Player is deliberately not
 * included here: rating only ever changes at a season transition in this
 * engine (see developPlayerRating), so there is no meaningful "improvement
 * so far this season" signal to race mid-season - it would just be
 * everyone tied at zero until the season actually ends.
 */
export async function getLiveAwardRace(leagueId: string, season: number): Promise<LiveAwardRace> {
  const [rosteredPlayers, boxAgg] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueId, leagueTeamId: { not: null }, isActive: true },
      select: {
        id: true,
        overallRating: true,
        player: { select: { fullName: true, photoUrl: true, draftYear: true } },
        leagueTeam: {
          select: {
            wins: true,
            losses: true,
            team: { select: { abbreviation: true, primaryColor: true } },
          },
        },
      },
    }),
    prisma.playerGameStat.groupBy({
      by: ["leaguePlayerId"],
      where: { leagueId, season },
      _avg: {
        minutesPlayed: true,
        points: true,
        rebounds: true,
        assists: true,
        steals: true,
        blocks: true,
        turnovers: true,
      },
      _sum: { points: true, fgAttempted: true, ftAttempted: true },
      _count: { _all: true },
    }),
  ]);

  const boxByPlayer = new Map(boxAgg.map((g) => [g.leaguePlayerId, g]));
  const playerById = new Map(rosteredPlayers.map((p) => [p.id, p]));

  function toEntry(leaguePlayerId: string, value: number): AwardRaceEntry {
    const p = playerById.get(leaguePlayerId);
    return {
      leaguePlayerId,
      fullName: p?.player.fullName ?? "Unknown",
      photoUrl: p?.player.photoUrl ?? null,
      teamAbbreviation: p?.leagueTeam?.team.abbreviation ?? null,
      teamPrimaryColor: p?.leagueTeam?.team.primaryColor ?? null,
      value,
    };
  }

  const ratingSnapshots: PlayerSeasonSnapshot[] = rosteredPlayers.map((p) => {
    const gamesPlayed = (p.leagueTeam?.wins ?? 0) + (p.leagueTeam?.losses ?? 0);
    return {
      leaguePlayerId: p.id,
      overallRating: p.overallRating,
      previousRating: null,
      experience: estimateExperience(p.player.draftYear, season),
      teamWinPct: gamesPlayed > 0 ? (p.leagueTeam?.wins ?? 0) / gamesPlayed : 0,
    };
  });

  const defensiveSnapshots: DefensiveSeasonSnapshot[] = [];
  const benchSnapshots: BenchSeasonSnapshot[] = [];
  for (const p of rosteredPlayers) {
    const box = boxByPlayer.get(p.id);
    if (!box || box._count._all === 0) continue;
    const minutesPerGame = box._avg.minutesPlayed ?? 0;
    const trueShootingDenominator =
      2 * ((box._sum.fgAttempted ?? 0) + 0.44 * (box._sum.ftAttempted ?? 0));
    const trueShootingPct =
      trueShootingDenominator > 0 ? (box._sum.points ?? 0) / trueShootingDenominator : 0.56;
    defensiveSnapshots.push({
      leaguePlayerId: p.id,
      gamesPlayed: box._count._all,
      minutesPerGame,
      stealsPerGame: box._avg.steals ?? 0,
      blocksPerGame: box._avg.blocks ?? 0,
      reboundsPerGame: box._avg.rebounds ?? 0,
    });
    benchSnapshots.push({
      leaguePlayerId: p.id,
      gamesPlayed: box._count._all,
      minutesPerGame,
      pointsPerGame: box._avg.points ?? 0,
      reboundsPerGame: box._avg.rebounds ?? 0,
      assistsPerGame: box._avg.assists ?? 0,
      stealsPerGame: box._avg.steals ?? 0,
      blocksPerGame: box._avg.blocks ?? 0,
      turnoversPerGame: box._avg.turnovers ?? 0,
      trueShootingPct,
    });
  }

  const mvp = computeMVP(ratingSnapshots);
  const roy = computeRookieOfTheYear(ratingSnapshots);
  const dpoy = computeDefensivePlayerOfTheYear(defensiveSnapshots);
  const sixthMan = computeSixthManOfTheYear(benchSnapshots);

  return {
    mvp: mvp ? toEntry(mvp.leaguePlayerId, mvp.value) : null,
    rookieOfTheYear: roy ? toEntry(roy.leaguePlayerId, roy.value) : null,
    defensivePlayerOfTheYear: dpoy ? toEntry(dpoy.leaguePlayerId, dpoy.value) : null,
    sixthManOfTheYear: sixthMan ? toEntry(sixthMan.leaguePlayerId, sixthMan.value) : null,
  };
}
