/**
 * Seed rating audit harness.
 *
 * Opened after docs/CONTRACT_AUDIT.md traced two "wrong salary" reports back to
 * the rating rather than the pricing: a real backup centre is rated 79, which
 * makes a top-50-veteran salary the *correct* output of a correct pricing model.
 *
 * The yardstick here is real NBA salary, which the dataset now carries. Salary
 * is not quality - the rookie scale, timing and bad deals all interfere - but a
 * veteran's market price is an independent consensus on how good he is, and it
 * is a far better anchor than anyone's opinion about who is a 79.
 *
 * Reads only. Run: npx tsx scripts/rating-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  computeSeedOverallRating,
  seedProductionScore,
  sampleConfidence,
  seedPriorFromSalary,
} from "../src/lib/data-sources/seedRating";
import { applyRatingOverride } from "../src/lib/data-sources/ratingOverrides";
import { resolvePlayerAge } from "../src/lib/players/age";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import type { CanonicalSeasonStat } from "../src/lib/data-sources/canonical";

const SEASON = 2025;
const CAP = Number(getSeasonCapRules(SEASON).salaryCapCents);
const M = (c: number) => "$" + (c / 100 / 1e6).toFixed(1) + "M";

interface Row {
  fullName: string;
  position: string | null;
  birthDate: string | null;
  draftYear: number | null;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  overrideApplied?: boolean;
  stats: Record<string, number | null> | null;
  contract?: { years: Array<{ season: number; salaryCents: number }> } | null;
}
const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };

const players = ds.players
  .filter((p) => p.stats && p.teamAbbreviation)
  .map((p) => {
    const s = p.stats!;
    const stat = {
      season: SEASON,
      team: p.teamAbbreviation!,
      gamesPlayed: Number(s.gamesPlayed ?? 0),
      minutesPerGame: Number(s.minutesPerGame ?? 0),
      pointsPerGame: Number(s.pointsPerGame ?? 0),
      reboundsPerGame: Number(s.reboundsPerGame ?? 0),
      assistsPerGame: Number(s.assistsPerGame ?? 0),
      stealsPerGame: Number(s.stealsPerGame ?? 0),
      blocksPerGame: Number(s.blocksPerGame ?? 0),
      turnoversPerGame: Number(s.turnoversPerGame ?? 0),
      trueShootingPct: s.trueShootingPct === null ? null : Number(s.trueShootingPct),
    } as CanonicalSeasonStat;
    const salaryForPrior = p.contract?.years.find((y) => y.season === SEASON)?.salaryCents ?? 0;
    const expForPrior = p.draftYear !== null ? SEASON - p.draftYear : null;
    const prior =
      (expForPrior ?? 0) >= 4 ? (seedPriorFromSalary(salaryForPrior, CAP) ?? undefined) : undefined;
    const model = computeSeedOverallRating(stat, prior);
    const override = applyRatingOverride(p.fullName, model);
    const salary = p.contract?.years.find((y) => y.season === SEASON)?.salaryCents ?? null;
    const age = resolvePlayerAge(
      { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
      SEASON,
    );
    return {
      p,
      stat,
      pos: (p.position ?? "?").toUpperCase(),
      age,
      exp: p.draftYear !== null ? SEASON - p.draftYear : null,
      model,
      shipped: p.seedOverallRating ?? model,
      overridden: override.applied,
      salary,
      conf: sampleConfidence(stat.gamesPlayed, stat.minutesPerGame),
      raw: seedProductionScore(stat),
    };
  });

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

console.log("=".repeat(78));
console.log("1 - DOES THE SHIPPED DATASET MATCH THE MODEL?");
console.log("=".repeat(78));
const mismatch = players.filter((x) => !x.overridden && x.shipped !== x.model);
console.log(
  `players: ${players.length}   overridden: ${players.filter((x) => x.overridden).length}`,
);
console.log(`non-override rows where shipped != recomputed: ${mismatch.length}`);
for (const x of mismatch.slice(0, 5))
  console.log(`  ${x.p.fullName.padEnd(24)} shipped ${x.shipped} vs model ${x.model}`);

console.log("\n" + "=".repeat(78));
console.log("2 - THE OVERRIDE LAYER IS RESCUING THE MODEL, NOT NUDGING IT");
console.log("=".repeat(78));
console.log(
  `${"PLAYER".padEnd(26)}${"GP".padStart(4)}${"MODEL".padStart(7)}${"SHIPPED".padStart(9)}${"RESCUE".padStart(8)}`,
);
const rescued = players
  .filter((x) => x.overridden)
  .sort((a, b) => b.shipped - b.model - (a.shipped - a.model));
for (const x of rescued) {
  console.log(
    `${x.p.fullName.padEnd(26)}${String(x.stat.gamesPlayed).padStart(4)}${String(x.model).padStart(7)}${String(x.shipped).padStart(9)}${(x.shipped - x.model >= 0 ? "+" : "") + (x.shipped - x.model)}`.padEnd(
      0,
    ),
  );
}
const gaps = rescued.map((x) => x.shipped - x.model);
console.log(
  `\nmean rescue ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)} points, worst ${Math.max(...gaps)}`,
);
console.log(`every override raises the rating: ${gaps.every((g) => g > 0)}`);

console.log("\n" + "=".repeat(78));
console.log("3 - SMALL-SAMPLE REGRESSION: WHAT IT COSTS, AND TO WHOM");
console.log("=".repeat(78));
console.log(
  `${"GAMES".padEnd(12)}${"N".padStart(4)}${"MEAN CONF".padStart(11)}${"MEAN RAW".padStart(10)}${"MEAN MODEL".padStart(12)}${"REGRESSED BY".padStart(14)}`,
);
for (const [label, lo, hi] of [
  ["1-15", 1, 16],
  ["16-30", 16, 31],
  ["31-45", 31, 46],
  ["46-60", 46, 61],
  ["61+", 61, 999],
] as [string, number, number][]) {
  const g = players.filter((x) => x.stat.gamesPlayed >= lo && x.stat.gamesPlayed < hi);
  if (!g.length) continue;
  const mc = g.reduce((s, x) => s + x.conf, 0) / g.length;
  const mr = g.reduce((s, x) => s + x.raw, 0) / g.length;
  const mm = g.reduce((s, x) => s + x.model, 0) / g.length;
  console.log(
    `${label.padEnd(12)}${String(g.length).padStart(4)}${mc.toFixed(2).padStart(11)}${mr.toFixed(1).padStart(10)}${mm.toFixed(1).padStart(12)}${(mm - mr).toFixed(1).padStart(14)}`,
  );
}
console.log(`
  The model has no prior. It regresses every unproven line toward a fixed 67,
  so a five-year All-NBA player who misses half a season is treated exactly
  like a rookie who has never played - which is what the override list exists
  to undo, one player at a time.`);

console.log("\n" + "=".repeat(78));
console.log("4 - EFFICIENCY IS NOT WEIGHTED BY VOLUME");
console.log("=".repeat(78));
const effOf = (x: (typeof players)[number]) => {
  const ts = x.stat.trueShootingPct ?? 0.57;
  return Math.max(-7, Math.min(7, (ts - 0.57) * 42));
};
console.log(
  `${"SCORING".padEnd(14)}${"N".padStart(4)}${"MEAN TS".padStart(10)}${"MEAN EFF PTS".padStart(14)}${"as % of gap from 74".padStart(22)}`,
);
for (const [label, lo, hi] of [
  ["under 6 ppg", 0, 6],
  ["6-10 ppg", 6, 10],
  ["10-15 ppg", 10, 15],
  ["15-20 ppg", 15, 20],
  ["20+ ppg", 20, 999],
] as [string, number, number][]) {
  const g = players.filter((x) => x.stat.pointsPerGame >= lo && x.stat.pointsPerGame < hi);
  if (!g.length) continue;
  const mts = g.reduce((s, x) => s + (x.stat.trueShootingPct ?? 0.57), 0) / g.length;
  const meff = g.reduce((s, x) => s + effOf(x), 0) / g.length;
  const mgap = g.reduce((s, x) => s + Math.abs(x.raw - 74), 0) / g.length;
  console.log(
    `${label.padEnd(14)}${String(g.length).padStart(4)}${mts.toFixed(3).padStart(10)}${meff.toFixed(2).padStart(14)}${((Math.abs(meff) / mgap) * 100).toFixed(0).padStart(21)}%`,
  );
}

console.log("\n" + "=".repeat(78));
console.log("5 - RATING vs REAL SALARY (veterans only - the market's own verdict)");
console.log("=".repeat(78));
// Rookie-scale players are underpaid by rule, so they say nothing about whether
// a rating is right. 4+ years of service is the same cutoff the pricing model
// uses to stop applying the rookie discount.
const vets = players.filter((x) => x.salary !== null && (x.exp ?? 0) >= 4);
console.log(`n = ${vets.length} veterans on a real contract`);
console.log(
  `corr(shipped rating, real salary) = ${corr(
    vets.map((x) => x.shipped),
    vets.map((x) => x.salary!),
  ).toFixed(3)}`,
);
console.log(
  `corr(model rating,   real salary) = ${corr(
    vets.map((x) => x.model),
    vets.map((x) => x.salary!),
  ).toFixed(3)}`,
);

console.log(`\n--- rated far above what the market pays ---`);
console.log(
  `${"PLAYER".padEnd(24)}${"POS".padStart(4)}${"GP".padStart(4)}${"MPG".padStart(6)}${"TS".padStart(7)}${"RATING".padStart(8)}${"REAL".padStart(9)}`,
);
const salaryRank = [...vets].sort((a, b) => b.salary! - a.salary!);
const ratingRank = [...vets].sort((a, b) => b.shipped - a.shipped);
const sR = new Map(salaryRank.map((x, i) => [x.p.fullName, i + 1]));
const rR = new Map(ratingRank.map((x, i) => [x.p.fullName, i + 1]));
const drift = vets
  .map((x) => ({ x, d: sR.get(x.p.fullName)! - rR.get(x.p.fullName)! }))
  .sort((a, b) => b.d - a.d);
for (const { x } of drift.slice(0, 15)) {
  console.log(
    `${x.p.fullName.padEnd(24)}${x.pos.padStart(4)}${String(x.stat.gamesPlayed).padStart(4)}${x.stat.minutesPerGame.toFixed(1).padStart(6)}${(x.stat.trueShootingPct ?? 0).toFixed(3).padStart(7)}${String(x.shipped).padStart(8)}${M(x.salary!).padStart(9)}   rating #${rR.get(x.p.fullName)} vs pay #${sR.get(x.p.fullName)}`,
  );
}
console.log(`\n--- rated far below what the market pays ---`);
for (const { x } of drift.slice(-8).reverse()) {
  console.log(
    `${x.p.fullName.padEnd(24)}${x.pos.padStart(4)}${String(x.stat.gamesPlayed).padStart(4)}${x.stat.minutesPerGame.toFixed(1).padStart(6)}${(x.stat.trueShootingPct ?? 0).toFixed(3).padStart(7)}${String(x.shipped).padStart(8)}${M(x.salary!).padStart(9)}   rating #${rR.get(x.p.fullName)} vs pay #${sR.get(x.p.fullName)}`,
  );
}
console.log(
  `\nmean |pay rank - rating rank| = ${(drift.reduce((s, d) => s + Math.abs(d.d), 0) / drift.length).toFixed(1)} of ${vets.length}`,
);

console.log("\n" + "=".repeat(78));
console.log("6 - POSITIONAL BIAS, MEASURED AGAINST PAY");
console.log("=".repeat(78));
console.log(
  `${"POS".padEnd(5)}${"N".padStart(4)}${"MEAN RATING".padStart(13)}${"MEAN REAL PAY".padStart(15)}${"MEAN RANK DRIFT".padStart(17)}`,
);
for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
  const g = drift.filter((d) => d.x.pos === pos);
  if (!g.length) continue;
  const mr = g.reduce((s, d) => s + d.x.shipped, 0) / g.length;
  const ms = g.reduce((s, d) => s + d.x.salary!, 0) / g.length;
  const md = g.reduce((s, d) => s + d.d, 0) / g.length;
  console.log(
    `${pos.padEnd(5)}${String(g.length).padStart(4)}${mr.toFixed(1).padStart(13)}${M(ms).padStart(15)}${(md >= 0 ? "+" : "") + md.toFixed(1).padStart(16)}`,
  );
}
console.log(`
  A positive drift means the position is rated better than the market pays it.`);

console.log("\n" + "=".repeat(78));
console.log("7 - THE SHARP TEST: max-money players rated as role players");
console.log("=".repeat(78));
// A club paying 20%+ of the cap has made a costly, public judgement about a
// player. Rating him under 80 contradicts it. Buyouts and stretch waivers move
// salary *down*, never up, so this direction has no such confound.
const richButLowRated = vets
  .filter((x) => x.salary! / CAP >= 0.2 && x.shipped < 80)
  .sort((a, b) => b.salary! - a.salary!);
console.log(
  `${"PLAYER".padEnd(24)}${"GP".padStart(4)}${"CONF".padStart(7)}${"RAW".padStart(7)}${"MODEL".padStart(7)}${"SHIPPED".padStart(9)}${"REAL PAY".padStart(10)}`,
);
for (const x of richButLowRated) {
  console.log(
    `${x.p.fullName.padEnd(24)}${String(x.stat.gamesPlayed).padStart(4)}${x.conf.toFixed(2).padStart(7)}${x.raw.toFixed(1).padStart(7)}${String(x.model).padStart(7)}${String(x.shipped).padStart(9)}${M(x.salary!).padStart(10)}`,
  );
}
console.log(`\n${richButLowRated.length} players paid 20%+ of the cap are rated under 80.`);
const injured = richButLowRated.filter((x) => x.stat.gamesPlayed < 45);
console.log(
  `${injured.length} of them played under 45 games - i.e. the regression, not the rating model, is what put them there.`,
);
console.log(
  `if the raw score were trusted instead, their mean rating would be ${(
    injured.reduce((s, x) => s + x.raw, 0) / Math.max(1, injured.length)
  ).toFixed(
    1,
  )} rather than ${(injured.reduce((s, x) => s + x.shipped, 0) / Math.max(1, injured.length)).toFixed(1)}`,
);
