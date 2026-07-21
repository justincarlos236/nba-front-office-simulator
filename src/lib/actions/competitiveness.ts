import { computeLeagueTeamStrengths } from "./leagueTeamStrength";

// Below this many games played this season, win percentage doesn't mean
// much yet (a 2-0 start isn't a real signal) - team strength stands in as
// the "how competitive is this team" proxy until there's a real sample.
const MIN_GAMES_FOR_WIN_PCT_SIGNAL = 20;

/**
 * Ranks every team in a league by competitiveness (actual win percentage
 * once enough games are played this season, team strength before that -
 * see `computeLeagueTeamStrengths`) and returns each team's percentile
 * (0 = league's worst, 1 = league's best). Shared by the team dashboard's
 * "Team identity" card and the trade-AI evaluation engine (Phase 11c),
 * both of which need the same "how good is this team right now" signal.
 */
export async function computeCompetitivenessPercentiles(
  teams: { id: string; wins: number; losses: number }[],
): Promise<Map<string, number>> {
  const maxGamesPlayed = teams.reduce((max, t) => Math.max(max, t.wins + t.losses), 0);
  const useWinPctSignal = maxGamesPlayed >= MIN_GAMES_FOR_WIN_PCT_SIGNAL;

  const scoreByTeam = useWinPctSignal
    ? new Map(teams.map((t) => [t.id, t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0]))
    : await computeLeagueTeamStrengths(teams.map((t) => t.id));

  const rankedDesc = [...scoreByTeam.entries()].sort((a, b) => b[1] - a[1]);
  const percentileByTeam = new Map<string, number>();
  rankedDesc.forEach(([teamId], index) => {
    percentileByTeam.set(teamId, rankedDesc.length > 1 ? 1 - index / (rankedDesc.length - 1) : 1);
  });
  return percentileByTeam;
}
