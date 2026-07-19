import { simulateGame } from "./simulateGame";

export interface PlayInSeeds {
  seven: string;
  eight: string;
  nine: string;
  ten: string;
}

export interface PlayInGameResult {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeWon: boolean;
}

export interface PlayInResult {
  finalSeventhSeed: string;
  finalEighthSeed: string;
  games: PlayInGameResult[];
}

/**
 * Real NBA play-in format: three single-elimination games, higher seed
 * always hosts.
 *  - Game A: 7 vs 8, winner becomes the final 7-seed.
 *  - Game B: 9 vs 10, loser is eliminated.
 *  - Game C: loser of Game A vs winner of Game B, winner becomes the final
 *    8-seed.
 */
export function simulatePlayIn(
  seeds: PlayInSeeds,
  strengthByTeam: Map<string, number>,
  rng: () => number = Math.random,
): PlayInResult {
  const strength = (teamId: string) => strengthByTeam.get(teamId) ?? 0;
  const games: PlayInGameResult[] = [];

  const gameA = simulateGame(strength(seeds.seven), strength(seeds.eight), rng);
  games.push({
    homeTeamId: seeds.seven,
    awayTeamId: seeds.eight,
    homeScore: gameA.homeScore,
    awayScore: gameA.awayScore,
    homeWon: gameA.homeWon,
  });
  const finalSeventhSeed = gameA.homeWon ? seeds.seven : seeds.eight;
  const gameALoser = gameA.homeWon ? seeds.eight : seeds.seven;

  const gameB = simulateGame(strength(seeds.nine), strength(seeds.ten), rng);
  games.push({
    homeTeamId: seeds.nine,
    awayTeamId: seeds.ten,
    homeScore: gameB.homeScore,
    awayScore: gameB.awayScore,
    homeWon: gameB.homeWon,
  });
  const gameBWinner = gameB.homeWon ? seeds.nine : seeds.ten;

  const gameC = simulateGame(strength(gameALoser), strength(gameBWinner), rng);
  games.push({
    homeTeamId: gameALoser,
    awayTeamId: gameBWinner,
    homeScore: gameC.homeScore,
    awayScore: gameC.awayScore,
    homeWon: gameC.homeWon,
  });
  const finalEighthSeed = gameC.homeWon ? gameALoser : gameBWinner;

  return { finalSeventhSeed, finalEighthSeed, games };
}
