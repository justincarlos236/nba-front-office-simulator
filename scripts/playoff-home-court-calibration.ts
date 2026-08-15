/**
 * Fits `PLAYOFF_HOME_COURT_ADVANTAGE`.
 *
 * docs/PLAYOFF_AUDIT.md PO-P2-1: the postseason used the regular season's home
 * advantage, so playoff home teams won 58.2% - the top of the engine's own
 * regular-season band rather than above it. Real home teams win about 54% of
 * regular-season games and 60% of playoff games.
 *
 * The measurement has to be taken over real playoff matchups rather than a
 * neutral pair, because the higher seed hosts four of seven games and is also
 * the better team - so the observed home win rate mixes home advantage with
 * seeding. Sweeping against that mixture is the only way to land the number
 * that matters.
 *
 * Reads only. Run: npx tsx scripts/playoff-home-court-calibration.ts
 */
import fs from "node:fs";
import path from "node:path";
import { simulateGame } from "../src/lib/simulation/simulateGame";
import { isHigherSeedHomeGame } from "../src/lib/simulation/simulateSeries";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

/** Real postseason home win rate, recent seasons. */
const TARGET_PLAYOFF_HOME_WIN = 0.6;
const TRIALS = 60_000;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Row {
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
}
const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };
const { rostered } = selectTopPerTeam<Row>(
  ds.players,
  (p) => p.teamAbbreviation,
  (p) => p.seedOverallRating ?? 0,
  DEFAULT_MAX_ROSTER_SIZE,
);
const byTeam = new Map<string, number[]>();
for (const p of ds.players) {
  if (!rostered.has(p) || !p.teamAbbreviation) continue;
  byTeam.set(p.teamAbbreviation, [...(byTeam.get(p.teamAbbreviation) ?? []), p.seedOverallRating ?? 0]);
}
/** Strongest sixteen clubs, which is who actually plays playoff games. */
const strengths = [...byTeam.values()]
  .map((roster) => computeTeamStrength(roster))
  .sort((a, b) => b - a)
  .slice(0, 16);

/**
 * Playoff seeding pairs 1v8, 2v7, 3v6, 4v5 within a conference. Taking every
 * other team off the league-wide list approximates one conference's seeds.
 */
const SEEDS = strengths.filter((_, i) => i % 2 === 0).slice(0, 8);
const MATCHUPS: [number, number][] = [
  [SEEDS[0], SEEDS[7]],
  [SEEDS[1], SEEDS[6]],
  [SEEDS[2], SEEDS[5]],
  [SEEDS[3], SEEDS[4]],
];

function measure(advantage: number): number {
  const rng = makeRng(4242);
  let homeWins = 0;
  let games = 0;
  for (let t = 0; t < TRIALS; t++) {
    const [higher, lower] = MATCHUPS[t % MATCHUPS.length];
    // A full seven-game slate, so the home/away split matches a real series.
    for (let gameNumber = 1; gameNumber <= 7; gameNumber++) {
      const higherHome = isHigherSeedHomeGame(gameNumber);
      const homeStrength = higherHome ? higher : lower;
      const awayStrength = higherHome ? lower : higher;
      const result = simulateGame(homeStrength, awayStrength, rng, 0, 0, advantage);
      if (result.homeWon) homeWins += 1;
      games += 1;
    }
  }
  return homeWins / games;
}

console.log("=".repeat(64));
console.log("PLAYOFF HOME COURT CALIBRATION");
console.log("=".repeat(64));
console.log(`  target: ${(TARGET_PLAYOFF_HOME_WIN * 100).toFixed(0)}% postseason home win rate`);
console.log(`  regular season keeps its own 1.1\n`);
console.log(`${"ADVANTAGE".padStart(11)}${"HOME WIN%".padStart(12)}${"ERROR".padStart(10)}`);

let best = { advantage: 0, error: Infinity, rate: 0 };
for (let advantage = 1.0; advantage <= 2.61; advantage += 0.1) {
  const rate = measure(advantage);
  const error = Math.abs(rate - TARGET_PLAYOFF_HOME_WIN);
  if (error < best.error) best = { advantage, error, rate };
  console.log(
    `${advantage.toFixed(1).padStart(11)}${(rate * 100).toFixed(1).padStart(11)}%` +
      `${((rate - TARGET_PLAYOFF_HOME_WIN) * 100).toFixed(1).padStart(9)}pp`,
  );
}

console.log(
  `\n  BEST FIT: PLAYOFF_HOME_COURT_ADVANTAGE = ${best.advantage.toFixed(1)} ` +
    `(${(best.rate * 100).toFixed(1)}% home wins)`,
);
