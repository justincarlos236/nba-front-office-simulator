/**
 * Free-agency audit. Reads only; touches no database.
 *
 * The trade system was audited because it is the main way a roster changes and
 * therefore the main exploit surface. Free agency is the other way, and had no
 * audit doc. The question is the same one: can a user acquire talent for less
 * than it is worth, and does the CPU market behave like a market.
 *
 * Run: npx tsx scripts/free-agency-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { ApronLevel } from "../src/lib/cap/apron";
import {
  contractQualityScore,
  priceContractCents,
  pickContractLength,
} from "../src/lib/contracts/priceContract";
import { createSeededRandom } from "../src/lib/contracts/seededRandom";
import { validateSigning } from "../src/lib/freeagency/validateSigning";
import { evaluateFreeAgentOffer } from "../src/lib/freeagency/evaluateFreeAgentOffer";
import { getPlayerValueTier } from "../src/lib/valuation/playerValueTier";
import {
  runCpuFreeAgentPass,
  demandAdjustedPriceCents,
  type PursuableFreeAgent,
  type PursuingTeam,
} from "../src/lib/freeagency/cpuFreeAgentPass";
import { computeRivalInterest, type RivalTeam } from "../src/lib/freeagency/rivalInterest";
import type { TeamNeed } from "../src/lib/gm/teamNeeds";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const SEASON = 2026;
const rules = getSeasonCapRules(SEASON);
const usd = (cents: bigint | number) => `$${(Number(cents) / 100 / 1_000_000).toFixed(1)}M`;
const line = (n = 78) => console.log("=".repeat(n));

interface Row {
  fullName: string;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  position: string;
  birthDate?: string | null;
  draftYear?: number | null;
}
const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };

const { rostered } = selectTopPerTeam<Row>(
  dataset.players,
  (p) => p.teamAbbreviation,
  (p) => p.seedOverallRating ?? 0,
  DEFAULT_MAX_ROSTER_SIZE,
);
const players = dataset.players.filter((p) => rostered.has(p) && p.seedOverallRating != null);

const ageOf = (p: Row): number => {
  if (p.birthDate) {
    const born = new Date(p.birthDate);
    return SEASON + 1 - born.getFullYear();
  }
  return p.draftYear ? Math.min(38, 19 + (SEASON - p.draftYear)) : 27;
};
const expOf = (p: Row): number => (p.draftYear ? Math.max(0, SEASON - p.draftYear) : 4);

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
type Pos = (typeof POSITIONS)[number];
const posOf = (p: Row): Pos =>
  (POSITIONS as readonly string[]).includes(p.position.toUpperCase())
    ? (p.position.toUpperCase() as Pos)
    : "SF";

/** What a CPU club pays for this player - the same function every path uses. */
const marketPrice = (p: Row): number =>
  priceContractCents({
    season: SEASON,
    quality: contractQualityScore({
      overallRating: p.seedOverallRating!,
      performanceScore: null,
      gamesPlayed: 0,
    }),
    age: ageOf(p),
    yearsOfExperience: expOf(p),
    position: posOf(p),
  });

line();
console.log("FREE AGENCY AUDIT");
line();
console.log(`  season ${SEASON}  |  ${players.length} rostered players in the dataset`);
console.log(`  veteran minimum / empty roster charge: ${usd(rules.emptyRosterChargeCents)}\n`);

// ---------------------------------------------------------------------------
// FA-1. What does the user's signing path actually check?
// ---------------------------------------------------------------------------
line();
console.log("FA-1  WHAT THE USER PATH ENFORCES");
line();
console.log("  A minimum-salary offer is unconditionally legal (validateSigning's first");
console.log("  branch). Nothing on the user path consults the player at all - there is no");
console.log("  willingness, acceptance or market-value check anywhere in signFreeAgentAction.\n");
console.log(
  `${"RATING".padStart(7)}${"PLAYER".padStart(24)}${"MARKET PRICE".padStart(15)}${"USER CAN PAY".padStart(14)}${"DISCOUNT".padStart(11)}`,
);

