import { createSeededRandom } from "../contracts/seededRandom";

export interface ScheduledGame {
  gameNumber: number;
  homeLeagueTeamId: string;
  awayLeagueTeamId: string;
}

/**
 * Generates a simplified round-robin regular season: every team plays
 * every other team exactly twice (once at home, once away). For 30 teams
 * that's 58 games/team (1,740 total), not the real NBA's 82 - which
 * weights division/conference opponents unevenly (division rivals 4x,
 * some conference teams 3-4x, the other conference 2x). Replicating that
 * exact weighting is a lot of complexity for little added value here, so
 * this is a documented, intentional simplification (see docs/ARCHITECTURE.md).
 *
 * Deterministic given `seed`, so a league's schedule is reproducible.
 */
export function generateRoundRobinSchedule(leagueTeamIds: string[], seed: string): ScheduledGame[] {
  const games: Omit<ScheduledGame, "gameNumber">[] = [];

  for (let i = 0; i < leagueTeamIds.length; i++) {
    for (let j = i + 1; j < leagueTeamIds.length; j++) {
      games.push({ homeLeagueTeamId: leagueTeamIds[i], awayLeagueTeamId: leagueTeamIds[j] });
      games.push({ homeLeagueTeamId: leagueTeamIds[j], awayLeagueTeamId: leagueTeamIds[i] });
    }
  }

  const rng = createSeededRandom(seed);
  for (let i = games.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [games[i], games[j]] = [games[j], games[i]];
  }

  return games.map((game, index) => ({ ...game, gameNumber: index + 1 }));
}
