/**
 * Payroll calibration harness - replays the real bootstrap salary path over
 * the committed 537-player dataset and prints the payroll distribution it
 * produces, next to the real 2025-26 NBA distribution it should resemble.
 *
 * Written for docs/FINANCE_AUDIT.md P0-1, which found generated payrolls high
 * enough to leave 17 of 30 teams unprofitable in season one. Kept as a script
 * rather than a test because the target is a distribution *shape* that has to
 * be read and judged; the unit tests in src/lib/valuation guard the individual
 * invariants that must not move.
 *
 * Reads only - imports the shipped functions, touches no database.
 *
 * Run with: npx tsx scripts/payroll-calibration.ts
 */
import fs from "node:fs";
import path from "node:path";
import { planLeaguePlayer } from "../src/lib/league/planLeaguePlayer";
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
import { REAL_TEAM_PAYROLL_SHAPE, REAL_SALARY_BANDS } from "../src/lib/valuation/realPayrollShape";
import { TEAM_SEEDS } from "../prisma/data/teams";
import {
  computeSeasonRevenue,
  computeSeasonExpenses,
  computeNetIncome,
  pickCpuTicketPosture,
} from "../src/lib/finances/finances";
import { computeAttendancePct, computeFranchisePopularity } from "../src/lib/fans/fanHappiness";
import {
  NEUTRAL_DEPARTMENT_BUDGET,
  totalDepartmentBudgetCostCents,
} from "../src/lib/finances/departments";
import { getPlayerValueTier } from "../src/lib/valuation/playerValueTier";

const SEASON = 2025;

interface Row {
  externalId: string;
  fullName: string;
  birthDate: string | null;
  draftYear: number | null;
  teamAbbreviation: string | null;
  seedOverallRating: number | null;
  stats: Record<string, number | null> | null;
}

const datasetPath = path.join(__dirname, "..", "prisma", "data", "nbaDataset.json");
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as { players: Row[] };

const enriched = dataset.players.map((p) => {
  const age = resolvePlayerAge(
    { birthDate: p.birthDate ? new Date(p.birthDate) : null, draftYear: p.draftYear },
    SEASON,
  );
  const yearsOfExperience = p.draftYear
    ? estimateExperience(p.draftYear, SEASON)
    : estimateExperienceFromAge(age);
  const s = p.stats;
  const plan = s
    ? planLeaguePlayer({
        season: SEASON,
        age,
        yearsOfExperience,
        stats: {
          pointsPerGame: Number(s.pointsPerGame ?? 0),
          reboundsPerGame: Number(s.reboundsPerGame ?? 0),
          assistsPerGame: Number(s.assistsPerGame ?? 0),
          stealsPerGame: Number(s.stealsPerGame ?? 0),
          blocksPerGame: Number(s.blocksPerGame ?? 0),
          turnoversPerGame: Number(s.turnoversPerGame ?? 0),
          minutesPerGame: Number(s.minutesPerGame ?? 0),
          trueShootingPct: Number(s.trueShootingPct ?? 0.56),
        },
        seed: p.externalId,
      })
    : null;
  return { player: p, team: p.teamAbbreviation, age, plan, overall: p.seedOverallRating ?? 50 };
});

const { rostered } = selectTopPerTeam(
  enriched,
  (e) => e.team,
  (e) => e.overall,
  DEFAULT_MAX_ROSTER_SIZE,
);

const rules = getSeasonCapRules(SEASON);
const cap = Number(rules.salaryCapCents);
const taxLine = Number(rules.luxuryTaxCents);
const apron2 = Number(rules.secondApronCents);

const M = (cents: number) => "$" + (cents / 100 / 1_000_000).toFixed(1) + "M";
const pctCap = (cents: number) => ((cents / cap) * 100).toFixed(0) + "%";

const byTeam = new Map<string, { payroll: number; n: number }>();
for (const e of rostered) {
  if (!e.team || !e.plan) continue;
  const cur = byTeam.get(e.team) ?? { payroll: 0, n: 0 };
  cur.payroll += Number(e.plan.contract.years[0].salaryCents);
  cur.n += 1;
  byTeam.set(e.team, cur);
}

