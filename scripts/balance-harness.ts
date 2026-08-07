/**
 * Phase 6, "CPU Selective Depth, Balance & Docs" (2026-08-06) - a 20-season
 * balance harness for the finance model, run entirely in-memory against the
 * pure functions in src/lib/finances (no database, no Next.js request
 * context, no auth). See docs/FINANCES_PILLAR_DESIGN.md Part 8.5 for why:
 * advanceSeasonAction is auth-gated and its ~2000 lines of orchestration
 * (real playoffs, awards, retirements) aren't worth replicating just to
 * validate the finance model's long-run shape - this harness drives the
 * same computeSeasonRevenue/computeSeasonExpenses/computeFranchiseValue/
 * cpuPolicy.ts functions the real game uses, with a plausible synthetic
 * win%/payroll distribution standing in for actually-simulated games.
 *
 * What it checks (Part 8.5's specific questions):
 *   - Small-market vs. large-market franchise value and cash trajectories
 *     over 20 seasons (is a small market actually viable long-run?)
 *   - How often a team ever becomes relocation-eligible (should be rare,
 *     not never and not common)
 *   - Luxury-tax-line crossing frequency
 *   - CPU capital-project/loan/relocation counts (a sanity check that the
 *     new Tier-1 CPU policy fires sometimes, and doesn't run away)
 *
 * Not a vitest file - a standalone script the user runs by hand and reads
 * the printed report from, same as the existing scripts/backfill-*.ts.
 *
 * Run with: npx tsx scripts/balance-harness.ts [seasons]
 */
import {
  computeSeasonRevenue,
  computeSeasonExpenses,
  computeNetIncome,
  computeFranchiseValue,
  startingCashReserveCents,
  pickCpuTicketPosture,
} from "../src/lib/finances/finances";
import { computeFranchisePopularity, computeAttendancePct } from "../src/lib/fans/fanHappiness";
import { computeArenaAgingDelta, applyArenaQualityDelta } from "../src/lib/finances/arena";
import { computeAnnualInterestCents } from "../src/lib/finances/financing";
import {
  shouldCpuRenovateArena,
  shouldCpuTakeLoan,
  isCpuRelocationEligible,
  shouldCpuRelocate,
} from "../src/lib/finances/cpuPolicy";
import { capitalProjectCostCents } from "../src/lib/finances/capitalProjects";
import { createSeededRandom } from "../src/lib/contracts/seededRandom";
import type { MarketSize, OwnerArchetype } from "../src/generated/prisma/client";

const SEASONS = Number(process.argv[2] ?? 20);
const SEASON_START = 2025;
const LUXURY_TAX_LINE_CENTS = 165_294_000_00; // 2025-26 real line, held flat for the harness's purposes
const SALARY_CAP_CENTS = 141_000_000_00; // a plausible cap floor for payroll variety below

const ARCHETYPES: OwnerArchetype[] = [
  "WIN_NOW_BILLIONAIRE",
  "PENNY_PINCHER",
  "PATIENT_BUILDER",
  "ABSENTEE",
  "MEDDLER",
];

interface HarnessTeam {
  id: string;
  marketSize: MarketSize;
  ownerArchetype: OwnerArchetype;
  winPct: number; // fixed per team for the harness - a stable competitive tier, not a live standings sim
  cashReserveCents: number;
  franchiseValueCents: number;
  fanHappiness: number;
  arenaQualityIndex: number;
  arenaLeaseExpiresSeason: number;
  debtCents: number;
  failedArenaNegotiations: number;
  relocated: boolean;
  netIncomeHistory: number[]; // most recent first
  // Per-season counters, accumulated across the whole run.
  renovationCount: number;
  loanCount: number;
  relocationEligibleSeasons: number;
  taxPayingSeasons: number;
}

