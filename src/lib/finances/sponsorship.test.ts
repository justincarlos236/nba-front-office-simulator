import { describe, it, expect } from "vitest";
import {
  computeCpuSponsorshipRevenueCents,
  computeSponsorshipVoidPenaltyCents,
} from "./sponsorship";

const M = 1_000_000 * 100;

describe("computeCpuSponsorshipRevenueCents", () => {
  it("large markets out-earn small markets given identical star power", () => {
    const large = computeCpuSponsorshipRevenueCents("LARGE", null);
    const small = computeCpuSponsorshipRevenueCents("SMALL", null);
    expect(large).toBeGreaterThan(small);
  });

  it("a superstar lifts sponsorship revenue over no star at all", () => {
    const withStar = computeCpuSponsorshipRevenueCents("MID", "SUPERSTAR");
    const withoutStar = computeCpuSponsorshipRevenueCents("MID", null);
    expect(withStar).toBeGreaterThan(withoutStar);
  });

  it("stays below what a comparable user-negotiated deal would pay, since CPU never shops for the best offer", () => {
    // The richest sponsorship card (SPONSORSHIP_STAR_CLAUSE) pays $32M/yr for
    // a large-market-caliber star; the CPU formula baseline should read
    // meaningfully lower for the same inputs.
    const cpu = computeCpuSponsorshipRevenueCents("LARGE", "SUPERSTAR");
    expect(cpu).toBeLessThan(32 * M);
  });
});

describe("computeSponsorshipVoidPenaltyCents", () => {
  it("scales with remaining seasons - more years left, bigger penalty", () => {
    const oneYearLeft = computeSponsorshipVoidPenaltyCents(10 * M, 1);
    const threeYearsLeft = computeSponsorshipVoidPenaltyCents(10 * M, 3);
    expect(threeYearsLeft).toBeGreaterThan(oneYearLeft);
  });

  it("never charges nothing, even for a tiny deal", () => {
    const penalty = computeSponsorshipVoidPenaltyCents(1, 1);
    expect(penalty).toBeGreaterThan(0);
  });

  it("is capped so a megadeal doesn't produce an absurd penalty", () => {
    const penalty = computeSponsorshipVoidPenaltyCents(100 * M, 10);
    expect(penalty).toBeLessThanOrEqual(25 * M);
  });
});
