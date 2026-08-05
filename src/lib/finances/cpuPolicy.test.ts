import { describe, it, expect } from "vitest";
import {
  shouldCpuRenovateArena,
  shouldCpuTakeLoan,
  isCpuRelocationEligible,
  shouldCpuRelocate,
  pickCpuRelocationDestinationIndex,
} from "./cpuPolicy";

const M = 1_000_000 * 100;

function rngAt(fraction: number): () => number {
  return () => fraction;
}

describe("shouldCpuRenovateArena", () => {
  const healthy = {
    arenaQualityIndex: 40,
    cashReserveCents: 200 * M,
    ownerArchetype: "PATIENT_BUILDER" as const,
    hasProjectInProgress: false,
  };

  it("never renovates with a project already in progress", () => {
    expect(shouldCpuRenovateArena({ ...healthy, hasProjectInProgress: true }, rngAt(0))).toBe(
      false,
    );
  });

  it("never renovates when arena quality is already fine", () => {
    expect(shouldCpuRenovateArena({ ...healthy, arenaQualityIndex: 80 }, rngAt(0))).toBe(false);
  });

  it("never renovates without a comfortable cash cushion", () => {
    expect(shouldCpuRenovateArena({ ...healthy, cashReserveCents: 10 * M }, rngAt(0))).toBe(false);
  });

  it("can renovate when quality is low, cash is healthy, and the roll lands under the threshold", () => {
    expect(shouldCpuRenovateArena(healthy, rngAt(0))).toBe(true);
  });

  it("never renovates when the roll lands above the threshold", () => {
    expect(shouldCpuRenovateArena(healthy, rngAt(0.999))).toBe(false);
  });

  it("a Win-Now Billionaire renovates more readily than a Penny-Pincher at the same roll", () => {
    // A roll that clears the billionaire's higher chance but not the
    // penny-pincher's lower one - since chance = base * multiplier and
    // WIN_NOW_BILLIONAIRE's multiplier (2) is 5x PENNY_PINCHER's (0.4).
    const midRoll = 0.2; // base chance is 0.15
    const billionaire = shouldCpuRenovateArena(
      { ...healthy, ownerArchetype: "WIN_NOW_BILLIONAIRE" },
      rngAt(midRoll),
    );
    const pennyPincher = shouldCpuRenovateArena(
      { ...healthy, ownerArchetype: "PENNY_PINCHER" },
      rngAt(midRoll),
    );
    expect(billionaire).toBe(true);
    expect(pennyPincher).toBe(false);
  });
});

describe("shouldCpuTakeLoan", () => {
  it("never borrows when cash is fine", () => {
    expect(
      shouldCpuTakeLoan({ cashReserveCents: 50 * M, ownerArchetype: "PATIENT_BUILDER" }, rngAt(0)),
    ).toBe(false);
  });

  it("can borrow when deeply in the red and the roll clears the threshold", () => {
    expect(
      shouldCpuTakeLoan({ cashReserveCents: -20 * M, ownerArchetype: "PATIENT_BUILDER" }, rngAt(0)),
    ).toBe(true);
  });

  it("never borrows when the roll lands above the threshold", () => {
    expect(
      shouldCpuTakeLoan(
        { cashReserveCents: -20 * M, ownerArchetype: "PATIENT_BUILDER" },
        rngAt(0.999),
      ),
    ).toBe(false);
  });

  it("a Penny-Pincher resists debt more than a Win-Now Billionaire at the same roll", () => {
    const midRoll = 0.4; // base chance is 0.5
    const billionaire = shouldCpuTakeLoan(
      { cashReserveCents: -20 * M, ownerArchetype: "WIN_NOW_BILLIONAIRE" },
      rngAt(midRoll),
    );
    const pennyPincher = shouldCpuTakeLoan(
      { cashReserveCents: -20 * M, ownerArchetype: "PENNY_PINCHER" },
      rngAt(midRoll),
    );
    expect(billionaire).toBe(true);
    expect(pennyPincher).toBe(false);
  });
});

describe("isCpuRelocationEligible", () => {
  const distressed = {
    recentNetIncomesCents: [-5 * M, -5 * M, -5 * M, -5 * M, -5 * M],
    currentCashCents: -10 * M,
    arenaQualityIndex: 15,
    leaseExpiresSeason: 2025,
    currentSeason: 2030,
  };

  it("is eligible when every gate holds simultaneously", () => {
    expect(isCpuRelocationEligible(distressed)).toBe(true);
  });

  it("requires enough consecutive losing seasons of history", () => {
    expect(
      isCpuRelocationEligible({ ...distressed, recentNetIncomesCents: [-5 * M, -5 * M] }),
    ).toBe(false);
  });

  it("requires every one of the recent seasons to actually be a loss", () => {
    expect(
      isCpuRelocationEligible({
        ...distressed,
        recentNetIncomesCents: [-5 * M, -5 * M, 1 * M, -5 * M, -5 * M],
      }),
    ).toBe(false);
  });

  it("requires current cash to be negative too, not just history", () => {
    expect(isCpuRelocationEligible({ ...distressed, currentCashCents: 1 * M })).toBe(false);
  });

  it("requires the arena to be genuinely neglected, not just middling", () => {
    expect(isCpuRelocationEligible({ ...distressed, arenaQualityIndex: 65 })).toBe(false);
  });

  it("requires the lease to have actually expired", () => {
    expect(isCpuRelocationEligible({ ...distressed, leaseExpiresSeason: 2035 })).toBe(false);
  });

  it("never fires for a healthy team on any axis, even by accident", () => {
    expect(
      isCpuRelocationEligible({
        recentNetIncomesCents: [5 * M, 5 * M, 5 * M, 5 * M, 5 * M],
        currentCashCents: 100 * M,
        arenaQualityIndex: 65,
        leaseExpiresSeason: 2050,
        currentSeason: 2030,
      }),
    ).toBe(false);
  });
});

describe("shouldCpuRelocate", () => {
  it("is a probability roll, not a guarantee, even when eligible", () => {
    expect(shouldCpuRelocate(rngAt(0))).toBe(true);
    expect(shouldCpuRelocate(rngAt(0.999))).toBe(false);
  });
});

describe("pickCpuRelocationDestinationIndex", () => {
  it("stays within bounds across the full roll range", () => {
    for (let i = 0; i < 50; i++) {
      const idx = pickCpuRelocationDestinationIndex(3, rngAt(i / 50));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });

  it("is deterministic for a given rng", () => {
    const a = pickCpuRelocationDestinationIndex(5, rngAt(0.5));
    const b = pickCpuRelocationDestinationIndex(5, rngAt(0.5));
    expect(a).toBe(b);
  });
});
