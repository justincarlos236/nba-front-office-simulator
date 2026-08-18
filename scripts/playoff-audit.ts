/**
 * Postseason audit harness.
 *
 * The playoffs are the payoff for 82 simulated games and the gate on everything
 * after them - the lottery, the draft and the offseason are all chained to a
 * champion existing. No audit in docs/ has ever covered them: the simulation
 * audit measured regular-season games, roster progression measured development,
 * and neither touched seeding, the bracket, the play-in or series play.
 *
 * Measured against the REAL seeded league's team strengths rather than invented
 * ones, so the strength gaps a series actually sees are the gaps the game
 * produces.
 *
 * Reads only. Run: npx tsx scripts/playoff-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import { computeHomeWinProbability } from "../src/lib/simulation/simulateGame";
import {
  simulateSeriesToCompletion,
  isHigherSeedHomeGame,
} from "../src/lib/simulation/simulateSeries";
import { simulatePlayIn } from "../src/lib/simulation/playInTournament";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const line = (n = 78) => "=".repeat(n);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ---- Real team strengths from the shipped dataset -------------------------
interface Row {
  fullName: string;
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
const ratingsByTeam = new Map<string, number[]>();
for (const p of ds.players) {
  if (!rostered.has(p) || !p.teamAbbreviation) continue;
  ratingsByTeam.set(p.teamAbbreviation, [
    ...(ratingsByTeam.get(p.teamAbbreviation) ?? []),
    p.seedOverallRating ?? 0,
  ]);
}
const strengthByTeam = new Map<string, number>();
for (const [team, ratings] of ratingsByTeam) {
  strengthByTeam.set(team, computeTeamStrength(ratings));
}
const strengths = [...strengthByTeam.values()].sort((a, b) => b - a);

console.log(line());
console.log("P1  WHAT STRENGTH GAPS DOES A REAL PLAYOFF SERIES ACTUALLY SEE?");
console.log(line());
console.log(
  `  30 teams, strength ${strengths[29].toFixed(1)} (worst) to ${strengths[0].toFixed(1)} (best)`,
);
console.log(`  spread: ${(strengths[0] - strengths[29]).toFixed(1)} rating points\n`);
// A conference's 8 playoff teams are roughly the top 8 of 15. Approximate the
// seeds by taking every other team from the sorted league, which is what a
// conference split produces on average.
const seedStrength = (seed: number) => strengths[(seed - 1) * 2];
console.log(
  `${"MATCHUP".padEnd(10)}${"GAP".padStart(7)}${"HOME WIN P".padStart(12)}${"NEUTRAL WIN P".padStart(15)}`,
);
for (const [hi, lo] of [
  [1, 8],
  [2, 7],
  [3, 6],
  [4, 5],
] as [number, number][]) {
  const h = seedStrength(hi);
  const l = seedStrength(lo);
  console.log(
    `${`${hi} vs ${lo}`.padEnd(10)}${(h - l).toFixed(2).padStart(7)}${pct(computeHomeWinProbability(h, l)).padStart(12)}${pct(computeHomeWinProbability(h, l) - 0.0).padStart(15)}`,
  );
}

// ---- Series outcomes ------------------------------------------------------
const RUNS = Number(process.env.RUNS ?? 20000);

console.log("\n" + line());
console.log("P2  HOW OFTEN DOES THE HIGHER SEED WIN THE SERIES?");
console.log(line());
console.log(`${"MATCHUP".padEnd(10)}${"SIMULATED".padStart(11)}${"REAL NBA".padStart(11)}   note`);
const REAL_SERIES: Record<string, string> = {
  "1 vs 8": "93%",
  "2 vs 7": "~78%",
  "3 vs 6": "~62%",
  "4 vs 5": "~52%",
};
const lengths = new Map<number, number>();
let higherSeedWins = 0;
let totalSeries = 0;
for (const [hi, lo] of [
  [1, 8],
  [2, 7],
  [3, 6],
  [4, 5],
] as [number, number][]) {
  const h = seedStrength(hi);
  const l = seedStrength(lo);
  let wins = 0;
  const rng = makeRng(hi * 977 + lo);
  for (let i = 0; i < RUNS; i++) {
    const r = simulateSeriesToCompletion(h, l, 4, { higherSeedWins: 0, lowerSeedWins: 0 }, rng);
    if (r.winnerIsHigherSeed) wins++;
    lengths.set(r.games.length, (lengths.get(r.games.length) ?? 0) + 1);
    totalSeries++;
    if (r.winnerIsHigherSeed) higherSeedWins++;
  }
  const key = `${hi} vs ${lo}`;
  console.log(
    `${key.padEnd(10)}${pct(wins / RUNS).padStart(11)}${REAL_SERIES[key].padStart(11)}${
      key === "1 vs 8" ? "   (69-5 since 1984 = 93.2%)" : ""
    }`,
  );
}
console.log(`\n  Overall higher seed: ${pct(higherSeedWins / totalSeries)}   real NBA ~72%`);

console.log("\n" + line());
console.log("P3  SERIES LENGTH DISTRIBUTION");
console.log(line());
console.log(`${"GAMES".padStart(6)}${"SIMULATED".padStart(11)}${"REAL NBA".padStart(11)}`);
const REAL_LEN: Record<number, string> = { 4: "~17%", 5: "~24%", 6: "~31%", 7: "~28%" };
for (const n of [4, 5, 6, 7]) {
  console.log(
    `${String(n).padStart(6)}${pct((lengths.get(n) ?? 0) / totalSeries).padStart(11)}${REAL_LEN[n].padStart(11)}`,
  );
}

console.log("\n" + line());
console.log("P4  HOME-COURT: PATTERN AND EFFECT");
console.log(line());
const pattern = Array.from({ length: 7 }, (_, i) => (isHigherSeedHomeGame(i + 1) ? "H" : "L"));
console.log(`  games 1-7 hosted by: ${pattern.join(" ")}   (real 2-2-1-1-1: H H L L H L H)`);
const evenRng = makeRng(4242);
let homeWins = 0;
let n = 0;
for (const [hi, lo] of [
  [1, 8],
  [2, 7],
  [3, 6],
  [4, 5],
] as [number, number][]) {
  const h = seedStrength(hi);
  const l = seedStrength(lo);
  for (let i = 0; i < 5000; i++) {
    const r = simulateSeriesToCompletion(h, l, 4, { higherSeedWins: 0, lowerSeedWins: 0 }, evenRng);
    for (const g of r.games) {
      const homeWon = g.isHigherSeedHome ? g.higherSeedWonGame : !g.higherSeedWonGame;
      if (homeWon) homeWins++;
      n++;
    }
  }
}
console.log(`  home team wins ${pct(homeWins / n)} of playoff games   real NBA ~63%`);
console.log(
  `  (regular season in this engine is tuned to 54-58% - the playoffs use the SAME model)`,
);

console.log("\n" + line());
console.log("P5  PLAY-IN: DOES THE 7 SEED'S SECOND CHANCE ACTUALLY HELP?");
console.log(line());
const playInStrength = new Map<string, number>([
  ["7", seedStrength(7)],
  ["8", seedStrength(8)],
  ["9", strengths[16]],
  ["10", strengths[18]],
]);
const madeIt = new Map<string, number>([
  ["7", 0],
  ["8", 0],
  ["9", 0],
  ["10", 0],
]);
const piRng = makeRng(31337);
const PI_RUNS = 20000;
for (let i = 0; i < PI_RUNS; i++) {
  const r = simulatePlayIn({ seven: "7", eight: "8", nine: "9", ten: "10" }, playInStrength, piRng);
  madeIt.set(r.finalSeventhSeed, (madeIt.get(r.finalSeventhSeed) ?? 0) + 1);
  madeIt.set(r.finalEighthSeed, (madeIt.get(r.finalEighthSeed) ?? 0) + 1);
}
console.log(`${"SEED".padStart(6)}${"MAKES PLAYOFFS".padStart(16)}${"REAL NBA".padStart(11)}`);
const REAL_PI: Record<string, string> = { "7": "~80%", "8": "~63%", "9": "~38%", "10": "~19%" };
for (const s of ["7", "8", "9", "10"]) {
  console.log(
    `${s.padStart(6)}${pct((madeIt.get(s) ?? 0) / PI_RUNS).padStart(16)}${REAL_PI[s].padStart(11)}`,
  );
}
console.log(
  "\n  The 7/8 game's loser gets a second life; 9 and 10 must win twice and never host\n" +
    "  the decider. A 10 seed reaching the playoffs should be genuinely rare.",
);

console.log("\n" + line());
console.log("P6  WHO WINS THE TITLE? (full bracket, both conferences)");
console.log(line());
const ROUND_1: [number, number][] = [
  [0, 7],
  [3, 4],
  [1, 6],
  [2, 5],
];
function runConference(seeds: number[], rng: () => number): number {
  let alive = ROUND_1.map(([a, b]) => [seeds[a], seeds[b]] as [number, number]);
  while (alive.length > 0) {
    const winners: number[] = [];
    for (const [a, b] of alive) {
      const hi = Math.min(a, b);
      const lo = Math.max(a, b);
      const r = simulateSeriesToCompletion(
        seedStrength(hi),
        seedStrength(lo),
        4,
        { higherSeedWins: 0, lowerSeedWins: 0 },
        rng,
      );
      winners.push(r.winnerIsHigherSeed ? hi : lo);
    }
    if (winners.length === 1) return winners[0];
    alive = [];
    for (let i = 0; i < winners.length; i += 2) alive.push([winners[i], winners[i + 1]]);
  }
  return seeds[0];
}
const titles = new Map<number, number>();
const finalsRng = makeRng(90210);
const TITLE_RUNS = 20000;
for (let i = 0; i < TITLE_RUNS; i++) {
  const east = runConference([1, 2, 3, 4, 5, 6, 7, 8], finalsRng);
  const west = runConference([1, 2, 3, 4, 5, 6, 7, 8], finalsRng);
  const hi = Math.min(east, west);
  const lo = Math.max(east, west);
  const f = simulateSeriesToCompletion(
    seedStrength(hi),
    seedStrength(lo),
    4,
    { higherSeedWins: 0, lowerSeedWins: 0 },
    finalsRng,
  );
  const champ = f.winnerIsHigherSeed ? hi : lo;
  titles.set(champ, (titles.get(champ) ?? 0) + 1);
}
console.log(`${"SEED".padStart(6)}${"TITLES".padStart(10)}${"REAL NBA".padStart(11)}`);
const REAL_TITLES: Record<number, string> = {
  1: "~50%",
  2: "~22%",
  3: "~12%",
  4: "~8%",
  5: "~4%",
  6: "~3%",
  7: "~1%",
  8: "~0%",
};
for (let s = 1; s <= 8; s++) {
  console.log(
    `${String(s).padStart(6)}${pct((titles.get(s) ?? 0) / TITLE_RUNS).padStart(10)}${REAL_TITLES[s].padStart(11)}`,
  );
}
console.log(
  "\n  Real reference: a 1 seed has won roughly half of all titles; no 8 seed ever has,\n" +
    "  and only one 7 seed (1995 Rockets, from a 6 seed under the old format).",
);

console.log("\n" + line());
console.log("P7  IS THE 1v8 GAP A SERIES PROBLEM OR A STRENGTH PROBLEM?");
console.log(line());
console.log(
  "  If the strengths behind each seed imply realistic regular-season records,\n" +
    "  then a too-competitive 1v8 series is the series model. If they do not, the\n" +
    "  series model is fine and it is inheriting a compressed league.\n",
);
const all = [...strengthByTeam.values()];
const leagueMean = all.reduce((a, b) => a + b, 0) / all.length;
const expectedWins = (s: number) => {
  // Expected wins over 82 games against an average opponent, half at home.
  const home = computeHomeWinProbability(s, leagueMean);
  const away = 1 - computeHomeWinProbability(leagueMean, s);
  return 82 * ((home + away) / 2);
};
console.log(
  `${"SEED".padStart(6)}${"STRENGTH".padStart(10)}${"IMPLIED W-L".padStart(14)}${"REAL NBA".padStart(12)}`,
);
const REAL_RECORD: Record<number, string> = {
  1: "~60-22",
  2: "~55-27",
  3: "~51-31",
  4: "~48-34",
  5: "~46-36",
  6: "~44-38",
  7: "~41-41",
  8: "~38-44",
};
for (let seed = 1; seed <= 8; seed++) {
  const s = seedStrength(seed);
  const w = Math.round(expectedWins(s));
  console.log(
    `${String(seed).padStart(6)}${s.toFixed(1).padStart(10)}${`${w}-${82 - w}`.padStart(14)}${REAL_RECORD[seed].padStart(12)}`,
  );
}
const w1 = Math.round(expectedWins(seedStrength(1)));
const w8 = Math.round(expectedWins(seedStrength(8)));
console.log(`\n  1-seed vs 8-seed win gap: ${w1 - w8} games   real NBA ~22 games`);
