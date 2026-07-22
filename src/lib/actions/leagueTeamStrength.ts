import { prisma } from "@/lib/prisma";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { PROFILE_SEASON } from "@/lib/players/profileData";
import type { Position } from "@/generated/prisma/client";

export interface RealStatBaseline {
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  fgPct: number | null;
  fg3Pct: number | null;
  ftPct: number | null;
  trueShootingPct: number | null;
}

export interface RosterPlayerForSimulation {
  leaguePlayerId: string;
  overallRating: number;
  position: Position;
  /** Null for fictional draft-generated players - no real-world stat line to draw from. */
  realStat: RealStatBaseline | null;
}

/**
 * Shared by regular-season/playoff win simulation and box-score generation:
 * pulls each team's current healthy roster once and reduces it to both a
 * single strength number (via the same weighted-rotation formula, so every
 * simulation rates teams identically) and full per-player detail (rating,
 * position, real stat baseline) that box-score generation needs. One query,
 * not two. Injured players (see src/lib/actions/leagueEvents.ts) are
 * excluded from both - this is what makes an in-season injury mechanically
 * real rather than flavor text: a team missing a rotation player is
 * genuinely weaker and that player never appears in a box score until
 * their `injuryStatus` clears.
 */
export async function computeLeagueTeamStrengths(leagueTeamIds: string[]): Promise<{
  strengthByTeam: Map<string, number>;
  rostersByTeam: Map<string, RosterPlayerForSimulation[]>;
}> {
  const roster = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: { in: leagueTeamIds }, injuryStatus: "HEALTHY" },
    select: {
      id: true,
      leagueTeamId: true,
      overallRating: true,
      player: {
        select: {
          position: true,
          seasonStats: { where: { season: PROFILE_SEASON }, take: 1 },
        },
      },
    },
  });

  const rostersByTeam = new Map<string, RosterPlayerForSimulation[]>();
  const ratingsByTeam = new Map<string, number[]>();
  for (const p of roster) {
    if (!p.leagueTeamId) continue;
    const stat = p.player.seasonStats[0];
    const entry: RosterPlayerForSimulation = {
      leaguePlayerId: p.id,
      overallRating: p.overallRating,
      position: p.player.position,
      realStat: stat
        ? {
            minutesPerGame: stat.minutesPerGame,
            pointsPerGame: stat.pointsPerGame,
            reboundsPerGame: stat.reboundsPerGame,
            assistsPerGame: stat.assistsPerGame,
            stealsPerGame: stat.stealsPerGame,
            blocksPerGame: stat.blocksPerGame,
            turnoversPerGame: stat.turnoversPerGame,
            fgPct: stat.fgPct,
            fg3Pct: stat.fg3Pct,
            ftPct: stat.ftPct,
            trueShootingPct: stat.trueShootingPct,
          }
        : null,
    };
    const list = rostersByTeam.get(p.leagueTeamId) ?? [];
    list.push(entry);
    rostersByTeam.set(p.leagueTeamId, list);

    const ratings = ratingsByTeam.get(p.leagueTeamId) ?? [];
    ratings.push(p.overallRating);
    ratingsByTeam.set(p.leagueTeamId, ratings);
  }

  const strengthByTeam = new Map<string, number>();
  for (const teamId of leagueTeamIds) {
    strengthByTeam.set(teamId, computeTeamStrength(ratingsByTeam.get(teamId) ?? []));
  }

  return { strengthByTeam, rostersByTeam };
}