console.log(`Season ${SEASON}-${String(SEASON + 1).slice(2)}`);
console.log(`Cap ${M(cap)} · Tax ${M(taxLine)} · Apron 2 ${M(apron2)}\n`);

const teams = [...byTeam.entries()]
  .map(([team, v]) => ({ team, ...v }))
  .sort((a, b) => b.payroll - a.payroll);

console.log(`${"TEAM".padEnd(6)}${"N".padStart(3)}${"PAYROLL".padStart(10)}${"% CAP".padStart(7)}`);
for (const t of teams) {
  const flag = t.payroll > apron2 ? "  apron 2" : t.payroll > taxLine ? "  tax" : "";
  console.log(
    `${t.team.padEnd(6)}${String(t.n).padStart(3)}${M(t.payroll).padStart(10)}${pctCap(t.payroll).padStart(7)}${flag}`,
  );
}

const sim = teams.map((t) => t.payroll).sort((a, b) => a - b);
const q = (f: number) => sim[Math.min(sim.length - 1, Math.floor(f * sim.length))];
const mean = sim.reduce((s, x) => s + x, 0) / sim.length;
const total = sim.reduce((s, x) => s + x, 0);

console.log(`\n--- TEAM PAYROLL ---`);
console.log(`${"".padEnd(16)}${"SIMULATED".padStart(12)}${"REAL NBA".padStart(12)}`);
const line = (label: string, a: string, b: string) =>
  console.log(`${label.padEnd(16)}${a.padStart(12)}${b.padStart(12)}`);
line("league total", M(total), M(REAL_TEAM_PAYROLL_SHAPE.leagueTotalCents));
line("mean", M(mean), M(REAL_TEAM_PAYROLL_SHAPE.meanCents));
line("median", M(q(0.5)), "~" + M(REAL_TEAM_PAYROLL_SHAPE.meanCents));
line("max", M(sim[sim.length - 1]), M(REAL_TEAM_PAYROLL_SHAPE.maxCents));
line("min", M(sim[0]), "-");
line("p10 / p90", `${M(q(0.1))}/${M(q(0.9))}`, "-");
line("over tax", `${sim.filter((x) => x > taxLine).length}/30`, "~8-10/30");
line("over apron 2", `${sim.filter((x) => x > apron2).length}/30`, "1/30");
console.log(
  `\nmean vs real: ${(((mean - REAL_TEAM_PAYROLL_SHAPE.meanCents) / REAL_TEAM_PAYROLL_SHAPE.meanCents) * 100).toFixed(1)}%`,
);

const salaries = [...rostered]
  .filter((e) => e.plan)
  .map((e) => ({
    name: e.player.fullName,
    age: e.age,
    ovr: e.overall,
    cents: Number(e.plan!.contract.years[0].salaryCents),
  }))
  .sort((a, b) => b.cents - a.cents);

console.log(`\n--- INDIVIDUAL SALARIES (${salaries.length} rostered) ---`);
console.log(`${"BAND".padEnd(16)}${"SIMULATED".padStart(12)}${"REAL NBA".padStart(12)}`);
for (const band of REAL_SALARY_BANDS) {
  const n = salaries.filter((s) => s.cents / cap >= band.atLeastFractionOfCap).length;
  line(band.dollars, String(n), String(band.players));
}

console.log(`\nTop 15 salaries:`);
for (const s of salaries.slice(0, 15)) {
  console.log(
    `  ${s.name.padEnd(26)} ovr ${String(s.ovr).padStart(2)} age ${String(s.age).padStart(2)}  ${M(s.cents).padStart(7)}  ${pctCap(s.cents).padStart(4)} of cap`,
  );
}

