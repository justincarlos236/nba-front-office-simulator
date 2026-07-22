import { describe, expect, it } from "vitest";
import { developPlayerRating } from "./developPlayerRating";

function fixedRng(value: number): () => number {
  return () => value;
}

describe("developPlayerRating", () => {
  it("grows a young player with room to grow, never past their potential", () => {
    const result = developPlayerRating({
      overallRating: 70,
      potentialRating: 85,
      age: 22,
      rng: fixedRng(0.99),
    });
    expect(result).toBeGreaterThan(70);
    expect(result).toBeLessThanOrEqual(85);
  });

  it("never grows a young player past their potential even with max luck", () => {
    const result = developPlayerRating({
      overallRating: 84,
      potentialRating: 85,
      age: 20,
      rng: fixedRng(0.99),
    });
    expect(result).toBeLessThanOrEqual(85);
  });

  it("does not grow a young player already at their potential", () => {
    const result = developPlayerRating({
      overallRating: 85,
      potentialRating: 85,
      age: 22,
      rng: fixedRng(0.5),
    });
    // Falls through to prime-drift behavior instead of growth.
    expect(result).toBeGreaterThanOrEqual(84);
    expect(result).toBeLessThanOrEqual(86);
  });

  it("keeps prime-age players roughly flat", () => {
    const result = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 28,
      rng: fixedRng(0.5),
    });
    expect(result).toBeGreaterThanOrEqual(79);
    expect(result).toBeLessThanOrEqual(81);
  });

  it("declines an older player's rating", () => {
    const result = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 34,
      rng: fixedRng(0.5),
    });
    expect(result).toBeLessThan(80);
  });

  it("declines faster the further past 30 a player is", () => {
    const rng = fixedRng(0.5);
    const at31 = developPlayerRating({ overallRating: 80, potentialRating: 80, age: 31, rng });
    const at38 = developPlayerRating({ overallRating: 80, potentialRating: 80, age: 38, rng });
    expect(80 - at38).toBeGreaterThan(80 - at31);
  });

  it("never produces a rating below the floor or above the ceiling", () => {
    const low = developPlayerRating({
      overallRating: 26,
      potentialRating: 26,
      age: 40,
      rng: fixedRng(0.99),
    });
    expect(low).toBeGreaterThanOrEqual(25);

    const high = developPlayerRating({
      overallRating: 98,
      potentialRating: 99,
      age: 22,
      rng: fixedRng(0.99),
    });
    expect(high).toBeLessThanOrEqual(99);
  });

  it("is deterministic for a fixed rng", () => {
    const input = { overallRating: 75, potentialRating: 82, age: 24, rng: fixedRng(0.3) };
    expect(developPlayerRating(input)).toBe(developPlayerRating(input));
  });

  it("a high-quality Player Development Coach boosts young-player growth", () => {
    const base = () =>
      developPlayerRating({ overallRating: 65, potentialRating: 90, age: 21, rng: fixedRng(0.1) });
    const coached = () =>
      developPlayerRating({
        overallRating: 65,
        potentialRating: 90,
        age: 21,
        rng: fixedRng(0.1),
        developmentCoachQuality: 99,
      });
    expect(coached()).toBeGreaterThanOrEqual(base());
  });

  it("an unspecified (neutral) coach quality behaves identically to today's curve", () => {
    const input = { overallRating: 70, potentialRating: 88, age: 22, rng: fixedRng(0.4) };
    expect(developPlayerRating(input)).toBe(
      developPlayerRating({ ...input, developmentCoachQuality: 72 }),
    );
  });

  it("a high-quality coach dampens an aging player's decline", () => {
    const uncoached = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 35,
      rng: fixedRng(0.5),
    });
    const coached = developPlayerRating({
      overallRating: 80,
      potentialRating: 80,
      age: 35,
      rng: fixedRng(0.5),
      developmentCoachQuality: 99,
    });
    expect(coached).toBeGreaterThanOrEqual(uncoached);
  });
});
