/**
 * Adversarial audit, dynamic half: free-agency market logic, cap-space
 * behaviour, CPU self-bidding, multi-season cap/salary drift, team payroll
 * distribution. Reads only.
 *
 * Pairs with scripts/salary-system-audit.ts.
 *
 * Run: npx tsx scripts/salary-market-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import { contractQualityScore, priceContractCents } from "../src/lib/contracts/priceContract";
import { demandAdjustedPriceCents } from "../src/lib/freeagency/cpuFreeAgentPass";
import { evaluateFreeAgentOffer } from "../src/lib/freeagency/evaluateFreeAgentOffer";
import { computeRivalInterest, type RivalTeam } from "../src/lib/freeagency/rivalInterest";
import { validateSigning } from "../src/lib/freeagency/validateSigning";
import { ApronLevel } from "../src/lib/cap/apron";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { veteranMinimumCents } from "../src/lib/cap/veteranMinimum";
import { getPlayerValueTier } from "../src/lib/valuation/playerValueTier";
import { computeTeamNeeds } from "../src/lib/gm/teamNeeds";
import {
  developPlayerRating,
  developmentTraitFromId,
} from "../src/lib/development/developPlayerRating";
import { shouldRetire } from "../src/lib/development/retirement";
import { generateDraftClass } from "../src/lib/draft/generateDraftClass";
import { resolvePlayerAge, resolvePlayerExperience } from "../src/lib/players/age";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const usd = (c: number) => `$${(c / 1e8).toFixed(1)}M`;
const line = (n = 96) => console.log("=".repeat(n));
const h = (t: string) => {
  line();
  console.log(t);
  line();
};

const BASE = 2026;
const q = (ovr: number) =>
  contractQualityScore({ overallRating: ovr, performanceScore: null, gamesPlayed: 0 });
const price = (ovr: number, season = BASE, age = 27, exp = 7) =>
  priceContractCents({ season, quality: q(ovr), age, yearsOfExperience: exp, position: "SF" });

// --------------------------------------------------------------- 11. DEMAND
h("11. DOES COMPETITION MOVE PRICE");
for (const ovr of [72, 82, 90]) {
  const base = BigInt(price(ovr));
  const row = [1, 2, 3, 5, 10].map((n) => demandAdjustedPriceCents(base, n, 27, BASE, 7));
  console.log(
    `  OVR ${ovr}  base ${usd(Number(base)).padStart(9)}  |  ` +
      [1, 2, 3, 5, 10].map((n, i) => `${n}: ${usd(Number(row[i]))}`).join("  "),
  );
}
console.log(
  `\n  premium is 8% per extra suitor, capped at 32% (PREMIUM_PER_RIVAL / MAX_DEMAND_PREMIUM)`,
);

// --------------------------------------------------------------- 12. CAP SPACE
h("12. DOES CAP SPACE FEED INTO PRICE (the overpay exploit)");
const askFor = (ovr: number) => BigInt(price(ovr));
console.log(`  A player's ask is computed from rating/age/position only. Team room is`);
console.log(`  never an input to priceContractCents or demandAdjustedPriceCents.\n`);
console.log(
  `  ${"TEAM ROOM".padStart(12)}${"PLAYER ASK".padStart(13)}${"WOULD ACCEPT MIN?".padStart(20)}`,
);
for (const room of [5, 25, 60]) {
  const ask = askFor(85);
  const d = evaluateFreeAgentOffer({
    askingPriceCents: ask,
    offerSalaryCents: BigInt(veteranMinimumCents(BASE, 7)),
    rivalSuitors: 0,
    valueTier: getPlayerValueTier(85),
    minimumSalaryCents: veteranMinimumCents(BASE, 7),
  });
  console.log(
    `  ${`$${room}M`.padStart(12)}${usd(Number(ask)).padStart(13)}${(d.accepted ? "YES" : "no").padStart(20)}`,
  );
}

// --------------------------------------------------------------- 13. SELF-BIDDING
h("13. CPU SELF-BIDDING / RUNAWAY");
console.log(`  computeRivalInterest gates on capSpace >= ask AND roster < 15, so a club`);
console.log(`  with no room is never counted as a suitor and cannot bid a price up.\n`);
const rivals: RivalTeam[] = Array.from({ length: 29 }, (_, i) => ({
  leagueTeamId: `T${i}`,
  abbreviation: `T${i}`,
  capSpaceCents: BigInt(Math.round(60_000_000_00 * (i / 28))),
  needs: computeTeamNeeds([]),
  rosterCount: 12,
}));
for (const ovr of [78, 88]) {
  const ask = askFor(ovr);
  const interest = computeRivalInterest(
    { position: "SF", overallRating: ovr, estimatedValueCents: ask },
    rivals,
  );
  const final = demandAdjustedPriceCents(ask, interest.rivals.length, 27, BASE, 7);
  console.log(
    `  OVR ${ovr}: ask ${usd(Number(ask))}, ${interest.rivals.length} of 29 clubs can afford him, final ${usd(Number(final))} (+${((Number(final) / Number(ask) - 1) * 100).toFixed(0)}%)`,
  );
}

// --------------------------------------------------------------- 27. USER EXPLOITS
h("27. USER EXPLOIT PROBES");
const probe = (label: string, ovr: number, exp: number, offerCents: number, suitors: number) => {
  const ask = demandAdjustedPriceCents(BigInt(price(ovr, BASE, 27, exp)), suitors, 27, BASE, exp);
  const d = evaluateFreeAgentOffer({
    askingPriceCents: ask,
    offerSalaryCents: BigInt(offerCents),
    rivalSuitors: suitors,
    valueTier: getPlayerValueTier(ovr),
    minimumSalaryCents: veteranMinimumCents(BASE, exp),
  });
  const legal = validateSigning({
    season: BASE,
    offerSalaryCents: BigInt(offerCents),
    yearsOfExperience: exp,
    team: { apronLevel: ApronLevel.SECOND_APRON, capSpaceCents: 0n },
  });
  console.log(
    `  ${label.padEnd(46)}${(legal.isValid ? "legal" : "illegal").padStart(9)}${(d.accepted ? "  ACCEPTS" : "  refuses").padStart(10)}   he wants ${usd(Number(d.requiredSalaryCents))}`,
  );
};
const minFor = (exp: number) => Number(veteranMinimumCents(BASE, exp));
probe("sign a 90 for the veteran minimum, 0 rivals", 90, 8, minFor(8), 0);
probe("sign an 82 for the veteran minimum, 0 rivals", 82, 8, minFor(8), 0);
probe("sign a 68 fringe for the minimum, 0 rivals", 68, 8, minFor(8), 0);
probe("sign a 90 at 60% of ask, 0 rivals", 90, 8, Math.round(price(90) * 0.6), 0);
probe("sign a 90 at 60% of ask, 5 rivals", 90, 8, Math.round(price(90) * 0.6), 5);

// --------------------------------------------------------------- 22/23. LONG SAVE
h("22 & 23. CAP GROWTH VS SALARY GROWTH");
console.log(
  `  ${"SEASON".padStart(8)}${"CAP".padStart(10)}${"MAX (35%)".padStart(12)}${"MIN (10y)".padStart(12)}${"OVR-82 PRICE".padStart(14)}${"PRICE/CAP".padStart(11)}`,
);
for (const offset of [0, 2, 4, 9]) {
  const season = BASE + offset;
  const c = Number(getSeasonCapRules(season).salaryCapCents);
  const p82 = price(82, season);
  console.log(
    `  ${String(season).padStart(8)}${usd(c).padStart(10)}${usd(c * 0.35).padStart(12)}${usd(Number(veteranMinimumCents(season, 10))).padStart(12)}${usd(p82).padStart(14)}${((p82 / c) * 100).toFixed(1).padStart(10)}%`,
  );
}
console.log(`\n  every figure is a fraction of the cap, so all scale together by construction.`);

// --------------------------------------------------------------- 24. PAYROLL
h("24. TEAM PAYROLL DISTRIBUTION (market price for every rostered player)");
interface Row {
  fullName: string;
  teamAbbreviation: string | null;
  position: string;
  seedOverallRating: number | null;
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
const payrolls = new Map<string, number>();
for (const p of ds.players) {
  if (!rostered.has(p) || p.seedOverallRating == null || !p.teamAbbreviation) continue;
  const src = {
    birthDate: p.birthDate ? new Date(p.birthDate) : null,
    draftYear: p.draftYear ?? null,
  };
  const s = priceContractCents({
    season: BASE,
    quality: q(p.seedOverallRating),
    age: resolvePlayerAge(src, BASE),
    yearsOfExperience: resolvePlayerExperience(src, BASE),
    position: p.position,
  });
  payrolls.set(p.teamAbbreviation, (payrolls.get(p.teamAbbreviation) ?? 0) + s);
}
const rules = getSeasonCapRules(BASE);
const vals = [...payrolls.values()].sort((a, b) => a - b);
console.log(
  `  cap ${usd(Number(rules.salaryCapCents))}  tax ${usd(Number(rules.luxuryTaxCents))}  1st apron ${usd(Number(rules.firstApronCents))}  2nd apron ${usd(Number(rules.secondApronCents))}\n`,
);
console.log(`  lowest  ${usd(vals[0])}`);
console.log(`  median  ${usd(vals[Math.floor(vals.length / 2)])}`);
console.log(`  highest ${usd(vals[vals.length - 1])}`);
const under = vals.filter((v) => v < Number(rules.salaryCapCents)).length;
const overTax = vals.filter((v) => v >= Number(rules.luxuryTaxCents)).length;
const over2 = vals.filter((v) => v >= Number(rules.secondApronCents)).length;
console.log(`\n  teams under the cap:        ${under} of 30`);
console.log(`  teams over the tax line:    ${overTax} of 30`);
console.log(`  teams over the 2nd apron:   ${over2} of 30`);

// --------------------------------------------------------------- 23. INFLATION
h("23. LONG-SAVE SALARY INFLATION (12 seasons, develop/age/retire/draft)");
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
interface P {
  id: string;
  overall: number;
  potential: number;
  age: number;
}
const start: P[] = [];
for (const p of ds.players) {
  if (!rostered.has(p) || p.seedOverallRating == null) continue;
  const src = {
    birthDate: p.birthDate ? new Date(p.birthDate) : null,
    draftYear: p.draftYear ?? null,
  };
  start.push({
    id: p.fullName,
    overall: p.seedOverallRating,
    potential: p.seedOverallRating,
    age: resolvePlayerAge(src, BASE),
  });
}
const rng = makeRng(20260816);
let pool = start.map((p) => ({ ...p }));
console.log(
  `  ${"SEASON".padStart(8)}${"CAP".padStart(10)}${">$10M".padStart(8)}${">$20M".padStart(8)}${">$30M".padStart(8)}${">$40M".padStart(8)}${"MEDIAN".padStart(10)}${"MED/CAP".padStart(9)}`,
);
for (let season = 0; season <= 10; season++) {
  if (season > 0) {
    for (const p of pool) {
      p.overall = developPlayerRating({
        overallRating: p.overall,
        potentialRating: p.potential,
        age: p.age,
        rng,
        developmentTrait: developmentTraitFromId(p.id),
      });
      p.age += 1;
    }
    pool = pool.filter((p) => !shouldRetire(p.age, p.overall, rng));
    for (const [i, pr] of generateDraftClass(rng).prospects.entries())
      pool.push({
        id: `c${season}p${i}`,
        overall: pr.overallRating,
        potential: pr.potentialRating,
        age: pr.age,
      });
    pool.sort((a, b) => b.overall - a.overall);
    pool = pool.slice(0, 450);
  }
  if (season === 0 || season === 2 || season === 4 || season === 9 || season === 10) {
    const yr = BASE + season;
    const c = Number(getSeasonCapRules(yr).salaryCapCents);
    const ss = pool.map((p) =>
      priceContractCents({
        season: yr,
        quality: q(p.overall),
        age: p.age,
        yearsOfExperience: Math.max(0, p.age - 20),
        position: "SF",
      }),
    );
    const med = [...ss].sort((a, b) => a - b)[Math.floor(ss.length / 2)];
    const over = (t: number) => ss.filter((v) => v > t * 1e8).length;
    console.log(
      `  ${String(yr).padStart(8)}${usd(c).padStart(10)}${String(over(10)).padStart(8)}${String(over(20)).padStart(8)}${String(over(30)).padStart(8)}${String(over(40)).padStart(8)}${usd(med).padStart(10)}${((med / c) * 100).toFixed(1).padStart(8)}%`,
    );
  }
}

line();
console.log("Reproduce: npx tsx scripts/salary-market-audit.ts");
line();
