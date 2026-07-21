import { describe, expect, it } from "vitest";
import {
  ALL_GM_PERSONALITIES,
  GM_PERSONALITY_WEIGHTS,
  pickRandomGmPersonality,
} from "./gmPersonality";

describe("GM_PERSONALITY_WEIGHTS", () => {
  it("keeps every weight within the bounded 0.7-1.3 nudge range", () => {
    for (const personality of ALL_GM_PERSONALITIES) {
      const weights = GM_PERSONALITY_WEIGHTS[personality];
      for (const value of Object.values(weights)) {
        expect(value).toBeGreaterThanOrEqual(0.7);
        expect(value).toBeLessThanOrEqual(1.3);
      }
    }
  });

  it("gives every personality a defined weight table", () => {
    for (const personality of ALL_GM_PERSONALITIES) {
      expect(GM_PERSONALITY_WEIGHTS[personality]).toBeDefined();
    }
  });
});

describe("pickRandomGmPersonality", () => {
  it("only ever returns a valid personality", () => {
    const rng = () => 0.999999;
    const personality = pickRandomGmPersonality(rng);
    expect(ALL_GM_PERSONALITIES).toContain(personality);
  });

  it("returns the first personality for rng() = 0", () => {
    expect(pickRandomGmPersonality(() => 0)).toBe(ALL_GM_PERSONALITIES[0]);
  });
});