console.log(`\nHistogram:`);
const cuts = [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 1];
for (let i = 0; i < cuts.length - 1; i++) {
  const n = salaries.filter((s) => s.cents / cap >= cuts[i] && s.cents / cap < cuts[i + 1]).length;
  const label = `${(cuts[i] * 100).toFixed(0)}-${(cuts[i + 1] * 100).toFixed(0)}%`;
  console.log(`  ${label.padStart(8)} of cap  ${String(n).padStart(3)}  ${"#".repeat(n)}`);
}

// ---------------------------------------------------------------------------
// What these payrolls do to the finances
//
// The validation criterion FINANCE_AUDIT.md P0-1 sets for itself: with the
// payroll defect fixed and no finance constant touched, roughly 25 of 30 teams
// should be profitable. Fresh-league state throughout - fanHappiness 65, no
// playoffs, no business decisions resolved, departments at STANDARD - so these
// are opening positions, not a projection of a real save.
// ---------------------------------------------------------------------------

const FRESH_FAN_HAPPINESS = 65;
const STAFF_ESTIMATE_CENTS = 12_000_000_00;

const marketByAbbr = new Map(TEAM_SEEDS.map((t) => [t.abbreviation, t.marketSize]));
const bestOverallByTeam = new Map<string, number>();
for (const e of rostered) {
  if (!e.team) continue;
  bestOverallByTeam.set(e.team, Math.max(bestOverallByTeam.get(e.team) ?? 0, e.overall));
}

const departmentCost = totalDepartmentBudgetCostCents(NEUTRAL_DEPARTMENT_BUDGET);

const finances = teams.map((t) => {
  const marketSize = marketByAbbr.get(t.team)!;
  const starTier = getPlayerValueTier(bestOverallByTeam.get(t.team) ?? 60);
  const revenue = computeSeasonRevenue({
    marketSize,
    attendancePct: computeAttendancePct(FRESH_FAN_HAPPINESS, marketSize),
    franchisePopularity: computeFranchisePopularity(FRESH_FAN_HAPPINESS, starTier, marketSize),
    starTier,
    ticketPosture: pickCpuTicketPosture(marketSize),
    playoffHomeGames: 0,
    wonChampionship: false,
  });
  const expenses = computeSeasonExpenses({
    marketSize,
    payrollCents: t.payroll,
    luxuryTaxLineCents: taxLine,
    staffCents: STAFF_ESTIMATE_CENTS,
    departmentBudgetCostCents: departmentCost,
  });
  return { ...t, marketSize, revenue, expenses, net: computeNetIncome(revenue, expenses) };
});

console.log(`\n--- SEASON-ONE FINANCES (fresh league, no playoffs) ---`);
console.log(
  `${"TEAM".padEnd(6)}${"MKT".padEnd(7)}${"PAYROLL".padStart(10)}${"TAX".padStart(10)}${"REVENUE".padStart(10)}${"NET".padStart(11)}`,
);
for (const f of [...finances].sort((a, b) => b.net - a.net)) {
  console.log(
    `${f.team.padEnd(6)}${f.marketSize.padEnd(7)}${M(f.payroll).padStart(10)}${M(f.expenses.luxuryTaxCents).padStart(10)}${M(f.revenue.totalCents).padStart(10)}${((f.net >= 0 ? "+" : "") + M(f.net)).padStart(11)}`,
  );
}

const profitable = finances.filter((f) => f.net > 0).length;
const leagueNet = finances.reduce((s, f) => s + f.net, 0);
const nets = finances.map((f) => f.net).sort((a, b) => a - b);
console.log(`\nprofitable        ${profitable}/30   (real NBA ~20-25/30)`);
console.log(`league net income ${(leagueNet >= 0 ? "+" : "") + M(leagueNet)}   (real NBA ~+$2B)`);
console.log(`median team       ${(nets[15] >= 0 ? "+" : "") + M(nets[15])}   (real NBA ~+$70M)`);
console.log(`worst team        ${M(nets[0])}`);
console.log(`total luxury tax  ${M(finances.reduce((s, f) => s + f.expenses.luxuryTaxCents, 0))}`);
