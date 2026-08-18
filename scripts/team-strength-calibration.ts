/**
 * Fits `computeTeamStrength`'s rotation weights.
 *
 * The audit (docs/audits/TEAM_STRENGTH_AUDIT.md) showed the shipped weights are nearly
 * flat across 15 players - the best man is 12.3% of a team, the bottom six are
 * 21.1% - which leaves talent SD at 6.4 wins against a real ~11.1 and makes 56%
 * of the standings luck. Re-weighting alone recovers it, so the constants are
 * what needs picking, and picking them by hand against one target is how the
 * curve ends up fitting 1v8 while overshooting everything closer.
 *
 * Swept against three independent targets at once. All three are properties of
 * the *league*, not of one matchup, so none of them depends on the crude
 * seed approximation the series check uses.
 *
 * Reads only. Run: npx tsx scripts/team-strength-calibration.ts
 */
import fs from "node:fs";
import path from "node:path";
import { computeHomeWinProbability } from "../src/lib/simulation/simulateGame";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

// Real NBA, measured over recent seasons.
const TARGET_TALENT_SD = 11.1;
const TARGET_BEST_WINS = 63;
const TARGET_WORST_WINS = 18;

const ROTATION_SIZE = 9;

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
const rosters = new Map<string, number[]>();
for (const p of ds.players) {
  if (!rostered.has(p) || !p.teamAbbreviation) continue;
  rosters.set(p.teamAbbreviation, [
    ...(rosters.get(p.teamAbbreviation) ?? []),
    p.seedOverallRating ?? 0,
  ]);
}
const allRosters = [...rosters.values()].map((r) => [...r].sort((a, b) => b - a));

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

/**
 * Geometric decay across the rotation, flat for the bench. One shape parameter
 * rather than nine hand-set numbers, so the curve cannot be quietly overfitted
 * to whichever matchup was being looked at.
 */
function weightsFor(decay: number, bench: number): number[] {
  return Array.from({ length: ROTATION_SIZE }, (_, i) => decay ** i).concat(
    Array.from({ length: 6 }, () => bench),
  );
}

function strengthWith(weights: number[], ratings: number[]): number {
  let sum = 0;
  let tot = 0;
  ratings.forEach((r, i) => {
    const w = weights[Math.min(i, weights.length - 1)];
    sum += r * w;
    tot += w;
  });
  return tot > 0 ? sum / tot : 0;
}

function evaluate(decay: number, bench: number) {
  const weights = weightsFor(decay, bench);
  const strengths = allRosters.map((r) => strengthWith(weights, r));
  const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
  const wins = strengths.map((s) => {
    // Held at a fixed reference so win totals stay comparable across curves.
    const rel = s - mean + 76;
    return (
      82 * ((computeHomeWinProbability(rel, 76) + (1 - computeHomeWinProbability(76, rel))) / 2)
    );
  });
  const talentSd = sd(wins);
  const best = Math.max(...wins);
  const worst = Math.min(...wins);
  const err =
    ((talentSd - TARGET_TALENT_SD) / TARGET_TALENT_SD) ** 2 +
    ((best - TARGET_BEST_WINS) / TARGET_BEST_WINS) ** 2 +
    ((worst - TARGET_WORST_WINS) / TARGET_WORST_WINS) ** 2;
  return { talentSd, best, worst, err, weights };
}

/**
 * The fit is constrained to shapes that still describe a basketball rotation.
 *
 * Unconstrained, the sweep runs to the edge of the search space and returns a
 * degenerate curve: a geometric decay steep enough to hit the talent target
 * zeroes out the 9th man, and because the bench is six players against a
 * collapsing rotation total it ends up at 25.7% of the team - MORE than the
 * flat weights this is replacing. Fitting the number while inverting the shape
 * is not a fix.
 *
 * So the shape is bounded at BOTH ends. The best player may not exceed a
 * quarter of a team. The bottom six must land between 3% and 8% - left free the
 * optimiser drives them to 0.7%, which says a team's last six men are worth
 * nothing at all, and depth does matter even if it matters least. Real minutes
 * shares are about 14% and 5%; these bounds are deliberately looser, because
 * impact is more concentrated than minutes.
 */
const MAX_TOP_SHARE = 0.25;
const MIN_BENCH_SHARE = 0.03;
const MAX_BENCH_SHARE = 0.08;

function shapeIsPlausible(decay: number, bench: number): boolean {
  const w = weightsFor(decay, bench);
  const total = w.reduce((a, b) => a + b, 0);
  const benchShare = (6 * bench) / total;
  return (
    w[0] / total <= MAX_TOP_SHARE && benchShare >= MIN_BENCH_SHARE && benchShare <= MAX_BENCH_SHARE
  );
}

let bestFit = { decay: 0, bench: 0, err: Infinity, talentSd: 0, best: 0, worst: 0 };
for (let decay = 0.5; decay <= 0.99; decay += 0.005) {
  for (let bench = 0; bench <= 0.3; bench += 0.0025) {
    if (!shapeIsPlausible(decay, bench)) continue;
    const r = evaluate(decay, bench);
    if (r.err < bestFit.err) {
      bestFit = { decay, bench, err: r.err, talentSd: r.talentSd, best: r.best, worst: r.worst };
    }
  }
}

console.log("=".repeat(72));
console.log("TEAM STRENGTH WEIGHT CALIBRATION");
console.log("=".repeat(72));
console.log(
  `  targets: talent SD ${TARGET_TALENT_SD}, best ${TARGET_BEST_WINS}W, worst ${TARGET_WORST_WINS}W\n`,
);
console.log(
  `${"DECAY".padStart(7)}${"BENCH".padStart(8)}${"TALENT SD".padStart(11)}${"BEST".padStart(7)}${"WORST".padStart(7)}${"ERR".padStart(9)}`,
);
for (const d of [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, bestFit.decay]) {
  const r = evaluate(d, bestFit.bench);
  console.log(
    `${d.toFixed(3).padStart(7)}${bestFit.bench.toFixed(3).padStart(8)}${r.talentSd.toFixed(1).padStart(11)}${r.best.toFixed(0).padStart(7)}${r.worst.toFixed(0).padStart(7)}${r.err.toFixed(4).padStart(9)}`,
  );
}

const fit = evaluate(bestFit.decay, bestFit.bench);
console.log(`\n  BEST FIT  decay ${bestFit.decay.toFixed(3)}  bench ${bestFit.bench.toFixed(3)}`);
console.log(`    talent SD ${fit.talentSd.toFixed(1)} (target ${TARGET_TALENT_SD})`);
console.log(
  `    best ${fit.best.toFixed(0)}W (target ${TARGET_BEST_WINS})   worst ${fit.worst.toFixed(0)}W (target ${TARGET_WORST_WINS})`,
);

const rounded = fit.weights.slice(0, ROTATION_SIZE).map((w) => Number(w.toFixed(2)));
console.log(`\n  ROTATION_WEIGHTS = [${rounded.join(", ")}]`);
console.log(`  BENCH_WEIGHT = ${Number(bestFit.bench.toFixed(2))}`);
const total = rounded.reduce((a, b) => a + b, 0) + 6 * bestFit.bench;
console.log(
  `\n  share of team: #1 ${((rounded[0] / total) * 100).toFixed(1)}%   ` +
    `top 3 ${(((rounded[0] + rounded[1] + rounded[2]) / total) * 100).toFixed(1)}%   ` +
    `bottom 6 ${(((6 * bestFit.bench) / total) * 100).toFixed(1)}%`,
);
console.log(`  (shipped: #1 12.3%, top 3 34.2%, bottom 6 21.1%)`);
