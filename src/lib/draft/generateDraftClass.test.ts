import { describe, expect, it } from "vitest";
import { generateDraftClass } from "./generateDraftClass";

function fixedRng(value: number): () => number {
  return () => value;
}

describe("generateDraftClass", () => {
  it("generates exactly 60 prospects", () => {
    expect(generateDraftClass(Math.random)).toHaveLength(60);
  });

  it("keeps every rating within [25, 99]", () => {
    const prospects = generateDraftClass(Math.random);
    for (const p of prospects) {
      expect(p.overallRating).toBeGreaterThanOrEqual(25);
      expect(p.overallRating).toBeLessThanOrEqual(99);
      expect(p.potentialRating).toBeGreaterThanOrEqual(25);
      expect(p.potentialRating).toBeLessThanOrEqual(99);
    }
  });

  it("never gives a prospect potential below their own overall rating", () => {
    const prospects = generateDraftClass(Math.random);
    for (const p of prospects) {
      expect(p.potentialRating).toBeGreaterThanOrEqual(p.overallRating);
    }
  });

  it("keeps ages within the real draft-eligible range", () => {
    const prospects = generateDraftClass(Math.random);
    for (const p of prospects) {
      expect(p.age).toBeGreaterThanOrEqual(19);
      expect(p.age).toBeLessThanOrEqual(22);
    }
  });

  it("trends early picks higher than late picks on average, with zero variance", () => {
    // rng()=0.5 zeroes out the +/-8 variance term exactly, isolating the
    // pick-position trend itself.
    const prospects = generateDraftClass(fixedRng(0.5));
    const pick1 = prospects[0];
    const pick60 = prospects[59];
    expect(pick1.overallRating).toBeGreaterThan(pick60.overallRating);
    expect(pick1.potentialRating).toBeGreaterThan(pick60.potentialRating);
  });

  it("is deterministic for a fixed rng sequence", () => {
    const values = [0.1, 0.5, 0.9, 0.3, 0.7];
    let i = 0;
    const rngA = () => values[i++ % values.length];
    i = 0;
    const rngB = () => values[i++ % values.length];
    expect(generateDraftClass(rngA)).toEqual(generateDraftClass(rngB));
  });
});
