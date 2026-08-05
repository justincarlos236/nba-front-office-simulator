import { describe, it, expect } from "vitest";
import {
  computeArenaAttendanceBonus,
  computeArenaAgingDelta,
  applyArenaQualityDelta,
  isRelocationEligible,
  computeStartingCityWillingness,
  computeArenaFundingDiscount,
  buildNegotiationRound,
  ARENA_FUNDING_SUCCESS_THRESHOLD,
  RELOCATION_DESTINATIONS,
  computeRelocationFanHappinessHit,
  type RelocationEligibilityInputs,
} from "./arena";

const M = 1_000_000 * 100;

describe("computeArenaAttendanceBonus", () => {
  it("is zero at the neutral quality (65)", () => {
    expect(computeArenaAttendanceBonus(65)).toBe(0);
  });

  it("is positive above neutral, negative below", () => {
    expect(computeArenaAttendanceBonus(100)).toBeGreaterThan(0);
    expect(computeArenaAttendanceBonus(0)).toBeLessThan(0);
  });

  it("is bounded", () => {
    expect(computeArenaAttendanceBonus(100)).toBeLessThanOrEqual(0.08);
    expect(computeArenaAttendanceBonus(0)).toBeGreaterThanOrEqual(-0.08);
  });
});

describe("computeArenaAgingDelta / applyArenaQualityDelta", () => {
  it("ages down by a small amount above the floor", () => {
    expect(computeArenaAgingDelta(65)).toBeLessThan(0);
  });

  it("stops decaying at the floor", () => {
    expect(computeArenaAgingDelta(20)).toBe(0);
  });

  it("clamps into 0-100", () => {
    expect(applyArenaQualityDelta(99, 10)).toBe(100);
    expect(applyArenaQualityDelta(1, -10)).toBe(0);
  });
});

describe("isRelocationEligible", () => {
  const eligible: RelocationEligibilityInputs = {
    recentNetIncomesCents: [-10 * M, -12 * M, -8 * M],
    currentCashCents: -20 * M,
    failedArenaNegotiations: 2,
    leaseExpiresSeason: 2027,
    currentSeason: 2027,
    ownerConfidence: 10,
  };

  it("is eligible only when every gate holds simultaneously", () => {
    expect(isRelocationEligible(eligible)).toBe(true);
  });

  it("is not eligible if net income hasn't been negative for long enough", () => {
    expect(
      isRelocationEligible({ ...eligible, recentNetIncomesCents: [-10 * M, 5 * M, -8 * M] }),
    ).toBe(false);
  });

  it("is not eligible if cash is still positive", () => {
    expect(isRelocationEligible({ ...eligible, currentCashCents: 5 * M })).toBe(false);
  });

  it("is not eligible without enough failed negotiations", () => {
    expect(isRelocationEligible({ ...eligible, failedArenaNegotiations: 1 })).toBe(false);
  });

  it("is not eligible while the lease still has time left", () => {
    expect(isRelocationEligible({ ...eligible, leaseExpiresSeason: 2030 })).toBe(false);
  });

  it("is not eligible unless owner confidence is at the CRITICAL floor", () => {
    expect(isRelocationEligible({ ...eligible, ownerConfidence: 40 })).toBe(false);
  });

  it("is never eligible for a healthy, well-run franchise", () => {
    expect(
      isRelocationEligible({
        recentNetIncomesCents: [10 * M, 12 * M, 8 * M],
        currentCashCents: 50 * M,
        failedArenaNegotiations: 0,
        leaseExpiresSeason: 2035,
        currentSeason: 2027,
        ownerConfidence: 70,
      }),
    ).toBe(false);
  });
});

describe("computeStartingCityWillingness", () => {
  it("a financially strong, large-market, Win-Now Billionaire team starts far more receptive than a distressed small-market Absentee one", () => {
    const strong = computeStartingCityWillingness({
      financialStanding: "STRONG",
      marketSize: "LARGE",
      ownerArchetype: "WIN_NOW_BILLIONAIRE",
      failedArenaNegotiations: 0,
    });
    const weak = computeStartingCityWillingness({
      financialStanding: "DISTRESSED",
      marketSize: "SMALL",
      ownerArchetype: "ABSENTEE",
      failedArenaNegotiations: 3,
    });
    expect(strong).toBeGreaterThan(weak);
  });

  it("past failed negotiations lower the starting willingness", () => {
    const base = {
      financialStanding: "STABLE" as const,
      marketSize: "MID" as const,
      ownerArchetype: "PATIENT_BUILDER" as const,
    };
    const fresh = computeStartingCityWillingness({ ...base, failedArenaNegotiations: 0 });
    const burned = computeStartingCityWillingness({ ...base, failedArenaNegotiations: 3 });
    expect(burned).toBeLessThan(fresh);
  });

  it("stays within 0-100", () => {
    const min = computeStartingCityWillingness({
      financialStanding: "DISTRESSED",
      marketSize: "SMALL",
      ownerArchetype: "ABSENTEE",
      failedArenaNegotiations: 10,
    });
    expect(min).toBeGreaterThanOrEqual(0);
  });
});

