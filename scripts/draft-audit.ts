/**
 * Draft audit. Reads only; touches no database.
 *
 * The third way a roster changes, after trades and free agency. It matters
 * beyond the draft itself because `computeDraftPickTradeValue` prices picks
 * for every trade - if the pick curve is wrong, the trade system inherits it.
 *
 * Run: npx tsx scripts/draft-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { runLottery, LOTTERY_ODDS, type LotteryTeam } from "../src/lib/draft/draftLottery";
import {
  generateDraftClass,
  CLASS_SIZE,
  expectedRatingForPick,
  expectedPotentialForPick,
  OVERALL_AT_PICK_1,
  OVERALL_AT_PICK_60,
  POTENTIAL_AT_PICK_1,
  POTENTIAL_AT_PICK_60,
} from "../src/lib/draft/generateDraftClass";
import { computeDraftPickTradeValue } from "../src/lib/gm/draftPickTradeValue";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const SEASON = 2026;
const usd = (cents: bigint | number) => `$${(Number(cents) / 100 / 1_000_000).toFixed(1)}M`;
const line = (n = 78) => console.log("=".repeat(n));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Deterministic RNG so every number here reproduces exactly. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

line();
console.log("DRAFT AUDIT");
line();

// ---------------------------------------------------------------------------
// D-1. Does the lottery reproduce the published odds?
// ---------------------------------------------------------------------------
line();
console.log("D-1  LOTTERY ODDS FIDELITY");
line();
console.log("  draftLottery.ts calls LOTTERY_ODDS 'real, published data, not an");
console.log("  approximation', and approximates the MECHANISM with a weighted draw");
console.log("  without replacement. Whether that reproduces the odds is measurable.\n");

const TRIALS = 200_000;
const teams: LotteryTeam[] = Array.from({ length: 14 }, (_, i) => ({
  leagueTeamId: `S${i + 1}`,
  seed: i + 1,
}));

const firstPick = new Map<string, number>();
const topFour = new Map<string, number>();
const rng = makeRng(20260814);
for (let t = 0; t < TRIALS; t++) {
  const order = runLottery(teams, rng);
  firstPick.set(order[0], (firstPick.get(order[0]) ?? 0) + 1);
  for (let i = 0; i < 4; i++) topFour.set(order[i], (topFour.get(order[i]) ?? 0) + 1);
}

/**
 * Real published NBA probabilities of receiving the number one pick, and of
 * landing anywhere in the top four, by lottery seed.
 */
const REAL_TOP_FOUR: Record<number, number> = {
  1: 0.521, 2: 0.521, 3: 0.521, 4: 0.482, 5: 0.423, 6: 0.375, 7: 0.319,
  8: 0.265, 9: 0.203, 10: 0.139, 11: 0.094, 12: 0.071, 13: 0.048, 14: 0.024,
};

console.log(
  `${"SEED".padStart(6)}${"P(#1) SIM".padStart(12)}${"P(#1) REAL".padStart(12)}${"P(TOP4) SIM".padStart(13)}${"P(TOP4) REAL".padStart(14)}${"TOP4 ERR".padStart(11)}`,
);
let worstTopFourError = 0;
let worstFirstError = 0;
for (const team of teams) {
  const simFirst = (firstPick.get(team.leagueTeamId) ?? 0) / TRIALS;
  const simTop4 = (topFour.get(team.leagueTeamId) ?? 0) / TRIALS;
  const realFirst = LOTTERY_ODDS[team.seed];
  const realTop4 = REAL_TOP_FOUR[team.seed];
  const errTop4 = simTop4 - realTop4;
  worstTopFourError = Math.max(worstTopFourError, Math.abs(errTop4));
  worstFirstError = Math.max(worstFirstError, Math.abs(simFirst - realFirst));
  console.log(
    `${String(team.seed).padStart(6)}${pct(simFirst).padStart(12)}${pct(realFirst).padStart(12)}` +
      `${pct(simTop4).padStart(13)}${pct(realTop4).padStart(14)}` +
      `${((errTop4 >= 0 ? "+" : "") + (errTop4 * 100).toFixed(1) + "pp").padStart(11)}`,
  );
}
console.log(`\n  worst error on P(#1):    ${(worstFirstError * 100).toFixed(2)}pp`);
console.log(`  worst error on P(top 4): ${(worstTopFourError * 100).toFixed(1)}pp`);

// ---------------------------------------------------------------------------
// D-2. Does a draft class beat the league it joins?
// ---------------------------------------------------------------------------
line();
console.log("D-2  CLASS QUALITY VS THE LEAGUE");
line();
console.log("  DEVELOPMENT_AUDIT D-P0-2: a linear potential curve made every intake");
console.log("  better than the population, drifting the league to 221 players at 80+.");
console.log("  POTENTIAL_FALLOFF_EXPONENT was the fix; this measures where it landed.\n");

