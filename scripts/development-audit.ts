/**
 * Player development audit harness.
 *
 * `developPlayerRating` governs every rating after season one, so it decides
 * more of a long save than any model this project has audited. The existing
 * 20-season invariant test (`longSave.invariant.test.ts`) guards headcount,
 * retirement volume, median age and *median* rating drift - but a median can
 * hold perfectly while every star disappears, which would leave a league of 450
 * interchangeable role players and a median that never moved.
 *
 * This measures the top of the distribution instead, starting from the real
 * seeded league rather than a synthetic pyramid.
 *
 * Reads only. Run: npx tsx scripts/development-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { developPlayerRating } from "../src/lib/development/developPlayerRating";
import { shouldRetire } from "../src/lib/development/retirement";
import {
  OVERALL_AT_PICK_1,
  OVERALL_AT_PICK_60,
  POTENTIAL_AT_PICK_1,
  POTENTIAL_AT_PICK_60,
  expectedRatingForPick,
} from "../src/lib/draft/generateDraftClass";
import { resolvePlayerAge } from "../src/lib/players/age";

const SEASON = 2025;
const SEASONS = 20;
const CLASS_SIZE = 60;
const LEAGUE_SIZE = 450; // 30 x 15

interface Row {
  fullName: string;
  birthDate: string | null;
  draftYear: number | null;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  stats: Record<string, number | null> | null;
}
const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };

interface P {
  name: string;
  ovr: number;
  pot: number;
  age: number;
}

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function seededLeague(): P[] {
  return ds.players
    .filter((p) => p.teamAbbreviation && p.seedOverallRating)
    .map((p) => ({
      name: p.fullName,
      ovr: p.seedOverallRating!,
      pot: p.seedPotentialRating ?? p.seedOverallRating!,
      age: resolvePlayerAge(
        { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
        SEASON,
      ),
    }))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, LEAGUE_SIZE);
}

function draftClass(rng: () => number, year: number): P[] {
  const out: P[] = [];
  for (let pick = 1; pick <= CLASS_SIZE; pick++) {
    const o = Math.round(expectedRatingForPick(pick, OVERALL_AT_PICK_1, OVERALL_AT_PICK_60));
    const pt = Math.round(expectedRatingForPick(pick, POTENTIAL_AT_PICK_1, POTENTIAL_AT_PICK_60));
    const ov = Math.max(60, Math.min(99, o + Math.floor(rng() * 13) - 6));
    const pv = Math.max(ov, Math.min(99, pt + Math.floor(rng() * 13) - 6));
    out.push({ name: `R${year}-${pick}`, ovr: ov, pot: pv, age: 19 + Math.floor(rng() * 4) });
  }
  return out;
}

interface Snapshot {
  season: number;
  n: number;
  p90: number;
  p85: number;
  p80: number;
  max: number;
  top10: number;
  median: number;
  medianAge: number;
  retired: number;
}

function run(seed: number): Snapshot[] {
  const rng = makeRng(seed);
  let league = seededLeague();
  const snaps: Snapshot[] = [];

  const snap = (season: number, retired: number): Snapshot => {
    const r = [...league].sort((a, b) => b.ovr - a.ovr);
    const ages = [...league].map((p) => p.age).sort((a, b) => a - b);
    return {
      season,
      n: league.length,
      p90: r.filter((p) => p.ovr >= 90).length,
      p85: r.filter((p) => p.ovr >= 85).length,
      p80: r.filter((p) => p.ovr >= 80).length,
      max: r[0]?.ovr ?? 0,
      top10: r.slice(0, 10).reduce((s, p) => s + p.ovr, 0) / 10,
      median: r[Math.floor(r.length / 2)]?.ovr ?? 0,
      medianAge: ages[Math.floor(ages.length / 2)] ?? 0,
      retired,
    };
  };

  snaps.push(snap(0, 0));

  for (let year = 1; year <= SEASONS; year++) {
    // Develop, then age.
    for (const p of league) {
      p.ovr = developPlayerRating({
        overallRating: p.ovr,
        potentialRating: p.pot,
        age: p.age,
        rng,
      });
      p.age += 1;
    }
    const before = league.length;
    league = league.filter((p) => !shouldRetire(p.age, p.ovr, rng));
    const retired = before - league.length;

    league.push(...draftClass(rng, year));
    // Only the best survive to a roster spot, which is what a 15-man limit does.
    league = league.sort((a, b) => b.ovr - a.ovr).slice(0, LEAGUE_SIZE);

    snaps.push(snap(year, retired));
  }
  return snaps;
}

// Average across seeds so a single unlucky run is not mistaken for a trend.
const RUNS = 12;
const all = Array.from({ length: RUNS }, (_, i) => run(i + 1));
const avg = (year: number, key: keyof Snapshot) =>
  all.reduce((s, run) => s + (run[year][key] as number), 0) / RUNS;

console.log("=".repeat(78));
console.log(`LEAGUE TALENT OVER ${SEASONS} SEASONS (mean of ${RUNS} runs, real seeded start)`);
console.log("=".repeat(78));
console.log(
  `${"SEASON".padStart(7)}${"90+".padStart(7)}${"85+".padStart(7)}${"80+".padStart(7)}${"MAX".padStart(7)}${"TOP10".padStart(8)}${"MEDIAN".padStart(8)}${"MED AGE".padStart(9)}${"RETIRED".padStart(9)}`,
);
for (const y of [0, 1, 2, 3, 5, 8, 10, 15, 20]) {
  console.log(
    `${String(y).padStart(7)}${avg(y, "p90").toFixed(1).padStart(7)}${avg(y, "p85").toFixed(1).padStart(7)}${avg(y, "p80").toFixed(1).padStart(7)}${avg(y, "max").toFixed(1).padStart(7)}${avg(y, "top10").toFixed(1).padStart(8)}${avg(y, "median").toFixed(1).padStart(8)}${avg(y, "medianAge").toFixed(1).padStart(9)}${avg(y, "retired").toFixed(1).padStart(9)}`,
  );
}
console.log(`
  Real NBA, for reference: about 14 players at 90+, 44 at 85+, 82 at 80+,
  and a best player around 98-99.`);

console.log("\n" + "=".repeat(78));
console.log("STAR LONGEVITY - how long does a 95 stay elite?");
console.log("=".repeat(78));
const rng2 = makeRng(99);
console.log(`${"AGE".padStart(5)}${"MEAN RATING".padStart(13)}${"still 90+".padStart(11)}`);
for (const startAge of [27]) {
  const N = 400;
  const cohort = Array.from({ length: N }, () => ({ ovr: 95, pot: 95, age: startAge }));
  for (let step = 0; step <= 12; step++) {
    if (step > 0) {
      for (const p of cohort) {
        p.ovr = developPlayerRating({
          overallRating: p.ovr,
          potentialRating: p.pot,
          age: p.age,
          rng: rng2,
        });
        p.age += 1;
      }
    }
    const mean = cohort.reduce((s, p) => s + p.ovr, 0) / cohort.length;
    const elite = cohort.filter((p) => p.ovr >= 90).length;
    console.log(
      `${String(startAge + step).padStart(5)}${mean.toFixed(1).padStart(13)}${((elite / cohort.length) * 100).toFixed(0).padStart(10)}%`,
    );
  }
}
console.log(`
  Decline is absolute, not proportional: a 99 and a 70 both lose the same
  1-3 points at age 30. Real elite players decline far more slowly than
  replacement-level ones do.`);

console.log("\n" + "=".repeat(78));
console.log("DO PROSPECTS EVER BUST?");
console.log("=".repeat(78));
const rng3 = makeRng(4242);
console.log(
  `${"DRAFTED AT".padEnd(22)}${"N".padStart(5)}${"REACHED POT".padStart(13)}${"BUSTED (<+3)".padStart(14)}${"MEAN AT 26".padStart(12)}`,
);
for (const [label, ovr, pot] of [
  ["pick 1  (72 / 97)", 72, 97],
  ["pick 15 (69 / 90)", 69, 90],
  ["pick 30 (67 / 83)", 67, 83],
  ["pick 60 (62 / 70)", 62, 70],
] as [string, number, number][]) {
  const N = 500;
  const finals: number[] = [];
  for (let i = 0; i < N; i++) {
    let r = ovr;
    for (let age = 20; age <= 26; age++) {
      r = developPlayerRating({
        overallRating: r,
        potentialRating: pot,
        age,
        rng: rng3,
      });
    }
    finals.push(r);
  }
  const reached = finals.filter((f) => f >= pot).length;
  const busted = finals.filter((f) => f < ovr + 3).length;
  console.log(
    `${label.padEnd(22)}${String(N).padStart(5)}${((reached / N) * 100).toFixed(0).padStart(12)}%${((busted / N) * 100).toFixed(0).padStart(13)}%${(finals.reduce((a, b) => a + b, 0) / N).toFixed(1).padStart(12)}`,
  );
}
console.log(`
  Growth is randomIntInclusive(rng, 1, ...) and then Math.max(1, ...), so the
  floor is +1 every season. A young player cannot fail to develop, cannot
  stagnate, and cannot regress. Every prospect marches to his ceiling.`);
