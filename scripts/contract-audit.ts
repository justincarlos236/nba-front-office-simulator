/**
 * Contract & salary audit harness - distribution, anomalies, sensitivity.
 *
 * Written for docs/CONTRACT_AUDIT.md, which was opened after a playtest turned
 * up a backup centre earning more than a franchise wing. Kept as a script
 * rather than a test because what it produces is a distribution shape that has
 * to be read and judged; the unit tests guard the individual invariants.
 *
 * Reads only - imports the shipped functions, touches no database.
 *
 * Run: npx tsx scripts/contract-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { planLeaguePlayer } from "../src/lib/league/planLeaguePlayer";
import { computePerformanceScore, scoreToCapFraction } from "../src/lib/valuation/playerValue";
import { ageValueMultiplier } from "../src/lib/valuation/ageCurve";
import { generateContract } from "../src/lib/contracts/generateContract";
import {
  resolvePlayerAge,
  estimateExperience,
  estimateExperienceFromAge,
} from "../src/lib/players/age";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";
import { getSeasonCapRules } from "../src/lib/cap/constants";

const SEASON = 2025;
const rules = getSeasonCapRules(SEASON);
const CAP = Number(rules.salaryCapCents);
const M = (c: number) => "$" + (c / 100 / 1_000_000).toFixed(1) + "M";
const pc = (c: number) => ((c / CAP) * 100).toFixed(1) + "%";

interface Row {
  externalId: string;
  fullName: string;
  birthDate: string | null;
  draftYear: number | null;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  position: string | null;
  contract?: { years: Array<{ season: number; salaryCents: number }> } | null;
  stats: Record<string, number | null> | null;
}
const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };

// The pre-decd646 performance score, kept so the audit's original hypothesis
// test stays reproducible. NOTE: it is now fed through the *current* pricing
// pipeline, so the figures it produces are no longer what the old build paid -
// they isolate the effect of the score alone.
const OLD_FULL_WORKLOAD = 16;
const OLD_MAX_EXTRAP = 36 / OLD_FULL_WORKLOAD;
function oldRate(perGame: number, mpg: number) {
  const e = Math.min(OLD_MAX_EXTRAP, 36 / Math.max(mpg, 1));
  return perGame + 0.7 * (perGame * e - perGame);
}
function oldScore(s: {
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  minutesPerGame: number;
  trueShootingPct: number;
}) {
  const m = s.minutesPerGame;
  const raw =
    72 +
    (oldRate(s.pointsPerGame, m) - 15) * 0.85 +
    (oldRate(s.reboundsPerGame, m) - 5) * 0.8 +
    (oldRate(s.assistsPerGame, m) - 3) * 1.1 +
    (oldRate(s.stealsPerGame, m) - 1) * 2.2 +
    (oldRate(s.blocksPerGame, m) - 0.5) * 2.2 +
    (oldRate(s.turnoversPerGame, m) - 1.5) * -1.6 +
    (s.trueShootingPct - 0.56) * 140;
  const w = Math.min(1, m / OLD_FULL_WORKLOAD);
  return Math.min(99, Math.max(60, w * raw + (1 - w) * 65));
}

const enriched = dataset.players.map((p) => {
  const age = resolvePlayerAge(
    { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
    SEASON,
  );
  const yoe = p.draftYear
    ? estimateExperience(p.draftYear, SEASON)
    : estimateExperienceFromAge(age);
  const s = p.stats;
  const stats = s
    ? {
        pointsPerGame: Number(s.pointsPerGame ?? 0),
        reboundsPerGame: Number(s.reboundsPerGame ?? 0),
        assistsPerGame: Number(s.assistsPerGame ?? 0),
        stealsPerGame: Number(s.stealsPerGame ?? 0),
        blocksPerGame: Number(s.blocksPerGame ?? 0),
        turnoversPerGame: Number(s.turnoversPerGame ?? 0),
        minutesPerGame: Number(s.minutesPerGame ?? 0),
        trueShootingPct: Number(s.trueShootingPct ?? 0.56),
      }
    : null;
  const plan = stats
    ? planLeaguePlayer({
        season: SEASON,
        age,
        yearsOfExperience: yoe,
        stats,
        gamesPlayed: Number(s!.gamesPlayed ?? 0),
        seedOverallRating: p.seedOverallRating,
        seedPotentialRating: p.seedPotentialRating,
        seededContract: p.contract ?? null,
        position: p.position,
        seed: p.externalId,
      })
    : null;
  const oldPlan =
    stats &&
    generateContract({
      season: SEASON,
      overallRating: p.seedOverallRating ?? 50,
      performanceScore: oldScore(stats),
      gamesPlayed: Number(s!.gamesPlayed ?? 0),
      age,
      yearsOfExperience: yoe,
      seed: p.externalId,
    });
  return {
    p,
    age,
    yoe,
    stats,
    plan,
    oldPlan,
    team: p.teamAbbreviation,
    seedOvr: p.seedOverallRating ?? 50,
    seedPot: p.seedPotentialRating ?? 50,
    score: stats ? computePerformanceScore(stats) : 0,
    oldS: stats ? oldScore(stats) : 0,
    sal: plan ? Number(plan.contract.years[0].salaryCents) : 0,
    oldSal: oldPlan ? Number(oldPlan.years[0].salaryCents) : 0,
    yrs: plan ? plan.contract.years.length : 0,
  };
});

const { rostered } = selectTopPerTeam(
  enriched,
  (e) => e.team,
  (e) => e.seedOvr,
  DEFAULT_MAX_ROSTER_SIZE,
);
const R = enriched.filter((e) => rostered.has(e) && e.plan);

// ===========================================================================
console.log("=".repeat(78));
console.log("SECTION 2 - THE QUETA / GARZA POSTMORTEM");
console.log("=".repeat(78));
const targets = ["Neemias Queta", "Luka Garza", "Jayson Tatum", "Jaylen Brown", "Nikola Jokic"];
for (const name of targets) {
  const e = enriched.find((x) => x.p.fullName === name);
  if (!e || !e.stats) continue;
  const s = e.stats;
  const av = ageValueMultiplier(e.age);
  console.log(`\n${name}  (age ${e.age}, exp ${e.yoe}, seed OVR ${e.seedOvr})`);
  console.log(
    `  line: ${s.minutesPerGame.toFixed(1)}mpg ${s.pointsPerGame.toFixed(1)}p ${s.reboundsPerGame.toFixed(1)}r ${s.assistsPerGame.toFixed(1)}a ${s.blocksPerGame.toFixed(2)}b TS ${s.trueShootingPct.toFixed(3)}`,
  );
  const show = (tag: string, sc: number, sal: number) => {
    const frac = scoreToCapFraction(sc);
    console.log(
      `  ${tag.padEnd(9)} score ${sc.toFixed(1).padStart(5)} -> capFrac ${(frac * 100).toFixed(1).padStart(5)}% -> base ${M(CAP * frac).padStart(7)} x age ${av.toFixed(3)} = ${M(CAP * frac * av).padStart(7)}  |  after noise+scale: ${M(sal).padStart(7)}`,
    );
  };
  show("CURRENT", e.score, e.sal);
  show("OLD SCORE", e.oldS, e.oldSal);
  console.log(`  contract length: ${e.yrs}y (current code)`);
}

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("SECTION 3 - LEAGUE-WIDE SALARY DISTRIBUTION (rostered, current code)");
console.log("=".repeat(78));
const sorted = [...R].sort((a, b) => a.sal - b.sal);
const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))].sal;
const mean = sorted.reduce((s, x) => s + x.sal, 0) / sorted.length;
console.log(`n = ${sorted.length} rostered players, cap ${M(CAP)}`);
for (const [l, v] of [
  ["min", sorted[0].sal],
  ["p25", q(0.25)],
  ["median", q(0.5)],
  ["mean", mean],
  ["p75", q(0.75)],
  ["p90", q(0.9)],
  ["p95", q(0.95)],
  ["max", sorted[sorted.length - 1].sal],
] as [string, number][]) {
  console.log(`  ${l.padEnd(8)} ${M(v).padStart(8)}  ${pc(v).padStart(6)} of cap`);
}

console.log(`\n--- 25 HIGHEST PAID (current code) ---`);
console.log(
  `${"#".padStart(3)} ${"PLAYER".padEnd(24)}${"AGE".padStart(4)}${"OVR".padStart(4)}${"SCORE".padStart(7)}${"SALARY".padStart(9)}${"%CAP".padStart(7)}${"YRS".padStart(4)}`,
);
const byPay = [...R].sort((a, b) => b.sal - a.sal);
byPay.slice(0, 25).forEach((e, i) => {
  console.log(
    `${String(i + 1).padStart(3)} ${e.p.fullName.padEnd(24)}${String(e.age).padStart(4)}${String(e.seedOvr).padStart(4)}${e.score.toFixed(1).padStart(7)}${M(e.sal).padStart(9)}${pc(e.sal).padStart(7)}${String(e.yrs).padStart(4)}`,
  );
});

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("SECTION 4 - SALARY vs PLAYER QUALITY (seed OVR = what the UI shows)");
console.log("=".repeat(78));
const bands: [string, number, number][] = [
  ["superstar 90+", 90, 200],
  ["all-star 85-89", 85, 90],
  ["hi starter 80-84", 80, 85],
  ["starter 75-79", 75, 80],
  ["role 70-74", 70, 75],
  ["bench 65-69", 65, 70],
  ["fringe <65", 0, 65],
];
console.log(
  `${"BAND".padEnd(18)}${"N".padStart(4)}${"MIN".padStart(9)}${"MED".padStart(9)}${"MAX".padStart(9)}${"MED %CAP".padStart(10)}`,
);
for (const [label, lo, hi] of bands) {
  const g = R.filter((e) => e.seedOvr >= lo && e.seedOvr < hi).sort((a, b) => a.sal - b.sal);
  if (!g.length) continue;
  const med = g[Math.floor(g.length / 2)].sal;
  console.log(
    `${label.padEnd(18)}${String(g.length).padStart(4)}${M(g[0].sal).padStart(9)}${M(med).padStart(9)}${M(g[g.length - 1].sal).padStart(9)}${pc(med).padStart(10)}`,
  );
}

function corr(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}
console.log(
  `\ncorr(salary, seed OVR)         = ${corr(
    R.map((e) => e.sal),
    R.map((e) => e.seedOvr),
  ).toFixed(3)}`,
);
console.log(
  `corr(salary, perf score)       = ${corr(
    R.map((e) => e.sal),
    R.map((e) => e.score),
  ).toFixed(3)}`,
);
console.log(
  `corr(perf score, seed OVR)     = ${corr(
    R.map((e) => e.score),
    R.map((e) => e.seedOvr),
  ).toFixed(3)}`,
);
console.log(
  `corr(salary, minutes)          = ${corr(
    R.map((e) => e.sal),
    R.map((e) => e.stats!.minutesPerGame),
  ).toFixed(3)}`,
);

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("SECTION 15 - 25 WORST ANOMALIES (paid far above what seed OVR justifies)");
console.log("=".repeat(78));
// expected salary from the seed OVR the UI shows, same curve
const anomalies = R.map((e) => ({
  e,
  expected: CAP * scoreToCapFraction(e.seedOvr) * ageValueMultiplier(e.age),
})).map((x) => ({ ...x, gap: x.e.sal - x.expected }));
console.log(
  `${"#".padStart(3)} ${"PLAYER".padEnd(24)}${"OVR".padStart(4)}${"SCORE".padStart(7)}${"ACTUAL".padStart(9)}${"EXPECT".padStart(9)}${"GAP".padStart(9)}`,
);
[...anomalies]
  .sort((a, b) => b.gap - a.gap)
  .slice(0, 25)
  .forEach((x, i) => {
    console.log(
      `${String(i + 1).padStart(3)} ${x.e.p.fullName.padEnd(24)}${String(x.e.seedOvr).padStart(4)}${x.e.score.toFixed(1).padStart(7)}${M(x.e.sal).padStart(9)}${M(x.expected).padStart(9)}${("+" + M(x.gap)).padStart(9)}`,
    );
  });

console.log(`\n--- 12 MOST UNDERPAID ---`);
[...anomalies]
  .sort((a, b) => a.gap - b.gap)
  .slice(0, 12)
  .forEach((x, i) => {
    console.log(
      `${String(i + 1).padStart(3)} ${x.e.p.fullName.padEnd(24)}${String(x.e.seedOvr).padStart(4)}${x.e.score.toFixed(1).padStart(7)}${M(x.e.sal).padStart(9)}${M(x.expected).padStart(9)}${M(x.gap).padStart(9)}`,
    );
  });

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("SECTION 9 - CAP CONSTRAINT CHECK");
console.log("=".repeat(78));
const maxSal = Math.max(...R.map((e) => e.sal));
console.log(`highest generated salary        ${M(maxSal)}  (${pc(maxSal)} of cap)`);
console.log(
  `real 2025-26 max (35% cap, 10+yr) ${M(CAP * 0.35)} | 30% ${M(CAP * 0.3)} | 25% ${M(CAP * 0.25)}`,
);
console.log(`floor used by generator          ${M(Number(rules.emptyRosterChargeCents))}`);
console.log(`real veteran minimum ~            $2.1M-$3.6M`);
const atFloor = R.filter((e) => e.sal === Number(rules.emptyRosterChargeCents)).length;
console.log(`players pinned to that floor      ${atFloor}/${R.length}`);
console.log(
  `players over 25% of cap           ${R.filter((e) => e.sal / CAP > 0.25).length}  (real NBA: ~30)`,
);
console.log(
  `players over 30% of cap           ${R.filter((e) => e.sal / CAP > 0.3).length}  (real NBA: ~14)`,
);

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("SECTION 5/6/16 - SENSITIVITY SWEEPS (synthetic, one input at a time)");
console.log("=".repeat(78));
const BASE = {
  pointsPerGame: 15,
  reboundsPerGame: 5,
  assistsPerGame: 3,
  stealsPerGame: 1,
  blocksPerGame: 0.5,
  turnoversPerGame: 1.5,
  minutesPerGame: 30,
  trueShootingPct: 0.56,
};
const val = (sc: number, age: number) => CAP * scoreToCapFraction(sc) * ageValueMultiplier(age);

console.log("\nAGE sweep at fixed production (score 85):");
for (const age of [20, 23, 26, 29, 32, 35, 38]) {
  console.log(
    `  age ${String(age).padStart(2)}  mult ${ageValueMultiplier(age).toFixed(3)}  value ${M(val(85, age)).padStart(8)}`,
  );
}

console.log("\nPOTENTIAL: does it enter the salary path at all?");
console.log(
  "  generateContract inputs are (season, performanceScore, age, yearsOfExperience, seed).",
);
console.log("  potentialRating is NOT an argument -> potential has ZERO weight on salary.");

console.log("\nMINUTES sweep, holding per-game production constant (the extrapolation lever):");
for (const mpg of [10, 14, 16, 18, 20, 24, 28, 32, 36]) {
  const sc = computePerformanceScore({ ...BASE, minutesPerGame: mpg });
  const scOld = oldScore({ ...BASE, minutesPerGame: mpg });
  console.log(
    `  ${String(mpg).padStart(2)} mpg  current ${sc.toFixed(1).padStart(5)} -> ${M(val(sc, 26)).padStart(8)}   pre-fix ${scOld.toFixed(1).padStart(5)} -> ${M(val(scOld, 26)).padStart(8)}`,
  );
}

console.log("\nEFFICIENCY sweep at LOW volume (7.5 ppg, 17 mpg) - the Garza/Queta archetype:");
for (const ts of [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]) {
  const st = { ...BASE, pointsPerGame: 7.5, minutesPerGame: 17, trueShootingPct: ts };
  const sc = computePerformanceScore(st);
  const scOld = oldScore(st);
  console.log(
    `  TS ${ts.toFixed(2)}  current ${sc.toFixed(1).padStart(5)} -> ${M(val(sc, 26)).padStart(8)}   pre-fix ${scOld.toFixed(1).padStart(5)} -> ${M(val(scOld, 26)).padStart(8)}`,
  );
}

console.log("\nSCORE -> SALARY curve (the cliff check), age 26:");
for (let s = 60; s <= 99; s += 3) {
  const v = val(s, 26);
  const prev = val(s - 3, 26);
  console.log(
    `  score ${String(s).padStart(2)}  ${M(v).padStart(8)}  ${pc(v).padStart(6)}  delta/pt ${M((v - prev) / 3).padStart(7)}`,
  );
}

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("SECTION 7 - CONTRACT LENGTH AUDIT");
console.log("=".repeat(78));
console.log(
  `${"BAND".padEnd(18)}${"N".padStart(4)}${"1y".padStart(5)}${"2y".padStart(5)}${"3y".padStart(5)}${"4y".padStart(5)}${"5y".padStart(5)}${"avg".padStart(6)}`,
);
for (const [label, lo, hi] of bands) {
  const g = R.filter((e) => e.seedOvr >= lo && e.seedOvr < hi);
  if (!g.length) continue;
  const c = [1, 2, 3, 4, 5].map((y) => g.filter((e) => e.yrs === y).length);
  const avg = g.reduce((s, e) => s + e.yrs, 0) / g.length;
  console.log(
    `${label.padEnd(18)}${String(g.length).padStart(4)}${c.map((x) => String(x).padStart(5)).join("")}${avg.toFixed(1).padStart(6)}`,
  );
}
console.log(`\nOld players (33+) on 4-5 year deals:`);
const oldLong = R.filter((e) => e.age >= 33 && e.yrs >= 4);
for (const e of oldLong)
  console.log(
    `  ${e.p.fullName.padEnd(24)} age ${e.age} ovr ${e.seedOvr} score ${e.score.toFixed(1)}  ${e.yrs}y @ ${M(e.sal)}`,
  );
if (!oldLong.length) console.log("  none");

console.log(
  `\nLow-quality (ovr<70) on 3+ year deals: ${R.filter((e) => e.seedOvr < 70 && e.yrs >= 3).length}`,
);
console.log(
  `Superstars (ovr>=90) on 1-2 year deals: ${R.filter((e) => e.seedOvr >= 90 && e.yrs <= 2).length}`,
);
for (const e of R.filter((e) => e.seedOvr >= 90 && e.yrs <= 2))
  console.log(
    `  ${e.p.fullName.padEnd(24)} ovr ${e.seedOvr} age ${e.age}  ${e.yrs}y @ ${M(e.sal)}`,
  );

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("SECTION 10 - SEEDED vs GENERATED");
console.log("=".repeat(78));
const hasSeedSalary = dataset.players.some(
  (p) => p.stats && Object.keys(p).some((k) => k.toLowerCase().includes("salary")),
);
console.log(`dataset carries seeded salary data: ${hasSeedSalary}`);
console.log(`dataset keys: ${Object.keys(dataset.players[0]).join(", ")}`);
console.log(`=> every contract in a new save is GENERATED. There is no real-salary baseline.`);

// ===========================================================================
console.log("\n" + "=".repeat(78));
console.log("PRE-FIX vs CURRENT: LEAGUE IMPACT");
console.log("=".repeat(78));
const cur = R.reduce((s, e) => s + e.sal, 0);
const old = R.reduce((s, e) => s + e.oldSal, 0);
console.log(`league payroll   pre-fix ${M(old)}   current ${M(cur)}   real ~$5.10B`);
console.log(
  `players >30% cap  pre-fix ${R.filter((e) => e.oldSal / CAP > 0.3).length}   current ${R.filter((e) => e.sal / CAP > 0.3).length}`,
);
const movers = R.map((e) => ({ e, d: e.oldSal - e.sal }))
  .sort((a, b) => b.d - a.d)
  .slice(0, 15);
console.log(`\nBiggest pre-fix overpays now corrected:`);
for (const m of movers)
  console.log(
    `  ${m.e.p.fullName.padEnd(24)} ovr ${String(m.e.seedOvr).padStart(2)}  ${M(m.e.oldSal).padStart(8)} -> ${M(m.e.sal).padStart(8)}  (${M(m.d)} less)`,
  );

// ---------------------------------------------------------------------------
// Achievable salary range over all possible seeds.
//
// Real contracts are seeded by the player's cuid, which cannot be reproduced
// here, so a single replay only shows one draw from the negotiation noise.
// Sweeping the seed space gives the true interval a given score can produce -
// which is what makes it possible to say whether an observed salary could have
// come from this code at all.
// ---------------------------------------------------------------------------
console.log("\n" + "=".repeat(78));
console.log("ACHIEVABLE FIRST-YEAR SALARY RANGE OVER ALL SEEDS");
console.log(
  "(OLD SCORE = the pre-decd646 performance score run through today's pipeline,\n" +
    " not a reproduction of the old pipeline - that comparison is in git history.)",
);
console.log("=".repeat(78));
function sweep(
  label: string,
  ovr: number,
  score: number,
  gamesPlayed: number,
  age: number,
  yoe: number,
) {
  const out: number[] = [];
  const lens: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const c = generateContract({
      season: SEASON,
      overallRating: ovr,
      performanceScore: score,
      gamesPlayed,
      age,
      yearsOfExperience: yoe,
      seed: "c" + i.toString(36) + "x" + i,
    });
    out.push(Number(c.years[0].salaryCents));
    lens.push(c.years.length);
  }
  out.sort((a, b) => a - b);
  const avgLen = (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1);
  console.log(
    `${label.padEnd(28)} score ${score.toFixed(1).padStart(5)}  range ${M(out[0])} - ${M(out[out.length - 1])}   median ${M(out[Math.floor(out.length / 2)])}   avg length ${avgLen}y`,
  );
}
for (const name of ["Neemias Queta", "Luka Garza"]) {
  const e = enriched.find((x) => x.p.fullName === name);
  if (!e || !e.stats) continue;
  const gp = Number(e.p.stats!.gamesPlayed ?? 0);
  sweep(`${name} CURRENT`, e.seedOvr, e.score, gp, e.age, e.yoe);
  sweep(`${name} OLD SCORE`, e.seedOvr, e.oldS, gp, e.age, e.yoe);
}
