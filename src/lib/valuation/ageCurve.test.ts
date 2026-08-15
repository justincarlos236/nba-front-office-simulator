import { describe, expect, it } from "vitest";
import { ageValueMultiplier } from "./ageCurve";

describe("ageValueMultiplier", () => {
  it("gives no bonus or discount right at peak age", () => {
    expect(ageValueMultiplier(27)).toBe(1);
  });

  it("gives a mild bonus for younger players", () => {
    expect(ageValueMultiplier(21)).toBeGreaterThan(1);
  });

  it("caps the young-player bonus", () => {
    expect(ageValueMultiplier(19)).toBeLessThanOrEqual(1.15);
  });

  it("discounts players past peak age", () => {
    expect(ageValueMultiplier(32)).toBeLessThan(1);
  });

  it("discounts more steeply for players well past peak", () => {
    const mildDecline = 1 - ageValueMultiplier(30);
    const steepDecline = 1 - ageValueMultiplier(38);
    expect(steepDecline).toBeGreaterThan(mildDecline * 2);
  });

  it("floors the discount so value never goes negative or absurdly low", () => {
    expect(ageValueMultiplier(45)).toBeGreaterThanOrEqual(0.4);
  });
});

/**
 * docs/CONTRACT_AUDIT.md C-P2-4. The discount used to be a hinge - 2% a year
 * until 32, then 5% a year - so one birthday cost nearly three times what its
 * neighbours did, in a curve every trade, contract and re-signing multiplies
 * through.
 */
describe("the past-peak decline is smooth, not a cliff", () => {
  const drop = (age: number) => ageValueMultiplier(age - 1) - ageValueMultiplier(age);

  it("has no single year that falls far harder than the year before it", () => {
    // The old curve jumped 0.020 -> 0.050 at 32, a 2.5x step. Nothing should
    // now cost much more than its predecessor.
    for (let age = 29; age <= 40; age++) {
      expect(drop(age)).toBeLessThan(drop(age - 1) * 1.6);
    }
  });

  it("still accelerates - a late-30s year costs more than an early-30s one", () => {
    expect(drop(38)).toBeGreaterThan(drop(31));
  });

  it("declines monotonically past the peak", () => {
    for (let age = 28; age <= 42; age++) {
      expect(ageValueMultiplier(age)).toBeLessThanOrEqual(ageValueMultiplier(age - 1));
    }
  });

  it("keeps the anchors the old hinge was built around", () => {
    expect(ageValueMultiplier(32)).toBeCloseTo(0.9, 2);
    expect(ageValueMultiplier(40)).toBeCloseTo(0.5, 2);
  });

  it("no longer punishes turning 33 more than turning 32", () => {
    // The exact symptom: 31->32 cost 0.020 and 32->33 cost 0.050.
    expect(drop(33) / drop(32)).toBeLessThan(1.3);
  });

  it("never falls below the floor, however old", () => {
    expect(ageValueMultiplier(45)).toBe(0.4);
    expect(ageValueMultiplier(60)).toBe(0.4);
  });
});