function buildTeams(): HarnessTeam[] {
  const teams: HarnessTeam[] = [];
  const marketSizes: MarketSize[] = ["LARGE", "MID", "SMALL"];
  let n = 0;
  for (const marketSize of marketSizes) {
    for (let i = 0; i < 5; i++) {
      // Spread win% across a believable competitive range per market, not
      // uniform - a real league has bad, mediocre, and good teams in every
      // market. 0.30 to 0.70 in 5 steps.
      const winPct = 0.3 + (i / 4) * 0.4;
      teams.push({
        id: `${marketSize}-${i}`,
        marketSize,
        ownerArchetype: ARCHETYPES[n % ARCHETYPES.length],
        winPct,
        cashReserveCents: startingCashReserveCents(marketSize),
        franchiseValueCents: 0,
        fanHappiness: 50 + Math.round(winPct * 40), // a winning team starts happier
        arenaQualityIndex: 65,
        arenaLeaseExpiresSeason: SEASON_START - 1, // already "expired" so the lease gate never blocks the harness's read on the other 3
        debtCents: 0,
        failedArenaNegotiations: 0,
        relocated: false,
        netIncomeHistory: [],
        renovationCount: 0,
        loanCount: 0,
        relocationEligibleSeasons: 0,
        taxPayingSeasons: 0,
      });
      n += 1;
    }
  }
  // A deliberate worst-case stress team: a small market, a terrible record,
  // and reckless tax-line spending regardless - to check whether sustained
  // financial distress is reachable in the model *at all* (a "0 loans, 0
  // relocation-eligible teams" result across only believable mid-of-the-
  // road teams doesn't tell us that on its own).
  teams.push({
    id: "STRESS-SMALL",
    marketSize: "SMALL",
    ownerArchetype: "WIN_NOW_BILLIONAIRE", // spends into the tax the hardest, per the harness's owner-flavored policy
    winPct: 0.2,
    cashReserveCents: startingCashReserveCents("SMALL"),
    franchiseValueCents: 0,
    fanHappiness: 35,
    arenaQualityIndex: 65,
    arenaLeaseExpiresSeason: SEASON_START - 1,
    debtCents: 0,
    failedArenaNegotiations: 0,
    relocated: false,
    netIncomeHistory: [],
    renovationCount: 0,
    loanCount: 0,
    relocationEligibleSeasons: 0,
    taxPayingSeasons: 0,
  });
  return teams;
}

/**
 * A payroll loosely tied to win% (better teams spend more) plus noise, so
 * both "cheap and bad" and "expensive and good" (and everything between)
 * show up. Scaled so a real range of teams cross LUXURY_TAX_LINE_CENTS -
 * without that, the harness can't actually exercise the tax-crossing or
 * debt-taking behavior it's meant to check (an early run with a narrower
 * range never had a single team reach the tax line, which was a harness
 * calibration bug, not a real finding about the finance model).
 */
function payrollForSeason(team: HarnessTeam, rng: () => number): number {
  if (team.id === "STRESS-SMALL") {
    // Spends deep into the tax every season regardless of the (poor)
    // record - the deliberately reckless case, so the harness can tell
    // whether sustained distress is reachable in the model at all.
    return LUXURY_TAX_LINE_CENTS * 1.15;
  }
  const base = SALARY_CAP_CENTS * (0.65 + team.winPct * 0.9);
  const noise = (rng() - 0.5) * 30_000_000_00;
  return Math.max(SALARY_CAP_CENTS * 0.55, base + noise);
}

function runHarness(seasons: number) {
  const teams = buildTeams();
  const rng = createSeededRandom("balance-harness");

  for (let s = 0; s < seasons; s++) {
    const season = SEASON_START + s;

    for (const team of teams) {
      const starTier = team.winPct > 0.55 ? "STAR" : team.winPct > 0.4 ? "STARTER" : "ROTATION";
      const franchisePopularity = computeFranchisePopularity(
        team.fanHappiness,
        starTier,
        team.marketSize,
      );
      const attendancePct = computeAttendancePct(team.fanHappiness, team.marketSize);
      const payrollCents = payrollForSeason(team, rng);
      const staffCents = 12_000_000_00;
      const departmentBudgetCostCents = 18_000_000_00; // a neutral-ish 6-department spend

      const revenue = computeSeasonRevenue({
        marketSize: team.marketSize,
        attendancePct,
        franchisePopularity,
        starTier,
        ticketPosture: pickCpuTicketPosture(team.marketSize),
        playoffHomeGames: team.winPct > 0.6 ? 4 : 0,
        wonChampionship: false,
      });
      const interestExpenseCents = computeAnnualInterestCents(team.debtCents);
      const expenses = computeSeasonExpenses({
        marketSize: team.marketSize,
        payrollCents,
        luxuryTaxLineCents: LUXURY_TAX_LINE_CENTS,
        staffCents,
        departmentBudgetCostCents,
        interestExpenseCents,
      });
      if (expenses.luxuryTaxCents > 0) team.taxPayingSeasons += 1;

      const netIncome = computeNetIncome(revenue, expenses);
      team.cashReserveCents += netIncome;
      team.netIncomeHistory.unshift(netIncome);
      if (team.netIncomeHistory.length > 5) team.netIncomeHistory.length = 5;

      team.franchiseValueCents = computeFranchiseValue({
        marketSize: team.marketSize,
        franchisePopularity,
        playoffOutcomeIndex: team.winPct > 0.6 ? 2 : 0,
        cashReserveCents: team.cashReserveCents,
        priorValueCents: team.franchiseValueCents,
      });

      // Arena ages every season in the harness (capital-project completion
      // isn't modeled - only the renovation *decision* and its cash cost
      // are, matching what the harness actually needs to check).
      team.arenaQualityIndex = applyArenaQualityDelta(
        team.arenaQualityIndex,
        computeArenaAgingDelta(team.arenaQualityIndex),
      );

      // CPU capital-project + financing policy, same functions offseason.ts calls.
      if (
        shouldCpuRenovateArena(
          {
            arenaQualityIndex: team.arenaQualityIndex,
            cashReserveCents: team.cashReserveCents,
            ownerArchetype: team.ownerArchetype,
            hasProjectInProgress: false,
          },
          rng,
        )
      ) {
        team.cashReserveCents -= capitalProjectCostCents("ARENA_RENOVATION");
        team.arenaQualityIndex = applyArenaQualityDelta(team.arenaQualityIndex, 15);
        team.renovationCount += 1;
      } else if (
        shouldCpuTakeLoan(
          { cashReserveCents: team.cashReserveCents, ownerArchetype: team.ownerArchetype },
          rng,
        )
      ) {
        team.cashReserveCents += 15_000_000_00; // loanAmountCents("SMALL")
        team.debtCents += 15_000_000_00;
        team.loanCount += 1;
      }

      // Relocation eligibility - the CPU gate only (no interactive owner-
      // confidence number in this harness to feed the user's own gate).
      const cpuEligible = isCpuRelocationEligible({
        recentNetIncomesCents: team.netIncomeHistory,
        currentCashCents: team.cashReserveCents,
        arenaQualityIndex: team.arenaQualityIndex,
        leaseExpiresSeason: team.arenaLeaseExpiresSeason,
        currentSeason: season,
      });
      if (cpuEligible) {
        team.relocationEligibleSeasons += 1;
        if (!team.relocated && shouldCpuRelocate(rng)) {
          team.relocated = true;
        }
      }
    }
  }

  return teams;
}