describe("computeArenaFundingDiscount", () => {
  it("is zero below the success threshold", () => {
    expect(computeArenaFundingDiscount(ARENA_FUNDING_SUCCESS_THRESHOLD - 1)).toBe(0);
  });

  it("grows with margin above the threshold", () => {
    const small = computeArenaFundingDiscount(ARENA_FUNDING_SUCCESS_THRESHOLD + 5);
    const big = computeArenaFundingDiscount(ARENA_FUNDING_SUCCESS_THRESHOLD + 30);
    expect(big).toBeGreaterThan(small);
  });

  it("is capped", () => {
    expect(computeArenaFundingDiscount(100)).toBeLessThanOrEqual(0.35);
  });
});

describe("buildNegotiationRound - ARENA_FUNDING", () => {
  it("has exactly 3 distinct rounds, each with 2+ real options", () => {
    for (let round = 1; round <= 3; round++) {
      const content = buildNegotiationRound("ARENA_FUNDING", round, 50);
      expect(content.options.length).toBeGreaterThanOrEqual(2);
      expect(content.options.map((o) => o.id).includes(content.defaultOptionId)).toBe(true);
    }
  });

  it("round 3 offers a way to end the negotiation early (walk away)", () => {
    const content = buildNegotiationRound("ARENA_FUNDING", 3, 50);
    expect(content.options.some((o) => o.endsNegotiation === "FAILED")).toBe(true);
  });

  it("every option genuinely moves the willingness score or costs something real, never a pure no-op", () => {
    for (let round = 1; round <= 3; round++) {
      const content = buildNegotiationRound("ARENA_FUNDING", round, 50);
      for (const opt of content.options) {
        const isNoOp =
          (opt.cityWillingnessDelta ?? 0) === 0 &&
          opt.cashDeltaCents === 0 &&
          opt.fanHappinessDelta === 0 &&
          opt.ownerConfidenceDelta === 0 &&
          !opt.endsNegotiation &&
          !opt.outcomePatch;
        expect(isNoOp).toBe(false);
      }
    }
  });

  it("the body text reflects the current willingness score in rounds 2 and 3", () => {
    const receptive = buildNegotiationRound("ARENA_FUNDING", 2, 80);
    const cold = buildNegotiationRound("ARENA_FUNDING", 2, 10);
    expect(receptive.body).not.toBe(cold.body);
  });
});

describe("buildNegotiationRound - RELOCATION_DECISION", () => {
  it("round 1 offers a real way to refuse and stay", () => {
    const content = buildNegotiationRound("RELOCATION_DECISION", 1, 50);
    const refuse = content.options.find((o) => o.id === "refuse");
    expect(refuse?.endsNegotiation).toBe("FAILED");
  });

  it("round 2 offers exactly the known destination list, each patching a market size", () => {
    const content = buildNegotiationRound("RELOCATION_DECISION", 2, 50);
    expect(content.options).toHaveLength(RELOCATION_DESTINATIONS.length);
    for (const opt of content.options) {
      expect(opt.outcomePatch).toHaveProperty("cityName");
      expect(opt.outcomePatch).toHaveProperty("marketSize");
    }
  });

  it("round 3 offers a real cash-vs-fan-happiness-severity trade-off", () => {
    const content = buildNegotiationRound("RELOCATION_DECISION", 3, 50);
    const compensate = content.options.find((o) => o.id === "compensate");
    const announce = content.options.find((o) => o.id === "announce-and-move");
    expect(compensate?.cashDeltaCents).toBeLessThan(0);
    expect(compensate?.outcomePatch?.fanHappinessSeverity).toBe("SOFT");
    expect(announce?.cashDeltaCents).toBe(0);
    expect(announce?.outcomePatch?.fanHappinessSeverity).toBe("SEVERE");
  });
});

describe("computeRelocationFanHappinessHit", () => {
  it("is always a severe, permanent-feeling hit - never a minor nudge", () => {
    expect(computeRelocationFanHappinessHit("SOFT")).toBeLessThan(-20);
    expect(computeRelocationFanHappinessHit("SEVERE")).toBeLessThan(
      computeRelocationFanHappinessHit("SOFT"),
    );
  });
});
