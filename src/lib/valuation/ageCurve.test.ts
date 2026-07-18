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
