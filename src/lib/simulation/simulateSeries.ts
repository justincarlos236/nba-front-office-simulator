import { simulateGame } from "./simulateGame";

export interface SeriesState {
  higherSeedWins: number;
  lowerSeedWins: number;
}

export interface SeriesGameResult {
  gameNumber: number;
  isHigherSeedHome: boolean;
  homeScore: number;
  awayScore: number;
  higherSeedWonGame: boolean;
}

/**
 * Real NBA 2-2-1-1-1 home-court pattern for a best-of-7 series: games
 * 1, 2, 5, 7 are hosted by the higher seed; games 3, 4, 6 by the lower
 * seed. For a single-game "series" (the play-in's win-needed=1 case isn't
 * used here, but this also correctly resolves best-of-1/3/5 formats since
 * game 1 is always higher-seed-home in the real format too).
 */
export function isHigherSeedHomeGame(gameNumber: number): boolean {
  return [1, 2, 5, 7].includes(gameNumber);
}

export function simulateNextSeriesGame(
  state: SeriesState,
  higherStrength: number,
  lowerStrength: number,
  rng: () => number = Math.random,
): { newState: SeriesState; game: SeriesGameResult } {
  const gameNumber = state.higherSeedWins + state.lowerSeedWins + 1;
  const isHigherSeedHome = isHigherSeedHomeGame(gameNumber);
  const homeStrength = isHigherSeedHome ? higherStrength : lowerStrength;
  const awayStrength = isHigherSeedHome ? lowerStrength : higherStrength;
  const result = simulateGame(homeStrength, awayStrength, rng);
  const higherSeedWonGame = isHigherSeedHome ? result.homeWon : !result.homeWon;

  const newState: SeriesState = {
    higherSeedWins: state.higherSeedWins + (higherSeedWonGame ? 1 : 0),
    lowerSeedWins: state.lowerSeedWins + (higherSeedWonGame ? 0 : 1),
  };

  return {
    newState,
    game: {
      gameNumber,
      isHigherSeedHome,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      higherSeedWonGame,
    },
  };
}

export interface SeriesResult {
  finalState: SeriesState;
  winnerIsHigherSeed: boolean;
  games: SeriesGameResult[];
}

/**
 * Simulates every remaining game of a series from `startState` until one
 * side reaches `winsNeeded` (4 for a real best-of-7).
 */
export function simulateSeriesToCompletion(
  higherStrength: number,
  lowerStrength: number,
  winsNeeded: number,
  startState: SeriesState = { higherSeedWins: 0, lowerSeedWins: 0 },
  rng: () => number = Math.random,
): SeriesResult {
  let state = startState;
  const games: SeriesGameResult[] = [];

  while (state.higherSeedWins < winsNeeded && state.lowerSeedWins < winsNeeded) {
    const { newState, game } = simulateNextSeriesGame(state, higherStrength, lowerStrength, rng);
    state = newState;
    games.push(game);
  }

  return { finalState: state, winnerIsHigherSeed: state.higherSeedWins >= winsNeeded, games };
}
