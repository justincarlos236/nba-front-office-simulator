import { describe, it, expect } from "vitest";
import {
  computeSeasonRevenue,
  computeSeasonExpenses,
  computeLuxuryTax,
  computeNetIncome,
  computeFinancialHealth,
  computeFranchiseValue,
  startingCashReserveCents,
  pickCpuTicketPosture,
  financialSpendingResistance,
  resolveOwnerBailout,
} from "./finances";

const M = 1_000_000 * 100; // one million dollars in cents

describe("computeSeasonRevenue", () => {
  const base = {
    attendancePct: 0.9,
    franchisePopularity: 65,
    starTier: "STARTER" as const,
    ticketPosture: "STANDARD" as const,
    playoffHomeGames: 0,
    wonChampionship: false,
  };

  it("large markets out-earn small markets given identical everything else", () => {
    const large = computeSeasonRevenue({ ...base, marketSize: "LARGE" });
    const small = computeSeasonRevenue({ ...base, marketSize: "SMALL" });
    expect(large.totalCents).toBeGreaterThan(small.totalCents);
  });

  it("higher attendance lifts ticket revenue", () => {
    const full = computeSeasonRevenue({ ...base, marketSize: "MID", attendancePct: 1.0 });
    const empty = computeSeasonRevenue({ ...base, marketSize: "MID", attendancePct: 0.5 });
    expect(full.ticketCents).toBeGreaterThan(empty.ticketCents);
  });

  it("PREMIUM ticket posture earns more gate than FAN_FRIENDLY", () => {
    const premium = computeSeasonRevenue({ ...base, marketSize: "MID", ticketPosture: "PREMIUM" });
    const friendly = computeSeasonRevenue({
      ...base,
      marketSize: "MID",
      ticketPosture: "FAN_FRIENDLY",
    });
    expect(premium.ticketCents).toBeGreaterThan(friendly.ticketCents);
  });

  it("a superstar adds sponsorship revenue over a plain starter", () => {
    const star = computeSeasonRevenue({ ...base, marketSize: "MID", starTier: "SUPERSTAR" });
    const plain = computeSeasonRevenue({ ...base, marketSize: "MID", starTier: "STARTER" });
    expect(star.mediaCents).toBeGreaterThan(plain.mediaCents);
  });

  it("playoff home games and a championship add revenue", () => {
    const run = computeSeasonRevenue({
      ...base,
      marketSize: "MID",
      playoffHomeGames: 10,
      wonChampionship: true,
    });
    expect(run.playoffCents).toBeGreaterThan(0);
    const noRun = computeSeasonRevenue({ ...base, marketSize: "MID" });
    expect(noRun.playoffCents).toBe(0);
  });

  it("small markets get a revenue-sharing floor boost over mid markets", () => {
    const small = computeSeasonRevenue({ ...base, marketSize: "SMALL" });
    const mid = computeSeasonRevenue({ ...base, marketSize: "MID" });
    expect(small.leagueCents).toBeGreaterThan(mid.leagueCents);
  });
});

describe("computeLuxuryTax", () => {
  it("is zero at or under the tax line", () => {
    expect(computeLuxuryTax(100 * M, 165 * M)).toBe(0);
    expect(computeLuxuryTax(165 * M, 165 * M)).toBe(0);
  });

  it("charges a multiple of the amount over the line", () => {
    expect(computeLuxuryTax(185 * M, 165 * M)).toBe(Math.round(20 * M * 1.5));
  });
});

