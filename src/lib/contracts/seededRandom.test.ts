import { describe, expect, it } from "vitest";
import { createSeededRandom, randomInRange } from "./seededRandom";

describe("createSeededRandom", () => {
  it("is deterministic for the same seed", () => {
    const a = createSeededRandom("player-123");
    const b = createSeededRandom("player-123");
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it("produces different sequences for different seeds", () => {
    const a = createSeededRandom("player-123");
    const b = createSeededRandom("player-456");
    expect(a()).not.toBe(b());
  });

  it("stays within [0, 1)", () => {
    const rng = createSeededRandom("player-789");
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("randomInRange", () => {
  it("stays within [min, max)", () => {
    const rng = createSeededRandom("seed");
    for (let i = 0; i < 100; i++) {
      const value = randomInRange(rng, 10, 20);
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(20);
    }
  });
});
