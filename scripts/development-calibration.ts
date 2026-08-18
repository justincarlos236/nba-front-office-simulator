/**
 * Fits `SCOUTING_MISS_RATE`.
 *
 * docs/audits/DEVELOPMENT_AUDIT.md records three failed attempts at this, all of which
 * moved every talent band together. The middle of the draft is now correct and
 * the target is narrow: make the TOP of the draft able to fail without
 * disturbing anything that already works.
 *
 * So this sweeps against five constraints at once rather than one:
 *
 *   - pick 1 bust rate near a real 10-15%
 *   - future 80+ players per class near a real 5-8
 *   - 90+ population near 14 after twenty seasons  (MUST NOT DRAIN)
 *   - 85+ population near 44                        (currently correct)
 *   - 80+ population near 82
 *
 * The last three are the guardrails. Two previous attempts produced a plausible
 * bust rate and destroyed the star pipeline, so a candidate that improves picks
 * and craters 90+ is a failure, not a trade.
 *
 * Calls the real `developPlayerRating` through its `scoutingMissRate` seam, so
 * this measures the shipped function rather than a copy of it.
 *
 * Run: npx tsx scripts/development-calibration.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  developPlayerRating,
  developmentTraitFromId,
} from "../src/lib/development/developPlayerRating";
import { shouldRetire } from "../src/lib/development/retirement";
import { generateDraftClass } from "../src/lib/draft/generateDraftClass";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const TARGET_PICK1_BUST = 0.125;
const TARGET_CLASS_YIELD = 6.5;
const TARGET_90 = 14;
const TARGET_85 = 44;
const TARGET_80 = 82;

const SEASONS = 20;
const LEAGUE_SIZE_TARGET = 450;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Row {
  fullName: string;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  birthDate?: string | null;
  draftYear?: number | null;
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
const BASE = 2026;
const start = ds.players
  .filter((p) => rostered.has(p) && p.seedOverallRating != null)
  .map((p) => ({
    id: p.fullName,
    overall: p.seedOverallRating!,
    potential: p.seedPotentialRating ?? p.seedOverallRating!,
    age: p.birthDate
      ? BASE + 1 - new Date(p.birthDate).getFullYear()
      : p.draftYear
        ? Math.min(38, 19 + (BASE - p.draftYear))
        : 27,
  }));

function simulateLeagueOnce(missRate: number, seed: number) {
  const rng = makeRng(seed);
  let league = start.map((p) => ({ ...p }));
  let classCounter = 0;

  for (let season = 1; season <= SEASONS; season++) {
    for (const p of league) {
      p.overall = developPlayerRating({
        overallRating: p.overall,
        potentialRating: p.potential,
        age: p.age,
        rng,
        developmentTrait: developmentTraitFromId(p.id),
        scoutingMissRate: missRate,
      });
      p.age += 1;
    }
    league = league.filter((p) => !shouldRetire(p.age, p.overall, rng));
    classCounter += 1;
    for (const [i, prospect] of generateDraftClass(rng).prospects.entries()) {
      league.push({
        id: `c${classCounter}p${i}`,
        overall: prospect.overallRating,
        potential: prospect.potentialRating,
        age: prospect.age,
      });
    }
    league.sort((a, b) => b.overall - a.overall);
    if (league.length > LEAGUE_SIZE_TARGET) league = league.slice(0, LEAGUE_SIZE_TARGET);
  }

  const at = (t: number) => league.filter((p) => p.overall >= t).length;
  return { at90: at(90), at85: at(85), at80: at(80) };
}

/**
 * A single twenty-season run swings the 85+ count by around five, which is
 * larger than the differences between adjacent candidates - fitting to one run
 * is fitting to noise. Averaging over seeds is what makes the guardrails
 * readable at all.
 */
const SEEDS = [20260815, 7, 991, 40413, 66012];

function simulateLeague(missRate: number) {
  const runs = SEEDS.map((seed) => simulateLeagueOnce(missRate, seed));
  const mean = (pick: (r: (typeof runs)[number]) => number) =>
    runs.reduce((sum, r) => sum + pick(r), 0) / runs.length;
  return { at90: mean((r) => r.at90), at85: mean((r) => r.at85), at80: mean((r) => r.at80) };
}

