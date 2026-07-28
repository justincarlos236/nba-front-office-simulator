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
    const e = computeSeasonExpenses(base);
    expect(e.totalCents).toBe(
      e.payrollCents + e.luxuryTaxCents + e.staffCents + e.investmentCents + e.operatingCents,
    );
  });

  it("Finances as a Gameplay Pillar (Phase 5) - debt interest is a real expense bucket", () => {
    const noDebt = computeSeasonExpenses(base);
    const withDebt = computeSeasonExpenses({ ...base, interestExpenseCents: 8 * M });
    expect(noDebt.interestExpenseCents).toBe(0);
    expect(withDebt.interestExpenseCents).toBe(8 * M);
    expect(withDebt.totalCents - noDebt.totalCents).toBe(8 * M);
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
