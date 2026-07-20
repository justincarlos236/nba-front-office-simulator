/**
 * Awards computed only from data the simulator actually tracks honestly:
 * rating, team record, rookie status, and season-over-season rating
 * change. Deliberately excludes DPOY/Sixth Man/All-Defense - those would
 * need individual defensive box-score stats or a bench/starter depth
 * chart, neither of which exist yet (the game engine is strength-based,
 * not possession-by-possession - see docs/ARCHITECTURE.md), so faking
 * them would mean presenting a guess as a real result. Same principle
 * this project already applies to contract data.
 */
export interface PlayerSeasonSnapshot {
  leaguePlayerId: string;
  overallRating: number;
  /** Rating at the start of the season just completed, or null if there's no prior record (e.g. a new signing). */
  previousRating: number | null;
  /** Years of experience entering the season just completed - 0 means a rookie season. */
  experience: number;
  /** The player's team's win percentage for the season just completed. */
  teamWinPct: number;
}

export interface SeasonAwardWinner {
  leaguePlayerId: string;
  value: number;
}

// How many rating-points-equivalent a full swing from a 0-win to a
// perfect team is worth. Additive (not multiplicative against rating) so
// team record can tip a close talent gap without ever letting a
// low-rated player on a great team outscore a real superstar on a bad one.
const TEAM_RECORD_WEIGHT = 15;

export function computeMVP(players: PlayerSeasonSnapshot[]): SeasonAwardWinner | null {
  let best: SeasonAwardWinner | null = null;
  let bestScore = -Infinity;
  for (const p of players) {
    const score = p.overallRating + (p.teamWinPct - 0.5) * TEAM_RECORD_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      best = { leaguePlayerId: p.leaguePlayerId, value: Math.round(score * 100) / 100 };
    }
  }
  return best;
}

export function computeRookieOfTheYear(players: PlayerSeasonSnapshot[]): SeasonAwardWinner | null {
  const rookies = players.filter((p) => p.experience === 0);
  if (rookies.length === 0) return null;
  const best = rookies.reduce((a, b) => (b.overallRating > a.overallRating ? b : a));
  return { leaguePlayerId: best.leaguePlayerId, value: best.overallRating };
}

export function computeMostImprovedPlayer(
  players: PlayerSeasonSnapshot[],
): SeasonAwardWinner | null {
  let best: SeasonAwardWinner | null = null;
  let bestDelta = -Infinity;
  for (const p of players) {
    if (p.previousRating === null) continue;
    const delta = p.overallRating - p.previousRating;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = { leaguePlayerId: p.leaguePlayerId, value: delta };
    }
  }
  // A league full of decliners shouldn't produce a "most improved" winner
  // with a negative or zero delta.
  if (!best || bestDelta <= 0) return null;
  return best;
}
