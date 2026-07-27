import { describe, expect, it } from "vitest";
import { generatePersonalityProfile, describePersonalityLabel } from "./generatePersonality";

describe("generatePersonalityProfile", () => {
  it("is deterministic for the same leaguePlayerId", () => {
    const a = generatePersonalityProfile("player-123");
    const b = generatePersonalityProfile("player-123");
    expect(a).toEqual(b);
  });

  it("produces different profiles for different players", () => {
    const a = generatePersonalityProfile("player-1");
    const b = generatePersonalityProfile("player-2");
    expect(a).not.toEqual(b);
  });

  it("keeps every axis within the bounded 10-95 range", () => {
    for (let i = 0; i < 50; i++) {
      const profile = generatePersonalityProfile(`player-${i}`);
      for (const value of Object.values(profile)) {
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThanOrEqual(95);
      }
    }
  });
});

describe("describePersonalityLabel", () => {
  it("labels a high-competitiveness, low-financial-motivation player a Ring Chaser", () => {
    const label = describePersonalityLabel({
      competitiveness: 90,
      roleSensitivity: 50,
      loyalty: 50,
      financialMotivation: 20,
    });
    expect(label.label).toBe("Ring Chaser");
  });

  it("labels a low-role-sensitivity, high-loyalty player a Professional", () => {
    const label = describePersonalityLabel({
      competitiveness: 50,
      roleSensitivity: 20,
      loyalty: 90,
      financialMotivation: 50,
    });
    expect(label.label).toBe("Professional");
  });

  it("falls back to Even-Keeled when nothing stands out", () => {
    const label = describePersonalityLabel({
      competitiveness: 50,
      roleSensitivity: 50,
      loyalty: 50,
      financialMotivation: 50,
    });
    expect(label.label).toBe("Even-Keeled");
  });
});