function fmtM(cents: number): string {
  return `$${(cents / 100 / 1_000_000).toFixed(1)}M`;
}

function summarizeByMarket(teams: HarnessTeam[], marketSize: MarketSize) {
  const group = teams.filter((t) => t.marketSize === marketSize);
  const avgValue = group.reduce((s, t) => s + t.franchiseValueCents, 0) / group.length;
  const avgCash = group.reduce((s, t) => s + t.cashReserveCents, 0) / group.length;
  const anyNegativeCash = group.filter((t) => t.cashReserveCents < 0).length;
  return { avgValue, avgCash, anyNegativeCash, count: group.length };
}

function main() {
  console.log(`Running the balance harness for ${SEASONS} synthetic seasons...\n`);
  const teams = runHarness(SEASONS);

  console.log("=== Franchise value & cash by market size ===");
  for (const marketSize of ["LARGE", "MID", "SMALL"] as MarketSize[]) {
    const s = summarizeByMarket(teams, marketSize);
    console.log(
      `${marketSize.padEnd(6)} avg value ${fmtM(s.avgValue).padStart(10)}  avg cash ${fmtM(s.avgCash).padStart(10)}  teams ending in the red: ${s.anyNegativeCash}/${s.count}`,
    );
  }

  const totalTaxSeasons = teams.reduce((s, t) => s + t.taxPayingSeasons, 0);
  const totalTeamSeasons = teams.length * SEASONS;
  console.log(
    `\nLuxury-tax-line crossings: ${totalTaxSeasons}/${totalTeamSeasons} team-seasons (${((totalTaxSeasons / totalTeamSeasons) * 100).toFixed(1)}%)`,
  );

  console.log("\n=== CPU Tier-1 policy activity ===");
  const totalRenovations = teams.reduce((s, t) => s + t.renovationCount, 0);
  const totalLoans = teams.reduce((s, t) => s + t.loanCount, 0);
  const teamsEverRelocationEligible = teams.filter((t) => t.relocationEligibleSeasons > 0).length;
  const teamsRelocated = teams.filter((t) => t.relocated).length;
  console.log(
    `Arena renovations started: ${totalRenovations} across ${teams.length} teams over ${SEASONS} seasons`,
  );
  console.log(`Loans taken: ${totalLoans} across ${teams.length} teams over ${SEASONS} seasons`);
  console.log(
    `Teams that were EVER relocation-eligible: ${teamsEverRelocationEligible}/${teams.length}`,
  );
  console.log(`Teams that actually relocated: ${teamsRelocated}/${teams.length}`);

  console.log("\n=== Per-team detail ===");
  for (const t of teams) {
    console.log(
      `${t.id.padEnd(10)} value ${fmtM(t.franchiseValueCents).padStart(10)}  cash ${fmtM(t.cashReserveCents).padStart(10)}  arena ${String(t.arenaQualityIndex).padStart(3)}  renos ${t.renovationCount}  loans ${t.loanCount}  relocated ${t.relocated ? "YES" : "no"}`,
    );
  }
}

main();
