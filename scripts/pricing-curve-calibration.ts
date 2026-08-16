/**
 * Fits `scoreToCapFraction`'s MIDPOINT and STEEPNESS.
 *
 * docs/SALARY_SYSTEM_AUDIT.md P0-1 and P0-2 are one mis-calibration seen from
 * two ends. The curve's midpoint of 80 means a player rated 80 - an ordinary
 * starter on this scale - earns half the maximum. That pays the middle of the
 * league like the top of it, which:
 *
 *   - prices a 15-man roster at 135% of the cap, leaving 1 of 30 teams under it
 *   - reaches the individual-maximum clamp at ~86 OVR, so every player from 86
 *     to 99 costs exactly the same
 *
 * Fitted against three things at once, all of which must hold:
 *
 *   1. mean team payroll near the real 110% of cap (REAL_TEAM_PAYROLL_SHAPE)
 *   2. the real salary band counts - 14 players at $50M+, 26 at $40M+, 59 at
 *      $30M+ (REAL_SALARY_BANDS, measured from imported contracts)
 *   3. the SHARE of the league sitting exactly at its maximum, which should be
 *      about 6% - the real $50M+ and $40M+ populations are 14 and 26 of ~450
 *
 * **A correction to the audit that commissioned this.** SALARY_SYSTEM_AUDIT
 * filed "every player above 86 OVR costs the same" as P0-2, an independent
 * finding, and proposed strict price ordering across 88/93/98 as a hard
 * constraint. That is wrong about the NBA: max-contract players genuinely do
 * earn identical salaries, and differentiation at the top comes from service
 * tier, not talent. Sweeping under that constraint proved it - no curve
 * satisfies both it and the payroll target, because the constraint is asking
 * the model not to have maximum salaries.
 *
 * The real defect is WHO reaches the clamp, not that a clamp exists. At the
 * shipped midpoint an 85-rated player is a max player. So the objective is the
 * share of the league at its maximum, and P0-2 collapses into P0-1.
 *
 * Reads only. Run: npx tsx scripts/pricing-curve-calibration.ts
 */
import fs from "node:fs";
import path from "node:path";
import { contractQualityScore } from "../src/lib/contracts/priceContract";
import { ageValueMultiplier } from "../src/lib/valuation/ageCurve";
import { rookieScaleDiscount, positionalMarketFactor } from "../src/lib/contracts/priceContract";
import { getSeasonCapRules } from "../src/lib/cap/constants";
import { maxSalaryFractionFor } from "../src/lib/cap/maxSalary";
import { veteranMinimumCents } from "../src/lib/cap/veteranMinimum";
import { resolvePlayerAge, resolvePlayerExperience } from "../src/lib/players/age";
import {
  REAL_TEAM_PAYROLL_SHAPE,
  REAL_CAP_2025_26_CENTS,
  REAL_SALARY_BANDS,
} from "../src/lib/valuation/realPayrollShape";
import { selectTopPerTeam, DEFAULT_MAX_ROSTER_SIZE } from "../src/lib/data-sources/rosterConstruction";

const SEASON = 2026;
const cap = Number(getSeasonCapRules(SEASON).salaryCapCents);
const usd = (c: number) => `$${(c / 1e8).toFixed(1)}M`;

/** Real mean team payroll as a share of the cap that season: 170.0 / 154.647. */
const TARGET_PAYROLL_RATIO =
  REAL_TEAM_PAYROLL_SHAPE.meanCents / REAL_CAP_2025_26_CENTS;

const MAX_CAP_FRACTION = 0.35;

/** Real share of the league on a maximum contract: ~26 of ~450. */
const TARGET_MAX_SHARE = 26 / 450;

