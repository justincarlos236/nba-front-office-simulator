/**
 * The real post-2019-reform NBA draft lottery odds table: the three
 * worst records are flattened to identical 14.0% odds at the top (so
 * tanking to be the single worst team no longer meaningfully improves a
 * team's odds versus finishing 2nd or 3rd worst), then odds taper off for
 * seeds 4-14. This is real, published data, not an approximation - see
 * https://official.nba.com/nba-draft-lottery-faq/ for the source odds.
 *
 * The real lottery draws picks 1-3 via weighted ping-pong-ball
 * combinations without replacement, then picks 4-14 go in strict
 * reverse-standings order among the remaining teams. This module
 * approximates the same *probabilities* with a simpler weighted draw
 * without replacement for the first 4 picks (in practice picks 1-3 are
 * lottery-drawn and pick 4 is close to deterministic anyway once the top
 * 3 are removed) - a documented simplification of the exact combinatoric
 * mechanism, not the odds themselves.
 */
export const LOTTERY_ODDS: Readonly<Record<number, number>> = {
  1: 0.14,
  2: 0.14,
  3: 0.14,
  4: 0.125,
  5: 0.105,
  6: 0.09,
  7: 0.075,
  8: 0.06,
  9: 0.045,
  10: 0.03,
  11: 0.02,
  12: 0.015,
  13: 0.01,
  14: 0.005,
};

export interface LotteryTeam {
  leagueTeamId: string;
  /** 1 = worst regular-season record among non-playoff teams, 14 = best. */
  seed: number;
}

function weightedDraw(teams: LotteryTeam[], rng: () => number): LotteryTeam {
  const totalWeight = teams.reduce((sum, t) => sum + (LOTTERY_ODDS[t.seed] ?? 0), 0);
  let roll = rng() * totalWeight;
  for (const team of teams) {
    roll -= LOTTERY_ODDS[team.seed] ?? 0;
    if (roll <= 0) return team;
  }
  return teams[teams.length - 1];
}

/**
 * Runs the lottery for the 14 non-playoff teams, returning their pick
 * order (index 0 = pick 1, index 13 = pick 14). The top 4 picks are
 * decided by weighted draw without replacement; the rest fall in
 * reverse-seed order among whoever didn't win one of the first 4.
 */
export function runLottery(teams: LotteryTeam[], rng: () => number = Math.random): string[] {
  const remaining = [...teams];
  const winners: string[] = [];
  const drawCount = Math.min(4, teams.length);

  for (let i = 0; i < drawCount; i++) {
    const winner = weightedDraw(remaining, rng);
    winners.push(winner.leagueTeamId);
    remaining.splice(remaining.indexOf(winner), 1);
  }

  const rest = [...remaining].sort((a, b) => a.seed - b.seed).map((t) => t.leagueTeamId);
  return [...winners, ...rest];
}