const byRating = [...players].sort((a, b) => b.seedOverallRating! - a.seedOverallRating!);
const samples = [0, 4, 14, 49, 99, 199, 299].filter((i) => i < byRating.length);
let worstDiscount = 0;
for (const i of samples) {
  const p = byRating[i];
  const market = marketPrice(p);
  const min = Number(rules.emptyRosterChargeCents);
  const result = validateSigning({
    season: SEASON,
    offerSalaryCents: rules.emptyRosterChargeCents,
    team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n, signingExceptionUsedCents: 0n },
  });
  const discount = market / min;
  worstDiscount = Math.max(worstDiscount, discount);
  console.log(
    `${String(p.seedOverallRating).padStart(7)}${p.fullName.slice(0, 22).padStart(24)}` +
      `${usd(market).padStart(15)}${usd(min).padStart(14)}` +
      `${(discount.toFixed(1) + "x").padStart(11)}  ${result.isValid ? "LEGAL" : "blocked"}`,
  );
}
console.log(`\n  The offer above is made by a SECOND-APRON team with ZERO cap space - the most`);
console.log(`  constrained state in the model. It is still legal for every player listed.`);
console.log(`  Largest discount available: ${worstDiscount.toFixed(1)}x market price.`);

// ---------------------------------------------------------------------------
// FA-2. Does the CPU market clear? Who is left for the user to pick up?
// ---------------------------------------------------------------------------
line();
console.log("FA-2  DOES THE CPU MARKET CLEAR");
line();

// A plausible free-agent pool: roughly a fifth of the league reaching free
// agency, spread across the rating distribution rather than skimmed off one end.
//
// These players LEAVE their rosters. A first version of this harness kept them
// on their teams while also treating them as free agents, so every club showed
// a full 15-man roster and `computeRivalInterest` skipped all of them on the
// roster gate. That produced "0 of 90 drew interest", which read as a damning
// finding and was entirely an artefact.
const pool = players.filter((_, i) => i % 5 === 0);
const poolSet = new Set(pool);
const rivals: RivalTeam[] = [];
const pursuers: PursuingTeam[] = [];
const teamAbbrs = [...new Set(players.map((p) => p.teamAbbreviation))].filter(
  (t): t is string => t !== null,
);

/**
 * `TeamNeed` is a plain string union, not an object. The first version of this
 * harness passed `{ position, severity }` objects; `tsx` does not typecheck, so
 * that shape passed silently and `needs.includes("STAR_SCORER")` was never true
 * for anyone. Same failure mode as the invalid identity string in the trade
 * audit - a scripting harness will accept nonsense that the compiler would not.
 */
function needsOf(roster: Row[]): TeamNeed[] {
  const needs: TeamNeed[] = [];
  const best = Math.max(0, ...roster.map((p) => p.seedOverallRating ?? 0));
  if (best < 85) needs.push("STAR_SCORER");
  if (roster.filter((p) => posOf(p) === "PG").length < 2) needs.push("POINT_GUARD");
  if (roster.filter((p) => posOf(p) === "C").length < 2) needs.push("RIM_PROTECTOR");
  if (roster.filter((p) => posOf(p) === "SG" || posOf(p) === "SF").length < 4)
    needs.push("WING_DEFENDER");
  if (roster.length < 13) needs.push("BENCH_DEPTH");
  return needs;
}

for (const abbr of teamAbbrs) {
  // Players who reached free agency are off the books and off the roster.
  const roster = players.filter((p) => p.teamAbbreviation === abbr && !poolSet.has(p));
  const payroll = roster.reduce((sum, p) => sum + marketPrice(p), 0);
  const capSpace = BigInt(Math.max(0, Math.round(Number(rules.salaryCapCents) - payroll)));
  const needs = needsOf(roster);
  rivals.push({
    leagueTeamId: abbr,
    abbreviation: abbr,
    capSpaceCents: capSpace,
    needs,
    rosterCount: roster.length,
  });
  pursuers.push({
    leagueTeamId: abbr,
    identity: "PLAYOFF_TEAM",
    needs,
    personality: "BALANCED",
    rosterSize: roster.length,
    capSpaceCents: capSpace,
    financialThresholdMultiplier: 1,
  });
}

