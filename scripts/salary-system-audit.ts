/**
 * Adversarial audit of the contract and salary system. Reads only.
 *
 * Covers the static half: league distribution, salary by quality tier,
 * sensitivity to every input, a large-sample generator sweep, rookie scale,
 * the top and bottom of the market, and an automatic outlier detector meant to
 * be re-run after fixes.
 *
 * The market and multi-season half is scripts/salary-market-audit.ts.
 *
 * Run: npx tsx scripts/salary-system-audit.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  contractQualityScore,
  priceContractCents,
  pickContractLength,
} from "../src/lib/contracts/priceContract";
import { generateContract } from "../src/lib/contracts/generateContract";
import { computePerformanceScore } from "../src/lib/valuation/playerValue";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { maxSalaryFractionFor } from "../src/lib/cap/maxSalary";
import { veteranMinimumCents } from "../src/lib/cap/veteranMinimum";
import { resolvePlayerAge, resolvePlayerExperience } from "../src/lib/players/age";
import { getPlayerValueTier } from "../src/lib/valuation/playerValueTier";
import { createSeededRandom } from "../src/lib/contracts/seededRandom";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

const SEASON = 2026;
const cap = Number(getSeasonCapRules(SEASON).salaryCapCents);
const M = (c: number) => c / 1e8;
const usd = (c: number) => `$${M(c).toFixed(1)}M`;
const pctCap = (c: number) => `${((c / cap) * 100).toFixed(1)}%`;
const line = (n = 96) => console.log("=".repeat(n));
const h = (t: string) => {
  line();
  console.log(t);
  line();
};

interface StatLine {
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  trueShootingPct: number | null;
}
interface Row {
  fullName: string;
  teamAbbreviation: string | null;
  position: string;
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  birthDate?: string | null;
  draftYear?: number | null;
  stats?: StatLine | StatLine[] | null;
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

interface Priced {
  name: string;
  team: string;
  pos: string;
  ovr: number;
  pot: number;
  age: number;
  exp: number;
  salary: number;
  years: number;
  tier: string;
  gp: number;
}

const league: Priced[] = [];
for (const p of ds.players) {
  if (!rostered.has(p) || p.seedOverallRating == null) continue;
  const src = {
    birthDate: p.birthDate ? new Date(p.birthDate) : null,
    draftYear: p.draftYear ?? null,
  };
  const age = resolvePlayerAge(src, SEASON);
  const exp = resolvePlayerExperience(src, SEASON);
  const st: StatLine | null = p.stats ? (Array.isArray(p.stats) ? p.stats[0] : p.stats) : null;
  const perf =
    st && st.gamesPlayed
      ? computePerformanceScore({ ...st, trueShootingPct: st.trueShootingPct ?? 0.56 })
      : null;
  const quality = contractQualityScore({
    overallRating: p.seedOverallRating,
    performanceScore: perf,
    gamesPlayed: st?.gamesPlayed ?? 0,
  });
  const salary = priceContractCents({
    season: SEASON,
    quality,
    age,
    yearsOfExperience: exp,
    position: p.position,
  });
  league.push({
    name: p.fullName,
    team: p.teamAbbreviation ?? "?",
    pos: p.position,
    ovr: p.seedOverallRating,
    pot: p.seedPotentialRating ?? p.seedOverallRating,
    age,
    exp,
    salary,
    gp: st?.gamesPlayed ?? 0,
    years: pickContractLength(quality, age, createSeededRandom(p.fullName)),
    tier: getPlayerValueTier(p.seedOverallRating),
  });
}

const pctile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// --------------------------------------------------------------- 3. DISTRIBUTION
h("3. LEAGUE-WIDE SALARY DISTRIBUTION");
const salaries = league.map((p) => p.salary);
console.log(`  players: ${league.length}   season ${SEASON}   cap ${usd(cap)}\n`);
for (const [label, v] of [
  ["minimum", Math.min(...salaries)],
  ["median", pctile(salaries, 0.5)],
  ["mean", mean(salaries)],
  ["75th", pctile(salaries, 0.75)],
  ["90th", pctile(salaries, 0.9)],
  ["95th", pctile(salaries, 0.95)],
  ["maximum", Math.max(...salaries)],
] as [string, number][]) {
  console.log(`  ${label.padEnd(10)} ${usd(v).padStart(9)}   ${pctCap(v).padStart(7)} of cap`);
}
const totalPayroll = salaries.reduce((a, b) => a + b, 0);
console.log(`\n  total league payroll  ${usd(totalPayroll)}`);
console.log(
  `  average per team      ${usd(totalPayroll / 30)}   (cap ${usd(cap)}, ${((totalPayroll / 30 / cap) * 100).toFixed(0)}% of it)`,
);

console.log(`\n  TOP 15 PAID`);
console.log(
  `  ${"PLAYER".padEnd(24)}${"OVR".padStart(4)}${"AGE".padStart(4)}${"POS".padStart(5)}${"SALARY".padStart(9)}${"%CAP".padStart(7)}`,
);
for (const p of [...league].sort((a, b) => b.salary - a.salary).slice(0, 15))
  console.log(
    `  ${p.name.slice(0, 22).padEnd(24)}${String(p.ovr).padStart(4)}${String(p.age).padStart(4)}${p.pos.padStart(5)}${usd(p.salary).padStart(9)}${pctCap(p.salary).padStart(7)}`,
  );

// --------------------------------------------------------------- 4. BY TIER
h("4. SALARY BY QUALITY TIER");
const TIERS = ["SUPERSTAR", "STAR", "STARTER", "ROTATION", "MINIMUM"] as const;
console.log(
  `  ${"TIER".padEnd(11)}${"N".padStart(5)}${"MIN".padStart(9)}${"MEDIAN".padStart(9)}${"MEAN".padStart(9)}${"MAX".padStart(9)}${"%CAP MED".padStart(10)}`,
);
const tierRange = new Map<string, [number, number]>();
for (const t of TIERS) {
  const g = league.filter((p) => p.tier === t);
  if (!g.length) continue;
  const s = g.map((p) => p.salary);
  tierRange.set(t, [Math.min(...s), Math.max(...s)]);
  console.log(
    `  ${t.padEnd(11)}${String(g.length).padStart(5)}${usd(Math.min(...s)).padStart(9)}${usd(pctile(s, 0.5)).padStart(9)}${usd(mean(s)).padStart(9)}${usd(Math.max(...s)).padStart(9)}${pctCap(pctile(s, 0.5)).padStart(10)}`,
  );
}
console.log(`\n  BAND OVERLAP (does a lower tier's max exceed a higher tier's median?)`);
for (let i = 1; i < TIERS.length; i++) {
  const hi = league.filter((p) => p.tier === TIERS[i - 1]).map((p) => p.salary);
  const lo = league.filter((p) => p.tier === TIERS[i]).map((p) => p.salary);
  if (!hi.length || !lo.length) continue;
  const overlap = Math.max(...lo) > pctile(hi, 0.5);
  console.log(
    `    ${TIERS[i].padEnd(10)} max ${usd(Math.max(...lo)).padStart(8)} vs ${TIERS[i - 1].padEnd(10)} median ${usd(pctile(hi, 0.5)).padStart(8)}  ${overlap ? "OVERLAP" : "ok"}`,
  );
}

// --------------------------------------------------------------- 5. POTENTIAL
h("5. CURRENT ABILITY VS POTENTIAL");
console.log(`  Identical 78 OVR, age 24, 4 years service, SF:\n`);
console.log(`  ${"OVR/POT".padEnd(12)}${"SALARY".padStart(10)}`);
for (const pot of [78, 85, 92, 99]) {
  const s = priceContractCents({
    season: SEASON,
    quality: contractQualityScore({ overallRating: 78, performanceScore: null, gamesPlayed: 0 }),
    age: 24,
    yearsOfExperience: 4,
    position: "SF",
  });
  console.log(`  ${`78 / ${pot}`.padEnd(12)}${usd(s).padStart(10)}`);
}
console.log(`\n  potential is not an argument to priceContractCents at all.`);

// --------------------------------------------------------------- 6. AGE
h("6. AGE EFFECTS (OVR 82, SF, service = age-20 capped at 14)");
console.log(
  `  ${"AGE".padStart(5)}${"SVC".padStart(5)}${"SALARY".padStart(10)}${"%CAP".padStart(8)}${"YEARS".padStart(7)}${"TOTAL".padStart(10)}${"MAX TIER".padStart(10)}`,
);
for (const age of [20, 23, 26, 29, 32, 35, 38]) {
  const exp = Math.min(14, Math.max(0, age - 20));
  const q = contractQualityScore({ overallRating: 82, performanceScore: null, gamesPlayed: 0 });
  const s = priceContractCents({
    season: SEASON,
    quality: q,
    age,
    yearsOfExperience: exp,
    position: "SF",
  });
  const y = pickContractLength(q, age, createSeededRandom(`age${age}`));
  console.log(
    `  ${String(age).padStart(5)}${String(exp).padStart(5)}${usd(s).padStart(10)}${pctCap(s).padStart(8)}${String(y).padStart(7)}${usd(s * y).padStart(10)}${(maxSalaryFractionFor({ age, yearsOfExperience: exp }) * 100).toFixed(0).padStart(9)}%`,
  );
}

// --------------------------------------------------------------- 7. LENGTH
h("7. CONTRACT LENGTH BY ARCHETYPE");
console.log(
  `  ${"ARCHETYPE".padEnd(24)}${"OVR".padStart(5)}${"AGE".padStart(5)}${"SALARY".padStart(10)}${"YEARS (10 seeds)".padStart(20)}`,
);
for (const [name, ovr, age] of [
  ["superstar", 95, 27],
  ["star", 88, 28],
  ["starter", 79, 27],
  ["role player", 72, 27],
  ["fringe", 65, 27],
  ["young prospect", 70, 21],
  ["aging veteran", 78, 35],
  ["old star", 88, 36],
] as [string, number, number][]) {
  const exp = Math.min(14, Math.max(0, age - 20));
  const q = contractQualityScore({ overallRating: ovr, performanceScore: null, gamesPlayed: 0 });
  const s = priceContractCents({
    season: SEASON,
    quality: q,
    age,
    yearsOfExperience: exp,
    position: "SF",
  });
  const ys = Array.from({ length: 10 }, (_, i) =>
    pickContractLength(q, age, createSeededRandom(`${name}${i}`)),
  );
  console.log(
    `  ${name.padEnd(24)}${String(ovr).padStart(5)}${String(age).padStart(5)}${usd(s).padStart(10)}${ys.join(",").padStart(20)}`,
  );
}

// --------------------------------------------------------------- 9/10. TOP AND BOTTOM
h("9 & 10. TOP-END AND LOW-END CONTROL");
console.log(
  `  ${"ARCHETYPE".padEnd(22)}${"OVR".padStart(5)}${"SALARY".padStart(10)}${"%CAP".padStart(8)}${"MAX ALLOWED".padStart(13)}${"AT MAX?".padStart(9)}`,
);
for (const [name, ovr, age, exp] of [
  ["MVP superstar", 99, 28, 8],
  ["All-NBA", 93, 28, 8],
  ["All-Star", 87, 28, 8],
  ["high-end starter", 81, 28, 8],
  ["average starter", 76, 28, 8],
  ["rotation", 70, 28, 8],
  ["replacement vet", 63, 33, 12],
  ["15th man", 60, 25, 4],
  ["young fringe", 62, 21, 1],
] as [string, number, number, number][]) {
  const q = contractQualityScore({ overallRating: ovr, performanceScore: null, gamesPlayed: 0 });
  const s = priceContractCents({
    season: SEASON,
    quality: q,
    age,
    yearsOfExperience: exp,
    position: "SF",
  });
  const maxC = cap * maxSalaryFractionFor({ age, yearsOfExperience: exp });
  console.log(
    `  ${name.padEnd(22)}${String(ovr).padStart(5)}${usd(s).padStart(10)}${pctCap(s).padStart(8)}${usd(maxC).padStart(13)}${(Math.abs(s - maxC) < cap * 0.002 ? "YES" : "no").padStart(9)}`,
  );
}
console.log(
  `\n  league minimum by service: 0y ${usd(Number(veteranMinimumCents(SEASON, 0)))}, 5y ${usd(Number(veteranMinimumCents(SEASON, 5)))}, 10y ${usd(Number(veteranMinimumCents(SEASON, 10)))}`,
);

// --------------------------------------------------------------- 14. POSITION
h("14. POSITION EFFECTS (OVR 82, age 27, 7 years)");
const q82 = contractQualityScore({ overallRating: 82, performanceScore: null, gamesPlayed: 0 });
const byPos = (["PG", "SG", "SF", "PF", "C"] as const).map((pos) => ({
  pos,
  s: priceContractCents({
    season: SEASON,
    quality: q82,
    age: 27,
    yearsOfExperience: 7,
    position: pos,
  }),
}));
const posMin = Math.min(...byPos.map((x) => x.s));
for (const { pos, s } of byPos)
  console.log(
    `  ${pos}  ${usd(s).padStart(9)}   ${((s / posMin - 1) * 100).toFixed(1).padStart(6)}% above cheapest`,
  );

// --------------------------------------------------------------- 19. ROOKIE SCALE
h("19. ROOKIE SCALE BY DRAFT SLOT (using expected rating for the slot)");
console.log(
  `  ${"PICK".padStart(6)}${"EXP OVR".padStart(9)}${"YR1 SALARY".padStart(12)}${"%CAP".padStart(8)}${"VS VET PRICE".padStart(14)}`,
);
for (const [pick, ovr] of [
  [1, 72],
  [5, 71],
  [14, 70],
  [30, 67],
  [45, 65],
  [60, 62],
] as [number, number][]) {
  const q = contractQualityScore({ overallRating: ovr, performanceScore: null, gamesPlayed: 0 });
  const rookie = priceContractCents({
    season: SEASON,
    quality: q,
    age: 20,
    yearsOfExperience: 0,
    position: "SF",
  });
  const vet = priceContractCents({
    season: SEASON,
    quality: q,
    age: 27,
    yearsOfExperience: 7,
    position: "SF",
  });
  console.log(
    `  ${String(pick).padStart(6)}${String(ovr).padStart(9)}${usd(rookie).padStart(12)}${pctCap(rookie).padStart(8)}${((rookie / vet) * 100).toFixed(0).padStart(13)}%`,
  );
}

// --------------------------------------------------------------- 30. SENSITIVITY
h("30. SENSITIVITY - one variable at a time (age 27, 7y, SF)");
console.log(`  OVR step (each +1):`);
let prev = 0;
for (const ovr of [70, 74, 78, 79, 80, 81, 82, 86, 90, 94, 98]) {
  const q = contractQualityScore({ overallRating: ovr, performanceScore: null, gamesPlayed: 0 });
  const s = priceContractCents({
    season: SEASON,
    quality: q,
    age: 27,
    yearsOfExperience: 7,
    position: "SF",
  });
  console.log(
    `    ovr ${String(ovr).padStart(3)}  ${usd(s).padStart(9)}${prev ? `   ${(((s - prev) / prev) * 100).toFixed(1).padStart(6)}% vs previous` : ""}`,
  );
  prev = s;
}

// --------------------------------------------------------------- 29. LARGE SAMPLE
h("29. LARGE-SAMPLE GENERATOR SWEEP");
const gen: number[] = [];
let maxJump = { from: "", pct: 0 };
const rngSeeds = 3;
for (let ovr = 60; ovr <= 99; ovr += 1) {
  for (const age of [21, 25, 29, 33, 37]) {
    const exp = Math.min(14, Math.max(0, age - 20));
    for (let k = 0; k < rngSeeds; k++) {
      const c = generateContract({
        season: SEASON,
        overallRating: ovr,
        performanceScore: null,
        gamesPlayed: 0,
        age,
        yearsOfExperience: exp,
        position: "SF",
        seed: `g${ovr}${age}${k}`,
      });
      gen.push(Number(c.years[0].salaryCents));
    }
  }
  if (ovr > 60) {
    const a = priceContractCents({
      season: SEASON,
      quality: contractQualityScore({
        overallRating: ovr - 1,
        performanceScore: null,
        gamesPlayed: 0,
      }),
      age: 27,
      yearsOfExperience: 7,
      position: "SF",
    });
    const b = priceContractCents({
      season: SEASON,
      quality: contractQualityScore({ overallRating: ovr, performanceScore: null, gamesPlayed: 0 }),
      age: 27,
      yearsOfExperience: 7,
      position: "SF",
    });
    const jump = ((b - a) / a) * 100;
    if (jump > maxJump.pct) maxJump = { from: `${ovr - 1}->${ovr}`, pct: jump };
  }
}
console.log(`  ${gen.length} generated contracts across OVR 60-99 x 5 ages x ${rngSeeds} seeds`);
console.log(
  `  min ${usd(Math.min(...gen))}   median ${usd(pctile(gen, 0.5))}   max ${usd(Math.max(...gen))}`,
);
console.log(`  largest single-OVR-point jump: ${maxJump.from} = +${maxJump.pct.toFixed(1)}%`);

// --------------------------------------------------------------- 31. OUTLIER DETECTOR
h("31. OUTLIER DETECTOR (re-runnable)");
const medianSalary = pctile(salaries, 0.5);
const top10Cut = pctile(salaries, 0.9);
const flags: string[] = [];
for (const p of league) {
  const belowMedianQuality =
    p.ovr <
    pctile(
      league.map((x) => x.ovr),
      0.5,
    );
  if (belowMedianQuality && p.salary >= top10Cut)
    flags.push(`BOTTOM-HALF-TOP-PAID  ${p.name} (${p.ovr} ovr) ${usd(p.salary)}`);
  if (p.tier === "MINIMUM" && p.salary > cap * 0.25)
    flags.push(`FRINGE-AT-QUARTER-CAP ${p.name} (${p.ovr} ovr) ${usd(p.salary)}`);
  if (
    p.ovr < 80 &&
    p.salary > cap * maxSalaryFractionFor({ age: p.age, yearsOfExperience: p.exp }) * 0.95
  )
    flags.push(`NON-STAR-NEAR-MAX     ${p.name} (${p.ovr} ovr) ${usd(p.salary)}`);
}
console.log(`  median salary ${usd(medianSalary)}, top-decile cut ${usd(top10Cut)}`);
console.log(`  flags raised: ${flags.length}`);
for (const f of flags.slice(0, 12)) console.log(`    ${f}`);

// biggest anomalies both ways: salary rank vs rating rank
const byRating = [...league].sort((a, b) => b.ovr - a.ovr);
const bySalary = [...league].sort((a, b) => b.salary - a.salary);
const ratingRank = new Map(byRating.map((p, i) => [p.name, i]));
const salaryRank = new Map(bySalary.map((p, i) => [p.name, i]));
const drift = league.map((p) => ({
  p,
  d: (ratingRank.get(p.name) ?? 0) - (salaryRank.get(p.name) ?? 0),
}));
console.log(`\n  10 MOST OVERPAID (salary rank far above rating rank)`);
for (const { p, d } of [...drift].sort((a, b) => b.d - a.d).slice(0, 10))
  console.log(
    `    ${p.name.slice(0, 22).padEnd(24)}${String(p.ovr).padStart(4)} ovr  ${usd(p.salary).padStart(9)}  +${d} places`,
  );
console.log(`\n  10 BIGGEST BARGAINS (rating rank far above salary rank)`);
for (const { p, d } of [...drift].sort((a, b) => a.d - b.d).slice(0, 10))
  console.log(
    `    ${p.name.slice(0, 22).padEnd(24)}${String(p.ovr).padStart(4)} ovr  ${usd(p.salary).padStart(9)}  ${d} places`,
  );

line();
console.log("Reproduce: npx tsx scripts/salary-system-audit.ts");
line();