describe("computeSeasonExpenses", () => {
  const base = {
    marketSize: "MID" as const,
    payrollCents: 140 * M,
    luxuryTaxLineCents: 165 * M,
    staffCents: 12 * M,
    departmentBudgetCostCents: 18 * M,
  };

  it("sums every bucket", () => {
    // Every optional bucket populated, so this actually guards the total. With
    // the defaults it silently skipped four of them, which is how a new
    // expense could be added without the sum ever being checked against it.
    const e = computeSeasonExpenses({
      ...base,
      payrollCents: 100 * M,
      salaryFloorCents: 139 * M,
      otherExpenseCents: 3 * M,
      interestExpenseCents: 5 * M,
    });
    expect(e.salaryFloorShortfallCents).toBeGreaterThan(0);
    expect(e.totalCents).toBe(
      e.payrollCents +
        e.luxuryTaxCents +
        e.salaryFloorShortfallCents +
        e.staffCents +
        e.investmentCents +
        e.operatingCents +
        e.otherExpenseCents +
        e.interestExpenseCents,
    );
  });

  it("Finances as a Gameplay Pillar (Phase 5) - debt interest is a real expense bucket", () => {
    const noDebt = computeSeasonExpenses(base);
    const withDebt = computeSeasonExpenses({ ...base, interestExpenseCents: 8 * M });
    expect(noDebt.interestExpenseCents).toBe(0);
    expect(withDebt.interestExpenseCents).toBe(8 * M);
    expect(withDebt.totalCents - noDebt.totalCents).toBe(8 * M);
  });

  /**
   * docs/audits/FINANCE_AUDIT.md P1-5. The CBA's own penalty: a team under the minimum
   * team salary pays the shortfall to its players anyway, so being cheap does
   * not actually save the money. Before this, Houston fielded a $104.5M roster
   * against a $139.2M floor and posted the best net income in the league.
   */
  describe("salary floor", () => {
    const floor = 139 * M;

    it("charges nothing to a team at or above the floor", () => {
      expect(
        computeSeasonExpenses({ ...base, payrollCents: 150 * M, salaryFloorCents: floor })
          .salaryFloorShortfallCents,
      ).toBe(0);
      expect(
        computeSeasonExpenses({ ...base, payrollCents: floor, salaryFloorCents: floor })
          .salaryFloorShortfallCents,
      ).toBe(0);
    });

    it("charges exactly the shortfall to a team below it", () => {
      const e = computeSeasonExpenses({
        ...base,
        payrollCents: 104 * M,
        salaryFloorCents: floor,
      });
      expect(e.salaryFloorShortfallCents).toBe(35 * M);
    });

    it("removes the saving from going cheap, dollar for dollar", () => {
      // The whole point of the rule. Two teams, one $35M cheaper, identical
      // otherwise - their total expenses must come out the same.
      const cheap = computeSeasonExpenses({
        ...base,
        payrollCents: 104 * M,
        salaryFloorCents: floor,
      });
      const atFloor = computeSeasonExpenses({
        ...base,
        payrollCents: floor,
        salaryFloorCents: floor,
      });
      expect(cheap.totalCents).toBe(atFloor.totalCents);
    });

    it("is inert for callers that do not pass a floor", () => {
      expect(
        computeSeasonExpenses({ ...base, payrollCents: 10 * M }).salaryFloorShortfallCents,
      ).toBe(0);
    });
  });

  it("a tax-paying roster costs more than an under-tax one", () => {
    const overTax = computeSeasonExpenses({ ...base, payrollCents: 210 * M });
    const underTax = computeSeasonExpenses({ ...base, payrollCents: 140 * M });
    expect(overTax.luxuryTaxCents).toBeGreaterThan(0);
    expect(underTax.luxuryTaxCents).toBe(0);
    expect(overTax.totalCents).toBeGreaterThan(underTax.totalCents);
  });

  it("a bigger department budget costs more, dollar for dollar", () => {
    const bigBudget = computeSeasonExpenses({ ...base, departmentBudgetCostCents: 40 * M });
    const smallBudget = computeSeasonExpenses({ ...base, departmentBudgetCostCents: 5 * M });
    expect(bigBudget.investmentCents).toBeGreaterThan(smallBudget.investmentCents);
    expect(bigBudget.totalCents - smallBudget.totalCents).toBe(35 * M);
  });
});

describe("net income and financial health", () => {
  it("a well-run modest-market team is profitable and at least stable", () => {
    const revenue = computeSeasonRevenue({
      marketSize: "MID",
      attendancePct: 0.88,
      franchisePopularity: 65,
      starTier: "STARTER",
      ticketPosture: "STANDARD",
      playoffHomeGames: 0,
      wonChampionship: false,
    });
    const expenses = computeSeasonExpenses({
      marketSize: "MID",
      payrollCents: 130 * M,
      luxuryTaxLineCents: 165 * M,
      staffCents: 12 * M,
      departmentBudgetCostCents: 18 * M,
    });
    const net = computeNetIncome(revenue, expenses);
    expect(net).toBeGreaterThan(0);
    const health = computeFinancialHealth(startingCashReserveCents("MID"), net);
    expect(["STABLE", "HEALTHY", "THRIVING"]).toContain(health);
  });

  it("a small market spending deep into the tax without success loses money", () => {
    const revenue = computeSeasonRevenue({
      marketSize: "SMALL",
      attendancePct: 0.78,
      franchisePopularity: 50,
      starTier: "STAR",
      ticketPosture: "STANDARD",
      playoffHomeGames: 0,
      wonChampionship: false,
    });
    const expenses = computeSeasonExpenses({
      marketSize: "SMALL",
      payrollCents: 210 * M,
      luxuryTaxLineCents: 165 * M,
      staffCents: 13 * M,
      departmentBudgetCostCents: 18 * M,
    });
    const net = computeNetIncome(revenue, expenses);
    expect(net).toBeLessThan(0);
  });

  it("a negative cash reserve is always IN_THE_RED regardless of net income", () => {
    expect(computeFinancialHealth(-1, 100 * M)).toBe("IN_THE_RED");
  });

  it("buckets net income sensibly when cash is positive", () => {
    const cash = 50 * M;
    expect(computeFinancialHealth(cash, 100 * M)).toBe("THRIVING");
    expect(computeFinancialHealth(cash, 40 * M)).toBe("HEALTHY");
    expect(computeFinancialHealth(cash, 0)).toBe("STABLE");
    expect(computeFinancialHealth(cash, -50 * M)).toBe("STRAINED");
  });
});