const withSpace = rivals.filter((r) => r.capSpaceCents > 0n).length;
console.log(
  `  harness check: ${rivals.length} rival teams, ${withSpace} with cap space, ` +
    `median roster ${rivals.map((r) => r.rosterCount).sort((a, b) => a - b)[Math.floor(rivals.length / 2)]}\n`,
);

const pursuable: PursuableFreeAgent[] = [];
for (const p of pool) {
  const estimatedValueCents = BigInt(Math.round(marketPrice(p)));
  const interest = computeRivalInterest(
    { position: posOf(p), overallRating: p.seedOverallRating!, estimatedValueCents },
    rivals,
  );
  if (interest.rivals.length === 0) continue;
  pursuable.push({
    leaguePlayerId: p.fullName,
    position: posOf(p),
    overallRating: p.seedOverallRating!,
    potentialRating: p.seedOverallRating!,
    age: ageOf(p),
    careerGamesMissedToInjury: 0,
    estimatedValueCents,
    years: pickContractLength(p.seedOverallRating!, ageOf(p), createSeededRandom(p.fullName)),
    interestedTeamIds: interest.rivals.map((r) => r.leagueTeamId),
  });
}

const signings = runCpuFreeAgentPass(pursuable, pursuers, SEASON);
const signedNames = new Set(signings.map((s) => s.leaguePlayerId));
const unsigned = pool.filter((p) => !signedNames.has(p.fullName));

console.log(`  free-agent pool:      ${pool.length}`);
console.log(`  drew rival interest:  ${pursuable.length}`);
console.log(`  actually signed:      ${signings.length}`);
console.log(`  left unsigned:        ${unsigned.length}\n`);

const band = (lo: number, hi: number) => {
  const inBand = pool.filter((p) => p.seedOverallRating! >= lo && p.seedOverallRating! < hi);
  const left = inBand.filter((p) => !signedNames.has(p.fullName));
  return { total: inBand.length, left: left.length };
};
console.log(
  `${"RATING BAND".padStart(14)}${"IN POOL".padStart(10)}${"UNSIGNED".padStart(11)}${"LEFT FOR USER".padStart(15)}`,
);
for (const [lo, hi, label] of [
  [85, 100, "85+ (stars)"],
  [80, 85, "80-84"],
  [75, 80, "75-79"],
  [70, 75, "70-74"],
  [0, 70, "under 70"],
] as [number, number, string][]) {
  const b = band(lo, hi);
  const pct = b.total > 0 ? ((b.left / b.total) * 100).toFixed(0) : "-";
  console.log(
    `${label.padStart(14)}${String(b.total).padStart(10)}${String(b.left).padStart(11)}${(pct + "%").padStart(15)}`,
  );
}

const bestUnsigned = [...unsigned].sort((a, b) => b.seedOverallRating! - a.seedOverallRating!)[0];
if (bestUnsigned) {
  console.log(
    `\n  best player the CPU left on the table: ${bestUnsigned.fullName} (${bestUnsigned.seedOverallRating})`,
  );
  console.log(
    `    market ${usd(marketPrice(bestUnsigned))}  ->  user pays ${usd(rules.emptyRosterChargeCents)}` +
      `  (${(marketPrice(bestUnsigned) / Number(rules.emptyRosterChargeCents)).toFixed(1)}x discount)`,
  );
}

// ---------------------------------------------------------------------------
// FA-3. Does competition move the price?
// ---------------------------------------------------------------------------
line();
console.log("FA-3  DOES COMPETITION MOVE THE PRICE");
line();
// Deliberately a mid-tier player. A first version used a top-20 player, whose
// base price already sits at the individual maximum - so `clampToMaxSalary`
// ate the entire premium and the table read "0% at every suitor count", which
// looked like competition doing nothing. It is doing nothing THERE, which is
// correct and is its own finding, but it is not the general case.
const REFERENCE_INDEX = 180;
const referencePlayer = byRating[REFERENCE_INDEX];
const referenceValue = BigInt(Math.round(marketPrice(referencePlayer)));
console.log(
  `  reference player: ${byRating[20].fullName} (${byRating[20].seedOverallRating}), base ${usd(referenceValue)}\n`,
);
console.log(`${"SUITORS".padStart(9)}${"PRICE".padStart(12)}${"PREMIUM".padStart(11)}`);
for (const suitors of [1, 2, 3, 4, 5, 8, 12]) {
  const price = demandAdjustedPriceCents(referenceValue, suitors, ageOf(referencePlayer), SEASON);
  const premium = (Number(price) / Number(referenceValue) - 1) * 100;
  console.log(
    `${String(suitors).padStart(9)}${usd(price).padStart(12)}${(premium.toFixed(0) + "%").padStart(11)}`,
  );
}

