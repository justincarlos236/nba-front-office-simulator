export interface StandingsEntry {
  leagueTeamId: string;
  wins: number;
  losses: number;
}

export interface ConferenceSeeding {
  /** Seeds 1-6, in order - direct playoff qualifiers, no play-in needed. */
  directQualifiers: string[];
  /** Seeds 7-10, in order - the four teams in the play-in tournament. */
  playInTeams: string[];
}

export function winPct(entry: StandingsEntry): number {
  const gamesPlayed = entry.wins + entry.losses;
  return gamesPlayed > 0 ? entry.wins / gamesPlayed : 0;
}

/**
 * Which of two teams gets home-court advantage in a playoff series:
 * better regular-season winning percentage (ties broken by total wins) -
 * the real NBA rule, used both within a conference and, for the Finals,
 * across conferences.
 */
export function pickHigherSeed(a: StandingsEntry, b: StandingsEntry): StandingsEntry {
  const pctDiff = winPct(b) - winPct(a);
  if (pctDiff !== 0) return pctDiff < 0 ? a : b;
  return b.wins - a.wins > 0 ? b : a;
}

/**
 * Seeds one conference's 15 teams the real NBA way: top 6 by winning
 * percentage qualify directly, seeds 7-10 go to the play-in tournament for
 * the final two playoff spots. Ties broken by total wins (a simplification
 * of the real tiebreaker rules, which consider head-to-head record,
 * division standing, and more - see docs/ARCHITECTURE.md).
 */
export function seedConference(standings: StandingsEntry[]): ConferenceSeeding {
  const sorted = [...standings].sort((a, b) => winPct(b) - winPct(a) || b.wins - a.wins);
  return {
    directQualifiers: sorted.slice(0, 6).map((s) => s.leagueTeamId),
    playInTeams: sorted.slice(6, 10).map((s) => s.leagueTeamId),
  };
}