describe("computeFranchiseValue", () => {
  const base = {
    marketSize: "MID" as const,
    franchisePopularity: 65,
    playoffOutcomeIndex: 0,
    cashReserveCents: 50 * M,
    priorValueCents: 0,
  };

  it("uses the target directly when no prior value is established", () => {
    const v = computeFranchiseValue(base);
    expect(v).toBeGreaterThan(0);
  });

  it("large markets are worth more than small markets", () => {
    const large = computeFranchiseValue({ ...base, marketSize: "LARGE" });
    const small = computeFranchiseValue({ ...base, marketSize: "SMALL" });
    expect(large).toBeGreaterThan(small);
  });

  it("winning the title lifts value above missing the playoffs", () => {
    const champ = computeFranchiseValue({ ...base, playoffOutcomeIndex: 6 });
    const lottery = computeFranchiseValue({ ...base, playoffOutcomeIndex: 0 });
    expect(champ).toBeGreaterThan(lottery);
  });

  it("a franchise icon lifts value (icon premium fraction)", () => {
    const withIcon = computeFranchiseValue({ ...base, iconPremiumFraction: 0.15 });
    const without = computeFranchiseValue({ ...base, iconPremiumFraction: 0 });
    expect(withIcon).toBeGreaterThan(without);
  });

  it("smooths toward the target rather than jumping to it", () => {
    const prior = 2_000 * M;
    const smoothed = computeFranchiseValue({ ...base, priorValueCents: prior });
    const target = computeFranchiseValue({ ...base, priorValueCents: 0 });
    // Result sits strictly between prior and target (target here exceeds prior).
    expect(smoothed).toBeGreaterThan(prior);
    expect(smoothed).toBeLessThan(target);
  });

  /**
   * docs/audits/FINANCE_AUDIT.md P0-3: the cash term was `cash * 0.5` on an unbounded
   * quantity. Correct at the scale it was written for and badly wrong once cash
   * compounded - a team that reached $3.68B in the bank had $1.84B of its
   * franchise value coming from the balance sheet alone, swamping market,
   * winning and popularity together.
   */
  describe("cash contribution is bounded", () => {
    it("still rewards a healthy balance sheet", () => {
      const rich = computeFranchiseValue({ ...base, cashReserveCents: 300 * M });
      const broke = computeFranchiseValue({ ...base, cashReserveCents: 0 });
      expect(rich).toBeGreaterThan(broke);
    });

    it("never lets hoarded cash outweigh the market baseline", () => {
      // A MID market's baseline is $2.4B. Absurd cash must not approach it.
      const hoarder = computeFranchiseValue({ ...base, cashReserveCents: 10_000 * M });
      const modest = computeFranchiseValue({ ...base, cashReserveCents: 0 });
      expect(hoarder - modest).toBeLessThan(500 * M);
    });

    it("keeps winning worth more than a fortune in the bank", () => {
      // The whole point: a title should move value more than compounding cash.
      const championWithNoCash = computeFranchiseValue({
        ...base,
        playoffOutcomeIndex: 6,
        cashReserveCents: 0,
      });
      const lotteryHoarder = computeFranchiseValue({
        ...base,
        playoffOutcomeIndex: 0,
        cashReserveCents: 5_000 * M,
      });
      expect(championWithNoCash).toBeGreaterThan(lotteryHoarder);
    });

    it("leaves ordinary balances behaving as they always did", () => {
      // The curve's slope at zero is exactly the old CASH_VALUE_WEIGHT, so a
      // normal starting reserve must land within a few percent of the old
      // linear result - this fix bounds the runaway end, it does not re-tune
      // the ordinary case.
      const startingCash = 120 * M;
      const withCash = computeFranchiseValue({ ...base, cashReserveCents: startingCash });
      const withoutCash = computeFranchiseValue({ ...base, cashReserveCents: 0 });
      const oldLinearContribution = startingCash * 0.5;
      const actual = withCash - withoutCash;
      expect(actual).toBeGreaterThan(oldLinearContribution * 0.85);
      expect(actual).toBeLessThanOrEqual(oldLinearContribution);
    });
  });
});

