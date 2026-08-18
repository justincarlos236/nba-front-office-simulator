/**
 * Contract audit harness, part 2 - the questions part 1 cannot answer from a
 * single league snapshot: how the four pricing paths disagree with each other,
 * what happens to prices over a ten-season save, and where the exploit surface
 * is. Companion to scripts/contract-audit.ts; see docs/audits/CONTRACT_AUDIT.md.
 *
 * Reads only. Run: npx tsx scripts/contract-audit-paths.ts
 */
import fs from "node:fs";
import path from "node:path";
import { computePerformanceScore, scoreToCapFraction } from "../src/lib/valuation/playerValue";
import { ageValueMultiplier } from "../src/lib/valuation/ageCurve";
import { computeReSigningMaxOfferCents } from "../src/lib/freeagency/reSigningRights";
import { developPlayerRating } from "../src/lib/development/developPlayerRating";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { resolvePlayerAge } from "../src/lib/players/age";
import {
  selectTopPerTeam,
  DEFAULT_MAX_ROSTER_SIZE,
} from "../src/lib/data-sources/rosterConstruction";

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
  position: string | null;
  seedPotentialRating: number | null;
  stats: Record<string, number | null> | null;
}
const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };

console.log("=".repeat(78));
console.log("SECTION 1 - THE FOUR PRICING PATHS, SAME PLAYER, SIDE BY SIDE");
console.log("=".repeat(78));
console.log("A player of quality Q, age 27, veteran. What does each path charge?\n");
console.log(
  `${"Q".padStart(3)}${"BOOTSTRAP".padStart(12)}${"CPU RE-SIGN".padStart(13)}${"CPU FA".padStart(11)}${"DRAFT(a20)".padStart(12)}${"spread".padStart(9)}`,
);
for (const Q of [65, 70, 75, 80, 85, 90, 95, 99]) {
  const boot = CAP * scoreToCapFraction(Q) * ageValueMultiplier(27); // x noise 0.85-1.15
  const resign = Number(computeReSigningMaxOfferCents(Q, SEASON, 27, 6)); // no age, no noise
  const fa = CAP * scoreToCapFraction(Q); // no age, no noise
  const draft = CAP * scoreToCapFraction(Q) * ageValueMultiplier(20) * 0.35;
  const vals = [boot, resign, fa, draft];
  const spread = Math.max(...vals) / Math.max(1, Math.min(...vals));
  console.log(
    `${String(Q).padStart(3)}${M(boot).padStart(12)}${M(resign).padStart(13)}${M(fa).padStart(11)}${M(draft).padStart(12)}${(spread.toFixed(2) + "x").padStart(9)}`,
  );
}
console.log(`
  BOOTSTRAP   input = computePerformanceScore(stats)   x ageMult x rookieDisc x noise(0.85-1.15)
  CPU RE-SIGN input = overallRating                    no age, no noise, always 2y flat
  CPU FA      input = computePerformanceScore(stats)   no age, no noise, always 2y flat
  DRAFT       input = overallRating                    x ageMult(20) x 0.35 x noise
  -> Four paths, three different inputs, three different modifier stacks.`);

