import { describe, expect, it } from "vitest";
import {
  evaluateTradeOffer,
  type EvaluateTradeOfferInput,
  type TradePlayerAsset,
} from "./evaluateTradeOffer";
import { ALL_GM_PERSONALITIES } from "../gm/gmPersonality";

function player(overrides: Partial<TradePlayerAsset> = {}): TradePlayerAsset {
  return {
    type: "PLAYER",
    overallRating: 60,
    potentialRating: 60,
    age: 27,
    position: "SF",
    currentSalaryCents: 15_000_000_00n,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
    ...overrides,
  };
}

function baseInput(overrides: Partial<EvaluateTradeOfferInput> = {}): EvaluateTradeOfferInput {
  return {
    respondingTeam: {
      identity: "PLAYOFF_TEAM",
      needs: [],
      personality: "BALANCED",
      roster: [
        { overallRating: 82, age: 28 },
        { overallRating: 70, age: 26 },
        { overallRating: 60, age: 27 },
        { overallRating: 55, age: 25 },
        { overallRating: 45, age: 24 },
      ],
    },
    currentSeason: 2023,
    incoming: [],
    outgoing: [],
    ...overrides,
  };
}

describe("evaluateTradeOffer", () => {
  it("accepts a genuinely fair, equal-value trade", () => {
    const result = evaluateTradeOffer(
      baseInput({
        incoming: [player({ overallRating: 60, age: 27, currentSalaryCents: 15_000_000_00n })],
        outgoing: [player({ overallRating: 60, age: 27, currentSalaryCents: 15_000_000_00n })],
      }),
    );
    expect(result.decision).toBe("ACCEPT");
  });

  it("rejects a lopsided trade for every single personality (fairness safeguard)", () => {
    // A bench player for a near-max-value superstar - a robbery no
    // personality should ever be talked into accepting.
    for (const personality of ALL_GM_PERSONALITIES) {
      const result = evaluateTradeOffer(
        baseInput({
          respondingTeam: {
            identity: "CONTENDER",
            needs: [],
            personality,
            roster: [{ overallRating: 60, age: 27 }],
          },
          incoming: [player({ overallRating: 40, age: 30, currentSalaryCents: 2_000_000_00n })],
          outgoing: [player({ overallRating: 82, age: 24, currentSalaryCents: 40_000_000_00n })],
        }),
      );
      expect(result.decision, `${personality} should reject a robbery`).toBe("REJECT");
    }
  });

  it("blocks trading an untouchable young superstar even at reasonable value, requiring a real overpay", () => {
    const roster = [
      { overallRating: 82, age: 22 },
      { overallRating: 60, age: 27 },
    ];
    const fairButNotOverpay = evaluateTradeOffer(
      baseInput({
        respondingTeam: { identity: "REBUILDING", needs: [], personality: "BALANCED", roster },
        incoming: [player({ overallRating: 82, age: 24, currentSalaryCents: 30_000_000_00n })],
        outgoing: [player({ overallRating: 82, age: 22, currentSalaryCents: 12_000_000_00n })],
      }),
    );
    expect(fairButNotOverpay.decision).toBe("REJECT");
    expect(fairButNotOverpay.reasons).toContain("UNTOUCHABLE_PLAYER");
  });

  it("gives a personality-adjusted acceptance bar - a Conservative team wants more than Aggressive for the same trade", () => {
    // A 5-player roster with the traded-away player (60) safely outside the
    // top 2 (82, 70), so the untouchable gate doesn't interfere here.
    const roster = [
      { overallRating: 82, age: 28 },
      { overallRating: 70, age: 26 },
      { overallRating: 60, age: 27 },
      { overallRating: 55, age: 25 },
      { overallRating: 45, age: 24 },
    ];
    const buildInput = (personality: "AGGRESSIVE" | "CONSERVATIVE") =>
      baseInput({
        respondingTeam: { identity: "PLAYOFF_TEAM", needs: [], personality, roster },
        // Slightly below dead-even value - close enough that personality should decide it.
        incoming: [player({ overallRating: 58, age: 27, currentSalaryCents: 14_000_000_00n })],
        outgoing: [player({ overallRating: 60, age: 27, currentSalaryCents: 15_000_000_00n })],
      });

    const aggressive = evaluateTradeOffer(buildInput("AGGRESSIVE"));
    const conservative = evaluateTradeOffer(buildInput("CONSERVATIVE"));
    expect(aggressive.score).toBe(conservative.score);
    // Same objective trade, different outcomes for different personalities.
    expect(aggressive.decision === "ACCEPT" && conservative.decision !== "ACCEPT").toBe(true);
  });

  it("gives extra value to a player who fills a recognized need", () => {
    const roster = [
      { overallRating: 82, age: 28 },
      { overallRating: 70, age: 26 },
      { overallRating: 60, age: 27 },
      { overallRating: 55, age: 25 },
      { overallRating: 45, age: 24 },
    ];
    const withNeed = evaluateTradeOffer(
      baseInput({
        respondingTeam: {
          identity: "PLAYOFF_TEAM",
          needs: ["POINT_GUARD"],
          personality: "BALANCED",
          roster,
        },
        incoming: [player({ overallRating: 56, age: 27, position: "PG" })],
        outgoing: [player({ overallRating: 60, age: 27 })],
      }),
    );
    const withoutNeed = evaluateTradeOffer(
      baseInput({
        respondingTeam: { identity: "PLAYOFF_TEAM", needs: [], personality: "BALANCED", roster },
        incoming: [player({ overallRating: 56, age: 27, position: "PG" })],
        outgoing: [player({ overallRating: 60, age: 27 })],
      }),
    );
    expect(withNeed.score).toBeGreaterThan(withoutNeed.score);
    expect(withNeed.reasons).toContain("FILLS_A_NEED");
  });
});
