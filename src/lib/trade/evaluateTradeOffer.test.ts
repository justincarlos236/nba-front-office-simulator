import { describe, expect, it } from "vitest";
import {
  evaluateTradeOffer,
  type EvaluateTradeOfferInput,
  type TradePlayerAsset,
} from "./evaluateTradeOffer";
import { ALL_GM_PERSONALITIES, GM_PERSONALITY_WEIGHTS } from "../gm/gmPersonality";

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
        // Slightly below dead-even value - close enough that personality should
        // decide it. Both players are *underpaid*, deliberately: an incoming
        // overpay would also engage `badContractSensitivityMultiplier`, which
        // differs between these two personalities, and this test is about the
        // acceptance bar alone. (Before docs/TRADE_AUDIT.md T-P2-3 that field
        // was never read in trades, so the old fixture could use any salary.)
        // 74 -> 75 incoming after the pricing curve was refit
        // (docs/SALARY_SYSTEM_AUDIT.md P0-1). Contract surplus is priced from
        // `ageAdjustedMarketValueCents`, which shares `scoreToCapFraction`, so
        // moving the curve moved where "slightly below dead-even" sits. At 74
        // both personalities now decline; at 76 both accept.
        incoming: [player({ overallRating: 75, age: 27, currentSalaryCents: 4_000_000_00n })],
        outgoing: [player({ overallRating: 75, age: 27, currentSalaryCents: 4_000_000_00n })],
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

// The properties below are the regression net for docs/TRADE_AUDIT.md. Each
// one fails on the pre-audit model.
describe("evaluateTradeOffer - audit regressions", () => {
  const NEUTRAL_BAD_CONTRACT = ALL_GM_PERSONALITIES.filter(
    (p) => GM_PERSONALITY_WEIGHTS[p].badContractSensitivityMultiplier === 1,
  );

  it("prices the same asset identically in both directions (no arbitrage)", () => {
    // Bonuses used to be applied to incoming assets only, so a young,
    // need-filling player was worth up to 1.3 x 1.15 x 1.25 = 1.87x more
    // arriving than leaving. Measured on the pre-fix model the worst
    // round-trip product was 1.8688 - the bonus stack exactly (T-P0-4).
    //
    // Swapping X against a fixed reference both ways gives two scores that are
    // reciprocals under symmetric pricing, so their product is exactly 1.
    const reference = player({ overallRating: 75, potentialRating: 75, age: 27 });
    const probes: TradePlayerAsset[] = [
      player({ overallRating: 76, potentialRating: 88, age: 22, position: "C" }),
      player({ overallRating: 84, potentialRating: 84, age: 33, position: "PG" }),
      player({ overallRating: 70, potentialRating: 80, age: 24, position: "SG" }),
      player({ overallRating: 88, potentialRating: 90, age: 29, position: "SF" }),
    ];

    for (const identity of ["CONTENDER", "PLAYOFF_TEAM", "REBUILDING", "TANKING"] as const) {
      for (const personality of NEUTRAL_BAD_CONTRACT) {
        for (const needs of [[], ["RIM_PROTECTOR"], ["POINT_GUARD"], ["STAR_SCORER"]] as const) {
          for (const probe of probes) {
            const team = { identity, needs: [...needs], personality, roster: FIVE_PLAYER_ROSTER };
            const forward = evaluateTradeOffer(
              baseInput({ respondingTeam: team, incoming: [probe], outgoing: [reference] }),
            );
            const backward = evaluateTradeOffer(
              baseInput({ respondingTeam: team, incoming: [reference], outgoing: [probe] }),
            );
            // Skip probes where the reported score hits its display clamp.
            if (forward.score >= 3 || backward.score >= 3) continue;
            if (forward.score <= 0 || backward.score <= 0) continue;
            expect(
              forward.score * backward.score,
              `${identity}/${personality}/${needs.join("+") || "no needs"} on a ${probe.overallRating} aged ${probe.age}`,
            ).toBeCloseTo(1, 2);
          }
        }
      }
    }
  });

  it("will not absorb an albatross for nothing, for any identity", () => {
    // Value clamped at zero made a bad contract free to shed - every identity,
    // including Salary-Conscious, accepted a 70-rated 33-year-old on $50M in
    // exchange for nothing at all (T-P1-1).
    const albatross = player({
      overallRating: 70,
      potentialRating: 70,
      age: 33,
      currentSalaryCents: 50_000_000_00n,
    });
    for (const identity of [
      "CONTENDER",
      "PLAYOFF_TEAM",
      "PLAY_IN_TEAM",
      "REBUILDING",
      "TANKING",
    ] as const) {
      for (const personality of ALL_GM_PERSONALITIES) {
        const result = evaluateTradeOffer(
          baseInput({
            respondingTeam: { identity, needs: [], personality, roster: FIVE_PLAYER_ROSTER },
            incoming: [albatross],
            outgoing: [],
          }),
        );
        expect(result.decision, `${identity}/${personality}`).not.toBe("ACCEPT");
      }
    }
  });

  it("makes a Salary-Conscious GM genuinely warier of bad money than a Balanced one", () => {
    // `badContractSensitivityMultiplier` was declared, documented for trades,
    // and read only by reSigningDecision.ts - so in trades Salary-Conscious
    // differed from Balanced by a threshold nudge and nothing else (T-P2-3).
    const overpaid = player({
      overallRating: 78,
      potentialRating: 78,
      age: 30,
      currentSalaryCents: 48_000_000_00n,
    });
    const fair = player({ overallRating: 74, potentialRating: 74, age: 27 });

    const scoreFor = (personality: (typeof ALL_GM_PERSONALITIES)[number]) =>
      evaluateTradeOffer(
        baseInput({
          respondingTeam: {
            identity: "PLAYOFF_TEAM",
            needs: [],
            personality,
            roster: FIVE_PLAYER_ROSTER,
          },
          incoming: [overpaid],
          outgoing: [fair],
        }),
      ).score;

    expect(scoreFor("SALARY_CONSCIOUS")).toBeLessThan(scoreFor("BALANCED"));
  });

  it("holds the untouchable gate even when the player's net value is zero or negative", () => {
    // The gate asks for 1.75x the player's value. Age compounding made Curry
    // worth exactly zero, 1.75 x 0 is 0, and he was acquirable for junk on turn
    // one - so the gate is priced off talent, which a contract cannot cancel
    // (T-P0-2).
    const superstarOnAnAwfulDeal = player({
      overallRating: 95,
      potentialRating: 95,
      age: 37,
      currentSalaryCents: 90_000_000_00n,
    });
    expect(
      evaluateTradeOffer(
        baseInput({
          respondingTeam: {
            identity: "REBUILDING",
            needs: [],
            personality: "BALANCED",
            roster: FIVE_PLAYER_ROSTER,
          },
          incoming: [player({ overallRating: 62, potentialRating: 62, age: 30 })],
          outgoing: [superstarOnAnAwfulDeal],
        }),
      ).reasons,
    ).toContain("UNTOUCHABLE_PLAYER");
  });
});