console.log("\n" + "=".repeat(78));
console.log("SECTION 2 - THE TWO RATING SYSTEMS DISAGREE");
console.log("=".repeat(78));
const enriched = dataset.players
  .filter((p) => p.stats)
  .map((p) => {
    const s = p.stats!;
    const stats = {
      pointsPerGame: Number(s.pointsPerGame ?? 0),
      reboundsPerGame: Number(s.reboundsPerGame ?? 0),
      assistsPerGame: Number(s.assistsPerGame ?? 0),
      stealsPerGame: Number(s.stealsPerGame ?? 0),
      blocksPerGame: Number(s.blocksPerGame ?? 0),
      turnoversPerGame: Number(s.turnoversPerGame ?? 0),
      minutesPerGame: Number(s.minutesPerGame ?? 0),
      trueShootingPct: Number(s.trueShootingPct ?? 0.56),
    };
    return {
      p,
      team: p.teamAbbreviation,
      gp: Number(s.gamesPlayed ?? 0),
      stats,
      ovr: p.seedOverallRating ?? 50,
      score: computePerformanceScore(stats),
      age: resolvePlayerAge(
        { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
        SEASON,
      ),
    };
  });
const { rostered } = selectTopPerTeam(
  enriched,
  (e) => e.team,
  (e) => e.ovr,
  DEFAULT_MAX_ROSTER_SIZE,
);
const R = enriched.filter((e) => rostered.has(e));

const diffs = R.map((e) => ({ e, d: e.score - e.ovr }));
const absMean = diffs.reduce((s, x) => s + Math.abs(x.d), 0) / diffs.length;
console.log(
  `mean |perfScore - seedOVR| across ${R.length} rostered = ${absMean.toFixed(1)} points`,
);
console.log(`disagree by 10+ points: ${diffs.filter((x) => Math.abs(x.d) >= 10).length}`);
console.log(`disagree by 15+ points: ${diffs.filter((x) => Math.abs(x.d) >= 15).length}`);
console.log(`\nWorst 15 (score >> OVR, i.e. paid far above displayed quality):`);
[...diffs]
  .sort((a, b) => b.d - a.d)
  .slice(0, 15)
  .forEach((x) =>
    console.log(
      `  ${x.e.p.fullName.padEnd(24)} gp ${String(x.e.gp).padStart(2)}  OVR ${String(x.e.ovr).padStart(2)} vs score ${x.e.score.toFixed(1).padStart(5)}  (+${x.d.toFixed(1)})`,
    ),
  );

console.log("\n" + "=".repeat(78));
console.log("SECTION 3 - SMALL SAMPLE: gamesPlayed IS NOT AN INPUT TO ANY VALUATION");
console.log("=".repeat(78));
const buckets: [string, number, number][] = [
  ["1-15 games", 1, 16],
  ["16-30 games", 16, 31],
  ["31-50 games", 31, 51],
  ["51-70 games", 51, 71],
  ["71+ games", 71, 999],
];
console.log(
  `${"BUCKET".padEnd(14)}${"N".padStart(4)}${"MEAN OVR".padStart(10)}${"MEAN SCORE".padStart(12)}${"MEAN GAP".padStart(10)}${"MED VALUE".padStart(11)}`,
);
for (const [label, lo, hi] of buckets) {
  const g = R.filter((e) => e.gp >= lo && e.gp < hi);
  if (!g.length) continue;
  const mo = g.reduce((s, e) => s + e.ovr, 0) / g.length;
  const ms = g.reduce((s, e) => s + e.score, 0) / g.length;
  const vals = g
    .map((e) => CAP * scoreToCapFraction(e.score) * ageValueMultiplier(e.age))
    .sort((a, b) => a - b);
  console.log(
    `${label.padEnd(14)}${String(g.length).padStart(4)}${mo.toFixed(1).padStart(10)}${ms.toFixed(1).padStart(12)}${("+" + (ms - mo).toFixed(1)).padStart(10)}${M(vals[Math.floor(vals.length / 2)]).padStart(11)}`,
  );
}
console.log(`
  A 15-game hot streak and an 82-game season are the same evidence to this model.
  PlayerValuationStats has no gamesPlayed field, so nothing downstream can weigh it.`);

console.log("\n" + "=".repeat(78));
console.log("SECTION 4 - LONG-SAVE DRIFT: seasonStats NEVER UPDATES");
console.log("=".repeat(78));
console.log(`grep: no writer of Player.seasonStats outside the importers.
  => computePerformanceScore(stats) is FROZEN at the real 2025-26 box score forever.
  => overallRating DOES move every offseason (developPlayerRating).
  Two prices for the same player that diverge a little more every season:\n`);
const rng = (() => {
  let s = 12345;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
})();
const sample = ["Victor Wembanyama", "Cooper Flagg", "Nikola Jokic", "LeBron James", "Luka Garza"];
for (const name of sample) {
  const e = R.find((x) => x.p.fullName === name) ?? enriched.find((x) => x.p.fullName === name);
  if (!e) continue;
  let ovr = e.ovr;
  let age = e.age;
  const pot = e.p.seedPotentialRating ?? ovr;
  const frozenFa = CAP * scoreToCapFraction(e.score);
  const line: string[] = [];
  for (let yr = 0; yr <= 10; yr += 2) {
    if (yr > 0)
      for (let k = 0; k < 2; k++) {
        ovr = developPlayerRating({ overallRating: ovr, potentialRating: pot, age, rng });
        age += 1;
      }
    line.push(
      `y${yr}: ovr ${String(ovr).padStart(2)} resign ${M(Number(computeReSigningMaxOfferCents(ovr, SEASON, age, Math.max(4, age - 22))))}`,
    );
  }
  console.log(`  ${name}`);
  console.log(`    frozen FA price (never changes, any season): ${M(frozenFa)}`);
  console.log(`    ${line.join("  ")}`);
}

console.log("\n" + "=".repeat(78));
console.log("SECTION 5 - EXPLOIT SURFACE");
console.log("=".repeat(78));
console.log(`1. NO MAXIMUM INDIVIDUAL SALARY.
   validateSigning bounds an offer by cap space or the re-signing ceiling only.
   A team with ${M(67_900_000_00)} cap space may legally offer one player ${M(67_900_000_00)}
   = ${pc(67_900_000_00)} of cap. Real NBA hard-caps an individual at 25/30/35%.

2. UNDERPAID YOUNG STARS ARE FREE MONEY.
   Bootstrap prices young high-OVR players off a mediocre rookie-year box score:`);
for (const n of ["Victor Wembanyama", "Cooper Flagg", "Amen Thompson", "VJ Edgecombe"]) {
  const e = R.find((x) => x.p.fullName === n);
  if (!e) continue;
  const paid = CAP * scoreToCapFraction(e.score) * ageValueMultiplier(e.age) * 0.35;
  const worth = CAP * scoreToCapFraction(e.ovr) * ageValueMultiplier(e.age);
  console.log(
    `     ${n.padEnd(20)} OVR ${e.ovr}  costs ~${M(paid).padStart(7)}  worth ~${M(worth).padStart(7)}  surplus ${M(worth - paid)}`,
  );
}
console.log(`
3. CPU FA PRICE IS FIXED AND PUBLISHED.
   runCpuFreeAgentPass signs at exactly estimatedValueCents. Demand changes WHO
   signs, never the price. The user can therefore always outbid by $1 and never
   faces an escalating market.

4. DUMP-THE-OVERPAY.
   Trade valuation and salary come from different numbers, so an inflated
   contract on a low-OVR player is a pure liability the CPU will absorb if the
   OVR looks acceptable.`);

console.log("\n" + "=".repeat(78));
console.log("SECTION 6 - CPU SELF-DESTRUCTION RATE (current code, bootstrap prices)");
console.log("=".repeat(78));
const badDeals = R.filter((e) => {
  const sal = CAP * scoreToCapFraction(e.score) * ageValueMultiplier(e.age);
  return e.ovr < 75 && sal / CAP > 0.15;
});
console.log(`players with seed OVR < 75 valued above 15% of cap: ${badDeals.length}/${R.length}`);
const byTeam = new Map<string, number>();
for (const e of badDeals) byTeam.set(e.team!, (byTeam.get(e.team!) ?? 0) + 1);
console.log(`teams carrying at least one: ${byTeam.size}/30`);
console.log(
  `worst: ${[...byTeam.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `${t}(${n})`)
    .join(" ")}`,
);

console.log("\n" + "=".repeat(78));
console.log("SECTION 7 - POSITIONAL BIAS (is the model still overpaying bigs?)");
console.log("=".repeat(78));
const posOf = (p: Row) => (p.position ?? "?").toUpperCase();
console.log(
  `${"POS".padEnd(5)}${"N".padStart(4)}${"MEAN OVR".padStart(10)}${"MEAN SCORE".padStart(12)}${"GAP".padStart(8)}${"MED VALUE".padStart(11)}`,
);
for (const pos of ["PG", "SG", "SF", "PF", "C"]) {
  const g = R.filter((e) => posOf(e.p as unknown as Row) === pos);
  if (!g.length) continue;
  const mo = g.reduce((s, e) => s + e.ovr, 0) / g.length;
  const ms = g.reduce((s, e) => s + e.score, 0) / g.length;
  const v = g
    .map((e) => CAP * scoreToCapFraction(e.score) * ageValueMultiplier(e.age))
    .sort((a, b) => a - b);
  console.log(
    `${pos.padEnd(5)}${String(g.length).padStart(4)}${mo.toFixed(1).padStart(10)}${ms.toFixed(1).padStart(12)}${(ms - mo >= 0 ? "+" : "") + (ms - mo).toFixed(1).padStart(7)}${M(v[Math.floor(v.length / 2)]).padStart(11)}`,
  );
}
const centres = R.filter((e) => posOf(e.p as unknown as Row) === "C");
const guards = R.filter((e) => ["PG", "SG"].includes(posOf(e.p as unknown as Row)));
const shareTop = (g: typeof R) => {
  const top = R.map((e) => CAP * scoreToCapFraction(e.score) * ageValueMultiplier(e.age)).sort(
    (a, b) => b - a,
  )[29];
  return g.filter((e) => CAP * scoreToCapFraction(e.score) * ageValueMultiplier(e.age) >= top)
    .length;
};
console.log(
  `\nof the 30 highest-valued players: ${shareTop(centres)} are C, ${shareTop(guards)} are PG/SG`,
);
console.log(
  `(C are ${((centres.length / R.length) * 100).toFixed(0)}% of the league, PG/SG are ${((guards.length / R.length) * 100).toFixed(0)}%)`,
);

console.log("\n" + "=".repeat(78));
console.log("SECTION 8 - PATH DIVERGENCE BY AGE (bootstrap applies ageMult, re-sign does not)");
console.log("=".repeat(78));
console.log(
  `${"AGE".padStart(4)}${"BOOTSTRAP".padStart(12)}${"CPU RE-SIGN".padStart(13)}${"DELTA".padStart(10)}`,
);
for (const age of [20, 24, 27, 30, 33, 36, 39]) {
  const boot = CAP * scoreToCapFraction(85) * ageValueMultiplier(age);
  const resign = Number(computeReSigningMaxOfferCents(85, SEASON, age, Math.max(4, age - 22)));
  console.log(
    `${String(age).padStart(4)}${M(boot).padStart(12)}${M(resign).padStart(13)}${(((resign / boot - 1) * 100).toFixed(0) + "%").padStart(10)}`,
  );
}
console.log(`\n  A 39-year-old at quality 85 re-signs for 82% more than the same man would
  be bootstrapped at. Age risk is priced on one path and free on three.`);