function simulateProspects(missRate: number) {
  const rng = makeRng(555);
  let pick1Bust = 0;
  let pick1Reached80 = 0;
  const PICK1_TRIALS = 1500;
  for (let t = 0; t < PICK1_TRIALS; t++) {
    const prospect = generateDraftClass(rng).prospects[0];
    const id = `p1:${t}`;
    const trait = developmentTraitFromId(id);
    let overall = prospect.overallRating;
    for (let age = prospect.age; age <= 26; age++) {
      overall = developPlayerRating({
        overallRating: overall,
        potentialRating: prospect.potentialRating,
        age,
        rng,
        developmentTrait: trait,
        scoutingMissRate: missRate,
      });
    }
    if (overall < 75) pick1Bust += 1;
    if (overall >= 80) pick1Reached80 += 1;
  }

  const classRng = makeRng(4242);
  const CLASS_TRIALS = 150;
  let stars = 0;
  for (let t = 0; t < CLASS_TRIALS; t++) {
    for (const [i, prospect] of generateDraftClass(classRng).prospects.entries()) {
      const trait = developmentTraitFromId(`cls:${t}:${i}`);
      let overall = prospect.overallRating;
      for (let age = prospect.age; age <= 26; age++) {
        overall = developPlayerRating({
          overallRating: overall,
          potentialRating: prospect.potentialRating,
          age,
          rng: classRng,
          developmentTrait: trait,
          scoutingMissRate: missRate,
        });
      }
      if (overall >= 80) stars += 1;
    }
  }

  return {
    pick1Bust: pick1Bust / PICK1_TRIALS,
    pick1Reached80: pick1Reached80 / PICK1_TRIALS,
    classYield: stars / CLASS_TRIALS,
  };
}

console.log("=".repeat(86));
console.log("SCOUTING MISS RATE CALIBRATION");
console.log("=".repeat(86));
console.log(
  `  targets: pick-1 bust ${(TARGET_PICK1_BUST * 100).toFixed(0)}%, class yield ${TARGET_CLASS_YIELD}, ` +
    `90+ ${TARGET_90}, 85+ ${TARGET_85}, 80+ ${TARGET_80}\n`,
);
console.log(
  `${"MISS".padStart(7)}${"P1 BUST".padStart(10)}${"P1 -> 80+".padStart(11)}${"YIELD".padStart(8)}` +
    `${"90+".padStart(7)}${"85+".padStart(7)}${"80+".padStart(7)}${"ERR".padStart(9)}`,
);

let best = { missRate: 0, err: Infinity };
for (let missRate = 0; missRate <= 0.6001; missRate += 0.04) {
  const league = simulateLeague(missRate);
  const prospects = simulateProspects(missRate);
  const err =
    ((prospects.pick1Bust - TARGET_PICK1_BUST) / TARGET_PICK1_BUST) ** 2 +
    ((prospects.classYield - TARGET_CLASS_YIELD) / TARGET_CLASS_YIELD) ** 2 +
    ((league.at90 - TARGET_90) / TARGET_90) ** 2 +
    ((league.at85 - TARGET_85) / TARGET_85) ** 2 +
    ((league.at80 - TARGET_80) / TARGET_80) ** 2;
  if (err < best.err) best = { missRate, err };
  console.log(
    `${missRate.toFixed(2).padStart(7)}${((prospects.pick1Bust * 100).toFixed(1) + "%").padStart(10)}` +
      `${((prospects.pick1Reached80 * 100).toFixed(1) + "%").padStart(11)}` +
      `${prospects.classYield.toFixed(1).padStart(8)}` +
      `${league.at90.toFixed(1).padStart(7)}${league.at85.toFixed(1).padStart(7)}${league.at80.toFixed(1).padStart(7)}` +
      `${err.toFixed(3).padStart(9)}`,
  );
}

console.log(
  `\n  BEST FIT: SCOUTING_MISS_RATE = ${best.missRate.toFixed(2)}  (err ${best.err.toFixed(3)})`,
);
console.log(`  targets:  ${TARGET_90} / ${TARGET_85} / ${TARGET_80}`);
