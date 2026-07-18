/**
 * Strength-based game simulation: convert two teams' strength ratings into
 * a win probability (logistic curve, with a flat home-court bonus), draw a
 * winner, then generate a plausible final score around a realistic NBA
 * scoring baseline. This is deliberately NOT a possession-by-possession
 * simulation (no shot clock, no individual box scores) - a simplification
 * documented in docs/ARCHITECTURE.md, chosen so the simulation is fast,
 * fully deterministic given a seed, and easy to reason about/test.
 */
const HOME_COURT_ADVANTAGE = 3; // rating points of equivalent strength
const WIN_PROB_STEEPNESS = 0.07;
const AVERAGE_TEAM_SCORE = 112;
const SCORE_RANDOMNESS = 22; // +/- swing applied to the loser's score
const MIN_MARGIN = 3;
const MAX_MARGIN = 22;

export function computeHomeWinProbability(homeStrength: number, awayStrength: number): number {
  const diff = homeStrength + HOME_COURT_ADVANTAGE - awayStrength;
  return 1 / (1 + Math.exp(-WIN_PROB_STEEPNESS * diff));
}

export interface SimulatedGameResult {
  homeWon: boolean;
  homeScore: number;
  awayScore: number;
  homeWinProbability: number;
}

export function simulateGame(
  homeStrength: number,
  awayStrength: number,
  rng: () => number = Math.random,
): SimulatedGameResult {
  const homeWinProbability = computeHomeWinProbability(homeStrength, awayStrength);
  const homeWon = rng() < homeWinProbability;

  const loserScore = Math.round(AVERAGE_TEAM_SCORE + (rng() - 0.5) * SCORE_RANDOMNESS);
  const margin = MIN_MARGIN + Math.round(rng() * (MAX_MARGIN - MIN_MARGIN));
  const winnerScore = loserScore + margin;

  return homeWon
    ? { homeWon: true, homeScore: winnerScore, awayScore: loserScore, homeWinProbability }
    : { homeWon: false, homeScore: loserScore, awayScore: winnerScore, homeWinProbability };
}