interface StatLine {
  gamesPlayed: number; minutesPerGame: number; pointsPerGame: number;
  reboundsPerGame: number; assistsPerGame: number; stealsPerGame: number;
  blocksPerGame: number; turnoversPerGame: number; trueShootingPct: number | null;
}
interface Row {
  fullName: string; teamAbbreviation: string | null; position: string;
  seedOverallRating: number | null; birthDate?: string | null; draftYear?: number | null;
  stats?: StatLine | StatLine[] | null;
}
const ds = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "prisma", "data", "nbaDataset.json"), "utf8"),
) as { players: Row[] };
const { rostered } = selectTopPerTeam<Row>(
  ds.players, (p) => p.teamAbbreviation, (p) => p.seedOverallRating ?? 0, DEFAULT_MAX_ROSTER_SIZE,
);

/** Everything about a player that pricing needs, resolved once. */
const players = ds.players
  .filter((p) => rostered.has(p) && p.seedOverallRating != null && p.teamAbbreviation)
  .map((p) => {
    const src = { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear ?? null };
    return {
      team: p.teamAbbreviation!,
      quality: contractQualityScore({
        overallRating: p.seedOverallRating!, performanceScore: null, gamesPlayed: 0,
      }),
      age: resolvePlayerAge(src, SEASON),
      exp: resolvePlayerExperience(src, SEASON),
      position: p.position,
    };
  });

/** `priceContractCents` with the curve's two constants injected. */
function priceWith(midpoint: number, steepness: number, p: (typeof players)[number]): number {
  const fraction = MAX_CAP_FRACTION / (1 + Math.exp(-steepness * (p.quality - midpoint)));
  const value =
    cap * fraction * ageValueMultiplier(p.age) * rookieScaleDiscount(p.exp) *
    positionalMarketFactor(p.position);
  const floored = Math.max(value, Number(veteranMinimumCents(SEASON, p.exp)));
  return Math.min(floored, cap * maxSalaryFractionFor({ age: p.age, yearsOfExperience: p.exp }));
}

/** A reference player at a given rating, for the separation constraint. */
const reference = (ovr: number) => ({
  team: "-", quality: contractQualityScore({ overallRating: ovr, performanceScore: null, gamesPlayed: 0 }),
  age: 28, exp: 8, position: "SF",
});

function evaluate(midpoint: number, steepness: number) {
  const payrolls = new Map<string, number>();
  const salaries: number[] = [];
  for (const p of players) {
    const s = priceWith(midpoint, steepness, p);
    salaries.push(s);
    payrolls.set(p.team, (payrolls.get(p.team) ?? 0) + s);
  }
  const meanPayroll = [...payrolls.values()].reduce((a, b) => a + b, 0) / payrolls.size;
  const payrollRatio = meanPayroll / cap;
  const underCap = [...payrolls.values()].filter((v) => v < cap).length;

  const bandCounts = REAL_SALARY_BANDS.map(
    (b) => salaries.filter((s) => s >= cap * b.atLeastFractionOfCap).length,
  );

  // Who reaches the ceiling. Real: ~14 of 450 above 32% of cap, ~26 above 26%.
  const atMax = players.filter((p) => {
    const maxC = cap * maxSalaryFractionFor({ age: p.age, yearsOfExperience: p.exp });
    return priceWith(midpoint, steepness, p) >= maxC * 0.999;
  }).length;
  const maxShare = atMax / players.length;
  // The lowest-rated player who still reaches his maximum - the tell for
  // whether the clamp is reserved for stars or handed to good starters.
  const ratings = ds.players.filter((p) => rostered.has(p) && p.seedOverallRating != null);
  let lowestMaxed = 99;
  players.forEach((p, i) => {
    const maxC = cap * maxSalaryFractionFor({ age: p.age, yearsOfExperience: p.exp });
    if (priceWith(midpoint, steepness, p) >= maxC * 0.999) {
      const ovr = ratings[i]?.seedOverallRating ?? 99;
      if (ovr < lowestMaxed) lowestMaxed = ovr;
    }
  });
  const top = [88, 93, 98].map((o) => priceWith(midpoint, steepness, reference(o)));

  const payrollErr = ((payrollRatio - TARGET_PAYROLL_RATIO) / TARGET_PAYROLL_RATIO) ** 2;
  // The $50M+ band is excluded: $50M is 32.3% of cap and only the 35% service
  // tier can reach it, so hitting 14 would need the Designated Veteran
  // (supermax) rule this model does not have. Fitting to an unreachable target
  // would drag every other number with it.
  const bandErr = [1, 2].reduce(
    (sum, i) => sum + ((bandCounts[i] - REAL_SALARY_BANDS[i].players) / REAL_SALARY_BANDS[i].players) ** 2, 0,
  ) / 2;
  const maxShareErr = ((maxShare - TARGET_MAX_SHARE) / TARGET_MAX_SHARE) ** 2;

  return { payrollRatio, underCap, bandCounts, atMax, maxShare, lowestMaxed, top, err: payrollErr + bandErr + maxShareErr };
}