const star = byRating[20];
const starBase = BigInt(Math.round(marketPrice(star)));
const starAt1 = demandAdjustedPriceCents(starBase, 1, ageOf(star), SEASON);
const starAt8 = demandAdjustedPriceCents(starBase, 8, ageOf(star), SEASON);
console.log(`
  At the top of the market the premium is absorbed by the individual maximum:`);
console.log(
  `    ${star.fullName} (${star.seedOverallRating}) base ${usd(starBase)} -> 1 suitor ${usd(starAt1)}, 8 suitors ${usd(starAt8)}`,
);
console.log(
  `    ${starAt1 === starAt8 ? "identical - competition cannot move a max player's price" : "premium survives the cap"}`,
);

// ---------------------------------------------------------------------------
// FA-4. Contract escalation on the user path
// ---------------------------------------------------------------------------
line();
console.log("FA-4  USER CONTRACT ESCALATION");
line();
console.log("  signFreeAgentAction hard-codes +5% per year, for every player and every deal.\n");
const base = Number(rules.emptyRosterChargeCents);
console.log(`${"YEAR".padStart(6)}${"SALARY".padStart(12)}`);
for (let i = 0; i < 4; i++) {
  console.log(`${String(i + 1).padStart(6)}${usd(base * (1 + 0.05 * i)).padStart(12)}`);
}
console.log(`\n  Real CBA raises are 5% (Bird) or 8% (max) of the FIRST-year salary, so the`);
console.log(`  linear shape is right. It is applied to minimum deals too, where real`);
console.log(`  minimum contracts are flat by scale, but the amounts are trivial.`);

// ---------------------------------------------------------------------------
// FA-5. Verification: is the minimum-salary exploit closed?
// ---------------------------------------------------------------------------
line();
console.log("FA-5  VERIFICATION - MINIMUM OFFER AFTER THE FIX");
line();
console.log("  Same players, same minimum offer, now through evaluateFreeAgentOffer.\n");
console.log(
  `${"RATING".padStart(7)}${"PLAYER".padStart(24)}${"SUITORS".padStart(9)}${"HE WANTS".padStart(12)}${"MIN OFFER".padStart(12)}${"RESULT".padStart(10)}`,
);
let stillExploitable = 0;
for (const i of samples) {
  const p = byRating[i];
  const base = BigInt(Math.round(marketPrice(p)));
  // Worst case for the fix: nobody else is bidding, the most favourable
  // possible market for a user trying to underpay.
  const suitors = 0;
  const ask = demandAdjustedPriceCents(base, suitors, ageOf(p), SEASON);
  const d = evaluateFreeAgentOffer({
    askingPriceCents: ask,
    offerSalaryCents: rules.emptyRosterChargeCents,
    rivalSuitors: suitors,
    valueTier: getPlayerValueTier(p.seedOverallRating!),
    minimumSalaryCents: rules.emptyRosterChargeCents,
  });
  if (d.accepted && marketPrice(p) > Number(rules.emptyRosterChargeCents) * 3) stillExploitable++;
  console.log(
    `${String(p.seedOverallRating).padStart(7)}${p.fullName.slice(0, 22).padStart(24)}` +
      `${String(suitors).padStart(9)}${usd(d.requiredSalaryCents).padStart(12)}` +
      `${usd(rules.emptyRosterChargeCents).padStart(12)}` +
      `${(d.accepted ? "SIGNS" : "refuses").padStart(10)}`,
  );
}
console.log(`
  players still signable at the minimum for >3x their value: ${stillExploitable}`);
console.log(
  `  (a fringe player with no suitors SHOULD accept the minimum - that is roster filling)`,
);

line();
console.log("Reproduce: npx tsx scripts/free-agency-audit.ts");
line();
