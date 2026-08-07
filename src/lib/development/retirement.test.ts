import { describe, expect, it } from "vitest";
import { retirementProbability, shouldRetire } from "./retirement";

describe("retirementProbability", () => {
  it("is zero for young players", () => {
    expect(retirementProbability(25, 80)).toBe(0);
    expect(retirementProbability(32, 80)).toBe(0);
  });

  it("is guaranteed at the forced retirement age", () => {
    expect(retirementProbability(41, 90)).toBe(1);
    expect(retirementProbability(50, 90)).toBe(1);
  });

  it("increases with age past the risk threshold", () => {
    const at33 = retirementProbability(33, 80);
    const at36 = retirementProbability(36, 80);
    const at40 = retirementProbability(40, 80);
    expect(at36).toBeGreaterThan(at33);
    expect(at40).toBeGreaterThan(at36);
  });

  it("is higher for a low-rated player than a high-rated player at the same age", () => {
    const lowRated = retirementProbability(35, 55);
    const highRated = retirementProbability(35, 85);
    expect(lowRated).toBeGreaterThan(highRated);
  });

  it("never exceeds 1", () => {
    expect(retirementProbability(60, 20)).toBeLessThanOrEqual(1);
  });

  it("is higher for a demoralized aging veteran than a happy one at the same age/rating", () => {
    const miserable = retirementProbability(35, 75, 5);
    const happy = retirementProbability(35, 75, 95);
    expect(miserable).toBeGreaterThan(happy);
  });

  it("never goes negative even for an extremely happy player", () => {
    expect(retirementProbability(33, 90, 100)).toBeGreaterThanOrEqual(0);
  });

  it("has no effect on a young player regardless of morale", () => {
    expect(retirementProbability(25, 80, 5)).toBe(0);
  });
});

describe("shouldRetire", () => {
  it("never retires a young player regardless of rng", () => {
    expect(shouldRetire(25, 50, () => 0)).toBe(false);
  });

  it("always retires a player at the forced age regardless of rng", () => {
    expect(shouldRetire(41, 99, () => 0.999)).toBe(true);
  });

  it("is deterministic for a fixed rng draw", () => {
    const rng = () => 0.1;
    expect(shouldRetire(35, 60, rng)).toBe(retirementProbability(35, 60) > 0.1);
  });
});