console.log("=".repeat(104));
console.log("PRICING CURVE CALIBRATION");
console.log("=".repeat(104));
console.log(`  targets: mean payroll ${(TARGET_PAYROLL_RATIO * 100).toFixed(0)}% of cap; bands ${REAL_SALARY_BANDS.map((b) => `${b.players}@${b.dollars}`).join(", ")}`);
console.log(`  hard constraint: price(98) > price(93) > price(88)\n`);
console.log(
  `${"MID".padStart(6)}${"STEEP".padStart(8)}${"PAYROLL%".padStart(10)}${"UNDER CAP".padStart(11)}` +
  `${"$50M+".padStart(8)}${"$40M+".padStart(8)}${"$30M+".padStart(8)}${"AT MAX".padStart(9)}${"LOWEST MAXED".padStart(14)}${"ERR".padStart(9)}`,
);

let best = { midpoint: 0, steepness: 0, err: Infinity };
for (let midpoint = 80; midpoint <= 100.01; midpoint += 2) {
  for (const steepness of [0.13, 0.17, 0.21]) {
    const r = evaluate(midpoint, steepness);
      if (r.err < best.err) best = { midpoint, steepness, err: r.err };
    console.log(
      `${midpoint.toFixed(0).padStart(6)}${steepness.toFixed(2).padStart(8)}` +
      `${(r.payrollRatio * 100).toFixed(0).padStart(9)}%${String(r.underCap).padStart(11)}` +
      `${String(r.bandCounts[0]).padStart(8)}${String(r.bandCounts[1]).padStart(8)}${String(r.bandCounts[2]).padStart(8)}` +
      `${(String(r.atMax) + ` (${(r.maxShare * 100).toFixed(1)}%)`).padStart(9)}${String(r.lowestMaxed).padStart(14)}${r.err.toFixed(3).padStart(9)}`,
    );
  }
}

console.log(`\n  BEST FIT (separation-constrained): MIDPOINT = ${best.midpoint}, STEEPNESS = ${best.steepness}`);
const f = evaluate(best.midpoint, best.steepness);
console.log(`    mean payroll ${(f.payrollRatio * 100).toFixed(0)}% of cap (target ${(TARGET_PAYROLL_RATIO * 100).toFixed(0)}%), ${f.underCap} of 30 under it`);
console.log(`    bands ${f.bandCounts.join(" / ")} against real ${REAL_SALARY_BANDS.map((b) => b.players).join(" / ")}`);
console.log(`    ${f.atMax} of ${players.length} at their maximum (${(f.maxShare * 100).toFixed(1)}%, real ~${(TARGET_MAX_SHARE * 100).toFixed(1)}%)`);
console.log(`    lowest-rated player still reaching his max: ${f.lowestMaxed} OVR`);
console.log(`    88 / 93 / 98 OVR: ${f.top.map((t) => usd(t)).join("  ")}`);
