/**
 * The league as it stands right now, not as a list of things that happened.
 *
 * The old sidebar was three lists of recent transactions, which meant the same
 * headline could appear in the hero, a sidebar module and the feed at once.
 * The fix is not to de-duplicate string by string - it is for the sidebar to
 * answer a different question. This reads **standings and roster state**
 * (`LeagueTeam.currentStreak`, wins/losses, who is currently injured) rather
 * than re-reading the news, so overlap is structurally impossible: one is a
 * position, the other is an event.
 *
 * Pure over plain data so it can be asserted on directly.
 */

export interface PulseTeam {
  leagueTeamId: string;
  label: string;
  wins: number;
  losses: number;
  /** Positive for a winning run, negative for a losing one. */
  currentStreak: number;
}

export interface PulseInjury {
  leaguePlayerId: string;
  playerName: string;
  teamLabel: string;
  leagueTeamId: string;
  overallRating: number;
  /** Games the player is still expected to miss, when known. */
  gamesRemaining: number | null;
}

/** Below this a run is not a storyline, just a couple of results. */
const NOTABLE_STREAK = 3;

/** A "most important injury" should be someone the league would notice. */
const NOTABLE_INJURY_RATING = 74;

export interface LeaguePulse {
  hottest: PulseTeam | null;
  coldest: PulseTeam | null;
  /** The best record in the league - the standings answer, not a news item. */
  best: PulseTeam | null;
  /** Currently sidelined, ranked by who it hurts most. */
  keyInjury: PulseInjury | null;
  /** How many players are on the shelf league-wide right now. */
  injuredCount: number;
}

export function computeLeaguePulse(
  teams: PulseTeam[],
  injured: PulseInjury[],
  userTeamId: string | null,
): LeaguePulse {
  const streaking = teams.filter((t) => Math.abs(t.currentStreak) >= NOTABLE_STREAK);

  const hottest =
    streaking
      .filter((t) => t.currentStreak > 0)
      .sort((a, b) => b.currentStreak - a.currentStreak)[0] ?? null;

  const coldest =
    streaking
      .filter((t) => t.currentStreak < 0)
      .sort((a, b) => a.currentStreak - b.currentStreak)[0] ?? null;

  const played = teams.filter((t) => t.wins + t.losses > 0);
  const best =
    [...played].sort(
      (a, b) => b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses) || b.wins - a.wins,
    )[0] ?? null;

  // Whose absence matters most: quality first, then how long they are gone,
  // with the user's own team breaking ties - it is their team's problem.
  const keyInjury =
    [...injured]
      .filter((p) => p.overallRating >= NOTABLE_INJURY_RATING)
      .sort((a, b) => {
        const mine = Number(b.leagueTeamId === userTeamId) - Number(a.leagueTeamId === userTeamId);
        if (mine !== 0) return mine;
        if (b.overallRating !== a.overallRating) return b.overallRating - a.overallRating;
        return (b.gamesRemaining ?? 0) - (a.gamesRemaining ?? 0);
      })[0] ?? null;

  return { hottest, coldest, best, keyInjury, injuredCount: injured.length };
}

export function streakLabel(streak: number): string {
  const n = Math.abs(streak);
  return streak > 0 ? `Won ${n} straight` : `Lost ${n} straight`;
}

export function recordLabel(team: PulseTeam): string {
  return `${team.wins}-${team.losses}`;
}