interface Row {
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
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
const leaguePlayers = ds.players.filter((p) => rostered.has(p) && p.seedOverallRating != null);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const classRng = makeRng(7);
const allProspects = Array.from({ length: 200 }, () => generateDraftClass(classRng).prospects).flat();

const leagueOverall = leaguePlayers.map((p) => p.seedOverallRating!);
const leaguePotential = leaguePlayers.map((p) => p.seedPotentialRating ?? p.seedOverallRating!);
const classOverall = allProspects.map((p) => p.overallRating);
const classPotential = allProspects.map((p) => p.potentialRating);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

console.log(`${"".padStart(22)}${"CLASS".padStart(10)}${"LEAGUE".padStart(10)}`);
console.log(`${"mean overall".padStart(22)}${mean(classOverall).toFixed(1).padStart(10)}${mean(leagueOverall).toFixed(1).padStart(10)}`);
console.log(`${"median overall".padStart(22)}${median(classOverall).toFixed(1).padStart(10)}${median(leagueOverall).toFixed(1).padStart(10)}`);
console.log(`${"mean potential".padStart(22)}${mean(classPotential).toFixed(1).padStart(10)}${mean(leaguePotential).toFixed(1).padStart(10)}`);
console.log(`${"median potential".padStart(22)}${median(classPotential).toFixed(1).padStart(10)}${median(leaguePotential).toFixed(1).padStart(10)}`);
const classAt80 = classPotential.filter((p) => p >= 80).length / allProspects.length;
const leagueAt80 = leaguePotential.filter((p) => p >= 80).length / leaguePlayers.length;
console.log(`${"share potential 80+".padStart(22)}${pct(classAt80).padStart(10)}${pct(leagueAt80).padStart(10)}`);
console.log(
  `\n  A class of ${CLASS_SIZE} enters a league of ~${leaguePlayers.length}. Intake at or below the`,
);
console.log(`  population is the sustainable condition; above it, the league inflates.`);

// ---------------------------------------------------------------------------
// D-3. The pick value curve
// ---------------------------------------------------------------------------
line();
console.log("D-3  PICK TRADE VALUE");
line();
const valueAt = (pick: number, round: 1 | 2 = 1) =>
  computeDraftPickTradeValue({
    currentSeason: SEASON,
    pickSeason: SEASON,
    round,
    overallPickNumber: pick,
    originalTeamCompetitivenessPercentile: 0.5,
  });

console.log(`${"PICK".padStart(6)}${"VALUE".padStart(12)}${"VS PICK 30".padStart(13)}${"EXP OVR".padStart(10)}${"EXP POT".padStart(10)}`);
const v30 = Number(valueAt(30));
for (const pick of [1, 3, 5, 10, 14, 20, 30, 40, 50, 60]) {
  const v = Number(valueAt(pick));
  console.log(
    `${String(pick).padStart(6)}${usd(v).padStart(12)}${((v / v30).toFixed(2) + "x").padStart(13)}` +
      `${expectedRatingForPick(pick, OVERALL_AT_PICK_1, OVERALL_AT_PICK_60).toFixed(1).padStart(10)}` +
      `${expectedPotentialForPick(pick, POTENTIAL_AT_PICK_1, POTENTIAL_AT_PICK_60).toFixed(1).padStart(10)}`,
  );
}
console.log(`\n  docs/TRADE_AUDIT.md calibrated the value curve to a market anchor of`);
console.log(`  #1 pick = 8x #30. Measured here: ${(Number(valueAt(1)) / v30).toFixed(2)}x.`);

// ---------------------------------------------------------------------------
// D-4. Future picks: the projection ignores the lottery
// ---------------------------------------------------------------------------
line();
console.log("D-4  FUTURE PICK PROJECTION VS THE ACTUAL LOTTERY");
line();
console.log("  projectedPickNumber maps competitiveness linearly to a slot and is");
console.log("  documented as ignoring lottery randomness. This measures the cost.\n");

// Where does the worst team's pick actually land, under this very lottery?
const landedAt = new Map<number, number>();
const rng2 = makeRng(99);
for (let t = 0; t < TRIALS; t++) {
  const order = runLottery(teams, rng2);
  const slot = order.indexOf("S1") + 1;
  landedAt.set(slot, (landedAt.get(slot) ?? 0) + 1);
}
let expectedSlot = 0;
let expectedValue = 0;
for (const [slot, count] of landedAt) {
  const p = count / TRIALS;
  expectedSlot += slot * p;
  expectedValue += Number(valueAt(slot)) * p;
}
// The real path: no known slot, worst team. Measures what the code actually
// does rather than re-implementing the projection here.
const projectedValue = Number(
  computeDraftPickTradeValue({
    currentSeason: SEASON,
    pickSeason: SEASON,
    round: 1,
    overallPickNumber: null,
    originalTeamCompetitivenessPercentile: 0,
  }),
);
console.log(`  worst team (percentile 0):`);
console.log(`    projected value comes from computeDraftPickTradeValue itself`);
console.log(`    actual expected slot      ${expectedSlot.toFixed(2)}`);
console.log(`    P(actually gets pick 1)   ${pct((landedAt.get(1) ?? 0) / TRIALS)}`);
console.log(`    value at projected slot   ${usd(projectedValue)}`);
console.log(`    true expected value       ${usd(expectedValue)}`);
console.log(
  `    OVERVALUED BY            ${(((projectedValue - expectedValue) / expectedValue) * 100).toFixed(1)}%`,
);

line();
console.log("Reproduce: npx tsx scripts/draft-audit.ts");
line();
