import { describe, expect, it } from "vitest";
import {
  applyMoraleDelta,
  getMoraleLevel,
  shouldActivateTradeRequest,
  shouldClearTradeRequest,
  applyMoraleChange,
} from "./moraleLevel";

describe("applyMoraleDelta", () => {
  it("adds the delta and clamps to 0-100", () => {
    expect(applyMoraleDelta(70, 10)).toBe(80);
    expect(applyMoraleDelta(98, 10)).toBe(100);
    expect(applyMoraleDelta(2, -10)).toBe(0);
  });
});

describe("getMoraleLevel", () => {
  it("buckets the 0-100 score into named levels", () => {
    expect(getMoraleLevel(90)).toBe("THRILLED");
    expect(getMoraleLevel(70)).toBe("CONTENT");
    expect(getMoraleLevel(50)).toBe("NEUTRAL");
    expect(getMoraleLevel(30)).toBe("UNHAPPY");
    expect(getMoraleLevel(5)).toBe("DISGRUNTLED");
  });
});

describe("shouldActivateTradeRequest / shouldClearTradeRequest", () => {
  it("gives a high-loyalty player a lower activation bar (harder to trigger) than a low-loyalty player", () => {
    // A middling-low morale that a low-loyalty player already reacts to,
    // but a high-loyalty player tolerates.
    expect(shouldActivateTradeRequest(18, 10)).toBe(true);
    expect(shouldActivateTradeRequest(18, 90)).toBe(false);
  });

  it("never activates for a comfortably positive morale regardless of loyalty", () => {
    expect(shouldActivateTradeRequest(60, 0)).toBe(false);
    expect(shouldActivateTradeRequest(60, 100)).toBe(false);
  });

  it("requires climbing meaningfully above the activation line before clearing (hysteresis)", () => {
    expect(shouldClearTradeRequest(16)).toBe(false);
    expect(shouldClearTradeRequest(35)).toBe(true);
  });
});

describe("applyMoraleChange", () => {
  it("activates a trade request once morale crosses the threshold and wasn't already active", () => {
    const result = applyMoraleChange(20, -10, 30, false);
    expect(result.tradeRequestActive).toBe(true);
    expect(result.justActivated).toBe(true);
    expect(result.justCleared).toBe(false);
  });

  it("does not re-flag justActivated on a later check while still active", () => {
    const result = applyMoraleChange(8, -2, 30, true);
    expect(result.tradeRequestActive).toBe(true);
    expect(result.justActivated).toBe(false);
  });

  it("clears an active request once morale recovers past the clear threshold", () => {
    const result = applyMoraleChange(20, 20, 30, true);
    expect(result.tradeRequestActive).toBe(false);
    expect(result.justCleared).toBe(true);
  });

  it("leaves a healthy player's request state untouched", () => {
    const result = applyMoraleChange(70, 5, 50, false);
    expect(result.tradeRequestActive).toBe(false);
    expect(result.justActivated).toBe(false);
    expect(result.justCleared).toBe(false);
  });
});
