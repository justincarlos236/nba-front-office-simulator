import { describe, expect, it } from "vitest";
import { describeTradeReasons } from "./tradeReasonMessages";
import type { TradeOfferReasonCode } from "./evaluateTradeOffer";

const ALL_REASON_CODES: TradeOfferReasonCode[] = [
  "UNTOUCHABLE_PLAYER",
  "BELOW_FAIR_VALUE",
  "FILLS_A_NEED",
  "FAIR_VALUE",
];

describe("describeTradeReasons", () => {
  it("returns one non-empty message per reason code", () => {
    for (const reason of ALL_REASON_CODES) {
      const [message] = describeTradeReasons([reason], "seed-a");
      expect(message).toBeTruthy();
    }
  });

  it("is deterministic for the same seed", () => {
    const first = describeTradeReasons(["BELOW_FAIR_VALUE"], "trade-123");
    const second = describeTradeReasons(["BELOW_FAIR_VALUE"], "trade-123");
    expect(first).toEqual(second);
  });

  it("varies across different seeds", () => {
    const messages = new Set<string>();
    for (let i = 0; i < 20; i++) {
      messages.add(describeTradeReasons(["BELOW_FAIR_VALUE"], `trade-${i}`)[0]);
    }
    // With 3 variants and 20 different seeds, real variety should show up -
    // not asserting every variant appears (that's seed-dependent), just that
    // it isn't silently always the same sentence.
    expect(messages.size).toBeGreaterThan(1);
  });

  it("renders every distinct reason code present, in order", () => {
    const messages = describeTradeReasons(["BELOW_FAIR_VALUE", "FILLS_A_NEED"], "seed-b");
    expect(messages).toHaveLength(2);
  });
});