/**
 * docs/audits/FINANCE_AUDIT.md P0-2 - the finance pillar's failure state. Before this,
 * insolvency was free: teams reached −$3.4B in cash over 15 seasons and kept
 * playing exactly as before.
 */
describe("resolveOwnerBailout", () => {
  it("leaves a solvent team alone", () => {
    const r = resolveOwnerBailout({ cashAfterSeasonCents: 40 * M, isUserTeam: true });
    expect(r.bailoutCents).toBe(0);
    expect(r.confidenceCost).toBe(0);
    expect(r.cashAfterCents).toBe(40 * M);
  });

  it("leaves a team that is merely in the red alone", () => {
    // Dipping slightly negative is an ordinary consequence of an aggressive
    // season and stays the manager's problem to trade out of.
    const r = resolveOwnerBailout({ cashAfterSeasonCents: -20 * M, isUserTeam: true });
    expect(r.bailoutCents).toBe(0);
    expect(r.cashAfterCents).toBe(-20 * M);
  });

  it("rescues a team that has genuinely run out of money", () => {
    const r = resolveOwnerBailout({ cashAfterSeasonCents: -200 * M, isUserTeam: true });
    expect(r.bailoutCents).toBeGreaterThan(0);
    expect(r.cashAfterCents).toBeGreaterThan(0);
    expect(r.confidenceCost).toBeGreaterThan(0);
  });

  it("bounds the spiral - cash can never run away downward", () => {
    // The actual P0-2 defect. Whatever the deficit, the balance lands back in
    // a sane place instead of compounding into the billions.
    for (const deficit of [-100 * M, -1_000 * M, -100_000 * M]) {
      const r = resolveOwnerBailout({ cashAfterSeasonCents: deficit, isUserTeam: false });
      expect(r.cashAfterCents).toBeGreaterThan(0);
      expect(r.cashAfterCents).toBeLessThan(50 * M);
    }
  });

  it("charges more confidence for a bigger hole, within bounds", () => {
    const small = resolveOwnerBailout({ cashAfterSeasonCents: -60 * M, isUserTeam: true });
    const large = resolveOwnerBailout({ cashAfterSeasonCents: -300 * M, isUserTeam: true });
    expect(large.confidenceCost).toBeGreaterThan(small.confidenceCost);
    // A single catastrophic season must not be an instant firing on its own -
    // repeated bailouts are what compound toward MIN_OWNER_CONFIDENCE.
    const catastrophic = resolveOwnerBailout({
      cashAfterSeasonCents: -10_000 * M,
      isUserTeam: true,
    });
    expect(catastrophic.confidenceCost).toBeLessThanOrEqual(30);
  });

  it("costs a CPU team no confidence - it has no owner relationship to damage", () => {
    const cpu = resolveOwnerBailout({ cashAfterSeasonCents: -300 * M, isUserTeam: false });
    expect(cpu.bailoutCents).toBeGreaterThan(0);
    expect(cpu.confidenceCost).toBe(0);
  });

  it("does not re-trigger immediately on the next small loss", () => {
    // The rescue leaves a cushion rather than exactly zero, so one bad era
    // does not become an unbroken run of humiliations.
    const rescued = resolveOwnerBailout({ cashAfterSeasonCents: -200 * M, isUserTeam: true });
    const nextSeason = resolveOwnerBailout({
      cashAfterSeasonCents: rescued.cashAfterCents - 5 * M,
      isUserTeam: true,
    });
    expect(nextSeason.bailoutCents).toBe(0);
  });
});

describe("pickCpuTicketPosture", () => {
  it("charges premium in large markets, stays fan-friendly in small ones", () => {
    expect(pickCpuTicketPosture("LARGE")).toBe("PREMIUM");
    expect(pickCpuTicketPosture("MID")).toBe("STANDARD");
    expect(pickCpuTicketPosture("SMALL")).toBe("FAN_FRIENDLY");
  });
});

describe("financialSpendingResistance", () => {
  it("resists most in the red, mildly on a thin cushion, not at all when healthy", () => {
    expect(financialSpendingResistance(-1)).toBe(1.5);
    expect(financialSpendingResistance(10 * M)).toBe(1.2);
    expect(financialSpendingResistance(100 * M)).toBe(1.0);
  });

  it("is monotonic - more cash never means more resistance", () => {
    const a = financialSpendingResistance(-50 * M);
    const b = financialSpendingResistance(10 * M);
    const c = financialSpendingResistance(200 * M);
    expect(a).toBeGreaterThanOrEqual(b);
    expect(b).toBeGreaterThanOrEqual(c);
  });
});
