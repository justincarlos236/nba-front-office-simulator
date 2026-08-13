/**
 * Team-strength audit.
 *
 * Three audits now point here from different directions:
 *   - docs/SIMULATION_AUDIT.md left "talent concentration" open
 *   - docs/DEVELOPMENT_AUDIT.md's D-P0-1 is still open
 *   - docs/PLAYOFF_AUDIT.md's PO-P1-1 traced a too-competitive 1v8 series to a
 *     league where the 1 seed implies 53-29 rather than 60-22
 *
 * `computeTeamStrength` is the number every one of those depends on: a weighted
 * average of a 15-man roster, feeding `simulateGame`, the standings, playoff
 * seeding and trade value alike.
 *
 * The central question is not "is the spread too small" - a win spread can look
 * right for the wrong reason. It is **how much of the win spread is talent and
 * how much is luck**, because a seven-game series filters luck out and leaves
 * only talent, which is exactly where the playoffs went wrong.
 *
 * Reads only. Run: npx tsx scripts/team-strength-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { computeTeamStrength } from "../src/lib/simulation/teamStrength";
import { computeHomeWinProbability, simulateGame } from "../src/lib/simulation/simulateGame";
import { selectTopPerTeam, DEFAULT_MAX_ROSTER_SIZE } from "../src/lib/data-sources/rosterConstruction";

const line = (n = 78) => "=".repeat(n);
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

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
const teams = [...ratingsByTeam.entries()].map(([team, ratings]) => ({
  team,
  ratings: [...ratings].sort((a, b) => b - a),
  strength: computeTeamStrength(ratings),
}));
teams.sort((a, b) => b.strength - a.strength);

/* ---------------------------------------------------------------- */
console.log(line());
console.log("S1  HOW MUCH OF A TEAM IS ITS BEST PLAYER?");
console.log(line());
const W = [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];
const totalWeight = W.reduce((a, b) => a + b, 0) + 6 * 0.4;
console.log(`  rotation weights: ${W.join(", ")}   bench: 0.4 x6`);
console.log(`  total weight: ${totalWeight.toFixed(1)}\n`);
console.log(`${"SLOT".padStart(6)}${"WEIGHT".padStart(9)}${"SHARE OF TEAM".padStart(16)}`);
for (let i = 0; i < 11; i++) {
  const w = i < 9 ? W[i] : 0.4;
  const label = i < 9 ? `#${i + 1}` : `#${i + 1}+`;
  console.log(`${label.padStart(6)}${w.toFixed(1).padStart(9)}${`${((w / totalWeight) * 100).toFixed(1)}%`.padStart(16)}`);
  if (i === 9) break;
}
const top3Share = (W[0] + W[1] + W[2]) / totalWeight;
console.log(`\n  top 3 players = ${(top3Share * 100).toFixed(1)}% of team strength`);
console.log(`  bottom 6      = ${((6 * 0.4) / totalWeight * 100).toFixed(1)}%`);
console.log(
  `\n  Real basketball: a title team's top three routinely play 60-70% of the\n` +
    `  meaningful minutes and carry more than that in the playoffs, when rotations\n` +
    `  shorten to eight men and the 12th-15th never leave the bench.`,
);

/* ---------------------------------------------------------------- */
console.log("\n" + line());
console.log("S2  WHAT DOES UPGRADING ONE PLAYER ACTUALLY DO?");
console.log(line());
const median = teams[15];
console.log(`  Baseline: ${median.team}, strength ${median.strength.toFixed(2)}`);
console.log(`  roster: ${median.ratings.join(", ")}\n`);
console.log(`${"CHANGE".padEnd(36)}${"NEW STRENGTH".padStart(14)}${"MARGIN".padStart(9)}${"EXTRA WINS".padStart(12)}`);
const leagueMean = teams.reduce((s, t) => s + t.strength, 0) / teams.length;
const winsFor = (s: number) =>
  82 * ((computeHomeWinProbability(s, leagueMean) + (1 - computeHomeWinProbability(leagueMean, s))) / 2);
const baseWins = winsFor(median.strength);
const swap = (label: string, mutate: (r: number[]) => number[]) => {
  const s = computeTeamStrength(mutate([...median.ratings]));
  console.log(
    `${label.padEnd(36)}${s.toFixed(2).padStart(14)}${((s - median.strength) * 2.31).toFixed(1).padStart(9)}${(winsFor(s) - baseWins).toFixed(1).padStart(12)}`,
  );
};
swap("best player -> 99 (a true superstar)", (r) => [99, ...r.slice(1)]);
swap("add a 99 (drop the 15th man)", (r) => [99, ...r.slice(0, 14)]);
swap("top 3 -> 95/92/89 (a Big Three)", (r) => [95, 92, 89, ...r.slice(3)]);
swap("worst 6 -> 60 (gut the bench)", (r) => [...r.slice(0, 9), 60, 60, 60, 60, 60, 60]);
console.log(
  `\n  A single 99 is worth about the same as gutting six bench spots, in the\n` +
    `  opposite direction. That is the weighting talking, not basketball.`,
);

