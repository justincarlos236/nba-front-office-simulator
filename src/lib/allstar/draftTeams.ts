/**
 * Shared by the All-Star Game and the Rising Stars game - both use the
 * real current NBA captain-draft format (two captains alternately draft
 * the rest of the pool) rather than a fixed East-vs-West split, which
 * avoids needing conference-balance bookkeeping for what's an exhibition.
 */
export interface DraftablePlayer {
  leaguePlayerId: string;
  score: number; // higher = drafted earlier / preferred as captain
}

export interface DraftResult {
  captainAId: string;
  captainBId: string;
  teamA: string[];
  teamB: string[];
}

export function draftTeams(players: DraftablePlayer[]): DraftResult {
  if (players.length < 2) {
    throw new Error("draftTeams needs at least 2 players");
  }
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const [captainA, captainB, ...remaining] = sorted;

  const teamA: string[] = [captainA.leaguePlayerId];
  const teamB: string[] = [captainB.leaguePlayerId];
  remaining.forEach((p, i) => {
    (i % 2 === 0 ? teamA : teamB).push(p.leaguePlayerId);
  });

  return { captainAId: captainA.leaguePlayerId, captainBId: captainB.leaguePlayerId, teamA, teamB };
}
