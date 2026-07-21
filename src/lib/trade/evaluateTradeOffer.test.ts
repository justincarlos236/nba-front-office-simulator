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
    overallRating: 75,
    potentialRating: 75,
    age: 27,
    position: "SF",
    currentSalaryCents: 15_000_000_00n,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
    ...overrides,
  };
}

const FIVE_PLAYER_ROSTER = [
  { overallRating: 90, age: 28 },
  { overallRating: 82, age: 26 },
  { overallRating: 75, age: 27 },
  { overallRating: 70, age: 25 },
  { overallRating: 65, age: 24 },
];

function baseInput(overrides: Partial<EvaluateTradeOfferInput> = {}): EvaluateTradeOfferInput {
  return {
    respondingTeam: {
      identity: "PLAYOFF_TEAM",
      needs: [],
      personality: "BALANCED",
      roster: FIVE_PLAYER_ROSTER,
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
        incoming: [player({ overallRating: 75, age: 27, currentSalaryCents: 15_000_000_00n })],
        outgoing: [player({ overallRating: 75, age: 27, currentSalaryCents: 15_000_000_00n })],
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
            roster: [{ overallRating: 75, age: 27 }],
          },
          incoming: [player({ overallRating: 65, age: 30, currentSalaryCents: 3_000_000_00n })],
          outgoing: [player({ overallRating: 95, age: 24, currentSalaryCents: 50_000_000_00n })],
        }),
      );
      expect(result.decision, `${personality} should reject a robbery`).toBe("REJECT");
    }
  });

  it("blocks trading an untouchable young superstar even at reasonable value, requiring a real overpay", () => {
    const roster = [
      { overallRating: 92, age: 22 },
      { overallRating: 75, age: 27 },
    ];
    const fairButNotOverpay = evaluateTradeOffer(
      baseInput({
        respondingTeam: { identity: "REBUILDING", needs: [], personality: "BALANCED", roster },
        incoming: [player({ overallRating: 92, age: 24, currentSalaryCents: 45_000_000_00n })],
        outgoing: [player({ overallRating: 92, age: 22, currentSalaryCents: 15_000_000_00n })],
      }),
    );
    expect(fairButNotOverpay.decision).toBe("REJECT");
    expect(fairButNotOverpay.reasons).toContain("UNTOUCHABLE_PLAYER");
  });

  it("blocks trading an older superstar-tier player even on a rebuilding/non-contending team - the Embiid case", () => {
    // A 30-year-old former MVP-tier center (90+ rating = SUPERSTAR tier)
    // on a team that isn't currently a Contender/Playoff Team - real teams
    // still don't casually move a top-tier talent just because they're
    // rebuilding, without being blown away on the return.
    const roster = [
      { overallRating: 92, age: 30 },
      { overallRating: 78, age: 27 },
      { overallRating: 72, age: 25 },
    ];
    const result = evaluateTradeOffer(
      baseInput({
        respondingTeam: { identity: "REBUILDING", needs: [], personality: "BALANCED", roster },
        // Two good-but-not-elite incoming players - a real trade offer,
        // just not a big enough overpay for a true superstar.
        incoming: [
          player({ overallRating: 82, age: 33, currentSalaryCents: 45_000_000_00n }),
          player({ overallRating: 76, age: 28, currentSalaryCents: 40_000_000_00n }),
        ],
        outgoing: [player({ overallRating: 92, age: 30, currentSalaryCents: 55_000_000_00n })],
      }),
    );
    expect(result.decision).toBe("REJECT");
    expect(result.reasons).toContain("UNTOUCHABLE_PLAYER");
  });

  it("gives a personality-adjusted acceptance bar - a Conservative team wants more than Aggressive for the same trade", () => {
    // The traded-away player (75) sits safely outside the top 2 (90, 82),
    // so the untouchable gate doesn't interfere here.
    const buildInput = (personality: "AGGRESSIVE" | "CONSERVATIVE") =>
      baseInput({
        respondingTeam: {
          identity: "PLAYOFF_TEAM",
          needs: [],
          personality,
          roster: FIVE_PLAYER_ROSTER,
        },
        // Slightly below dead-even value - close enough that personality should decide it.
        incoming: [player({ overallRating: 74, age: 27, currentSalaryCents: 14_500_000_00n })],
        outgoing: [player({ overallRating: 75, age: 27, currentSalaryCents: 15_000_000_00n })],
      });

    const aggressive = evaluateTradeOffer(buildInput("AGGRESSIVE"));
    const conservative = evaluateTradeOffer(buildInput("CONSERVATIVE"));
    expect(aggressive.score).toBe(conservative.score);
    // Same objective trade, different outcomes for different personalities.
    expect(aggressive.decision === "ACCEPT" && conservative.decision !== "ACCEPT").toBe(true);
  });

  it("gives extra value to a player who fills a recognized need", () => {
    const withNeed = evaluateTradeOffer(
      baseInput({
        respondingTeam: {
          identity: "PLAYOFF_TEAM",
          needs: ["POINT_GUARD"],
          personality: "BALANCED",
          roster: FIVE_PLAYER_ROSTER,
        },
        incoming: [player({ overallRating: 73, age: 27, position: "PG" })],
        outgoing: [player({ overallRating: 75, age: 27 })],
      }),
    );
    const withoutNeed = evaluateTradeOffer(
      baseInput({
        respondingTeam: {
          identity: "PLAYOFF_TEAM",
          needs: [],
          personality: "BALANCED",
          roster: FIVE_PLAYER_ROSTER,
        },
        incoming: [player({ overallRating: 73, age: 27, position: "PG" })],
        outgoing: [player({ overallRating: 75, age: 27 })],
      }),
    );
    expect(withNeed.score).toBeGreaterThan(withoutNeed.score);
    expect(withNeed.reasons).toContain("FILLS_A_NEED");
  });
});