/* ---------------------------------------------------------------- */
console.log("\n" + line());
console.log("S3  THE LEAGUE'S TALENT SPREAD");
console.log(line());
const strengths = teams.map((t) => t.strength);
console.log(`  best  ${teams[0].team} ${strengths[0].toFixed(2)}`);
console.log(`  worst ${teams[29].team} ${strengths[29].toFixed(2)}`);
console.log(`  spread ${(strengths[0] - strengths[29]).toFixed(2)} strength = ${((strengths[0] - strengths[29]) * 2.31).toFixed(1)} points of margin`);
console.log(`  SD ${sd(strengths).toFixed(2)} strength = ${(sd(strengths) * 2.31).toFixed(1)} points of margin`);
console.log(
  `\n  Real NBA net rating runs about +11 to -11, a 22-point spread, SD near 5.5.`,
);

/* ---------------------------------------------------------------- */
console.log("\n" + line());
console.log("S4  TALENT vs LUCK - THE ONE THAT MATTERS");
console.log(line());
console.log(
  "  A season's win total is talent plus noise. Real NBA win SD is about 12,\n" +
    "  and 82 coin flips alone contribute only ~4.5 - so real standings are\n" +
    "  overwhelmingly talent. If this engine hits 12 with far less talent, it is\n" +
    "  matching the standings for the wrong reason, and a 7-game series - which\n" +
    "  averages luck away - will expose it.\n",
);
// True-talent win totals, no noise.
const talentWins = teams.map((t) => winsFor(t.strength));
const talentSd = sd(talentWins);

// Realised win totals from a season of EXACTLY 82 games per team - 41 home and
// 41 away against opponents drawn from the rest of the league.
//
// The game count has to be exact. Simulating a longer season and scaling the
// win total back to 82 understates luck: more games average more noise away,
// and rescaling shrinks what is left proportionally rather than restoring it.
const rng = makeRng(20260813);
const SEASONS = 200;
const realisedSds: number[] = [];
for (let s = 0; s < SEASONS; s++) {
  const wins = new Map<string, number>(teams.map((t) => [t.team, 0]));
  for (const home of teams) {
    for (let g = 0; g < 41; g++) {
      let away = teams[Math.floor(rng() * teams.length)];
      if (away.team === home.team) away = teams[(teams.indexOf(away) + 1) % teams.length];
      const r = simulateGame(home.strength, away.strength, rng);
      const winner = r.homeWon ? home.team : away.team;
      wins.set(winner, wins.get(winner)! + 1);
    }
  }
  realisedSds.push(sd([...wins.values()]));
}
const realisedSd = realisedSds.reduce((a, b) => a + b, 0) / realisedSds.length;
const luckSd = Math.sqrt(Math.max(0, realisedSd ** 2 - talentSd ** 2));
console.log(`${"".padEnd(26)}${"THIS ENGINE".padStart(13)}${"REAL NBA".padStart(11)}`);
console.log(`${"realised win SD".padEnd(26)}${realisedSd.toFixed(1).padStart(13)}${"~12.0".padStart(11)}`);
console.log(`${"  of which TALENT".padEnd(26)}${talentSd.toFixed(1).padStart(13)}${"~11.1".padStart(11)}`);
console.log(`${"  of which LUCK".padEnd(26)}${luckSd.toFixed(1).padStart(13)}${"~4.5".padStart(11)}`);
console.log(
  `\n  talent share of variance: ${((talentSd ** 2 / realisedSd ** 2) * 100).toFixed(0)}%   real NBA ~86%`,
);
console.log(`\n  best team's true talent: ${Math.max(...talentWins).toFixed(0)} wins   real NBA ~60-65`);
console.log(`  worst team's true talent: ${Math.min(...talentWins).toFixed(0)} wins   real NBA ~15-20`);

/* ---------------------------------------------------------------- */
console.log("\n" + line());
console.log("S5  IS IT THE WEIGHTING, OR THE RATINGS UNDERNEATH?");
console.log(line());
console.log(
  "  Re-weight the same rosters and see how much talent spread is recoverable\n" +
    "  without changing a single rating. If a steeper curve reaches real spread,\n" +
    "  the fix is here. If it cannot, the ratings are the ceiling.\n",
);
const strengthWith = (weights: number[], bench: number, ratings: number[]) => {
  const sorted = [...ratings].sort((a, b) => b - a);
  let sum = 0;
  let tot = 0;
  sorted.forEach((r, i) => {
    const w = i < weights.length ? weights[i] : bench;
    sum += r * w;
    tot += w;
  });
  return tot > 0 ? sum / tot : 0;
};
const curves: [string, number[], number][] = [
  ["shipped (1.4 -> 0.6, bench 0.4)", [1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6], 0.4],
  ["moderate (2.5 -> 0.5, bench 0.15)", [2.5, 2.1, 1.8, 1.4, 1.1, 0.9, 0.7, 0.6, 0.5], 0.15],
  ["steep (4.0 -> 0.4, bench 0.05)", [4.0, 3.2, 2.5, 1.8, 1.2, 0.8, 0.6, 0.5, 0.4], 0.05],
  ["top-5 only (playoff rotation)", [4.0, 3.0, 2.2, 1.5, 1.0], 0.0],
];
console.log(
  `${"WEIGHTING".padEnd(36)}${"TALENT SD".padStart(11)}${"BEST W".padStart(9)}${"WORST W".padStart(9)}`,
);
for (const [label, weights, bench] of curves) {
  const ss = teams.map((t) => strengthWith(weights, bench, t.ratings));
  // Re-centre on the shipped league mean so win totals stay comparable.
  const mean = ss.reduce((a, b) => a + b, 0) / ss.length;
  const wins = ss.map((s) => {
    const rel = s - mean + leagueMean;
    return (
      82 *
      ((computeHomeWinProbability(rel, leagueMean) +
        (1 - computeHomeWinProbability(leagueMean, rel))) /
        2)
    );
  });
  console.log(
    `${label.padEnd(36)}${sd(wins).toFixed(1).padStart(11)}${Math.max(...wins).toFixed(0).padStart(9)}${Math.min(...wins).toFixed(0).padStart(9)}`,
  );
}
console.log(`${"REAL NBA".padEnd(36)}${"~11.1".padStart(11)}${"~63".padStart(9)}${"~18".padStart(9)}`);

/* ---------------------------------------------------------------- */
console.log("\n" + line());
console.log("S6  WOULD A STEEPER CURVE FIX THE PLAYOFF FINDING?");
console.log(line());
console.log(
  "  docs/PLAYOFF_AUDIT.md traced a too-competitive 1v8 series to a 12-game\n" +
    "  talent gap where the real one is 22. If re-weighting is the right lever,\n" +
    "  that gap and the series rate should both move without touching the bracket.\n",
);
const STEEP: [number[], number] = [[4.0, 3.2, 2.5, 1.8, 1.2, 0.8, 0.6, 0.5, 0.4], 0.05];
const restrength = (ratings: number[]) => strengthWith(STEEP[0], STEEP[1], ratings);
const newStrengths = teams.map((t) => restrength(t.ratings)).sort((a, b) => b - a);
const newMean = newStrengths.reduce((a, b) => a + b, 0) / newStrengths.length;
const recentre = (s: number) => s - newMean + leagueMean;
const seedNow = (seed: number) => strengths[(seed - 1) * 2];
const seedNew = (seed: number) => recentre(newStrengths[(seed - 1) * 2]);
const seriesRate = (h: number, l: number) => {
  const rng2 = makeRng(555);
  let w = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    let hw = 0;
    let lw = 0;
    let g = 1;
    while (hw < 4 && lw < 4) {
      const higherHome = [1, 2, 5, 7].includes(g);
      const r = simulateGame(higherHome ? h : l, higherHome ? l : h, rng2);
      const higherWon = higherHome ? r.homeWon : !r.homeWon;
      higherWon ? hw++ : lw++;
      g++;
    }
    if (hw === 4) w++;
  }
  return w / N;
};
console.log(`${"MATCHUP".padEnd(10)}${"SHIPPED".padStart(10)}${"STEEP".padStart(9)}${"REAL".padStart(8)}`);
for (const [hi, lo] of [[1, 8], [2, 7], [3, 6], [4, 5]] as [number, number][]) {
  const now = seriesRate(seedNow(hi), seedNow(lo));
  const next = seriesRate(seedNew(hi), seedNew(lo));
  const real: Record<string, string> = { "1 vs 8": "93%", "2 vs 7": "78%", "3 vs 6": "62%", "4 vs 5": "52%" };
  console.log(
    `${`${hi} vs ${lo}`.padEnd(10)}${`${(now * 100).toFixed(1)}%`.padStart(10)}${`${(next * 100).toFixed(1)}%`.padStart(9)}${real[`${hi} vs ${lo}`].padStart(8)}`,
  );
}
const gapNow = winsFor(seedNow(1)) - winsFor(seedNow(8));
const gapNew = winsFor(seedNew(1)) - winsFor(seedNew(8));
console.log(`\n  1v8 win gap: ${gapNow.toFixed(0)} games -> ${gapNew.toFixed(0)} games   (real ~22)`);
