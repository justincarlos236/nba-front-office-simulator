import { describe, expect, it } from "vitest";
import { evaluateReSigningDecision, type ReSigningDecisionInput } from "./reSigningDecision";
import { computeReSigningMaxOfferCents } from "../freeagency/reSigningRights";
import { ALL_GM_PERSONALITIES } from "./gmPersonality";

const SEASON = 2024;

function baseInput(
  overrides: Partial<ReSigningDecisionInput> & {
    player: ReSigningDecisionInput["player"];
  },
): ReSigningDecisionInput {
  return {
    team: {
      identity: "PLAY_IN_TEAM",
      needs: [],
      personality: "BALANCED",
      rosterSizeBeforeThisDecision: 10,
    },
    currentSeason: SEASON,
    offerSalaryCents: computeReSigningMaxOfferCents(
      overrides.player.overallRating,
      SEASON,
      overrides.player.age,
      // These fixtures describe players by rating and age, not by service time;
      // a veteran's experience is what keeps the rookie scale out of the price.
      Math.max(4, overrides.player.age - 22),
    ),
    ...overrides,
  };
}

describe("evaluateReSigningDecision", () => {
  it("retains a peak-age (27), fairly-priced player under every personality", () => {
    for (const personality of ALL_GM_PERSONALITIES) {
      const result = evaluateReSigningDecision(
        baseInput({
          team: {
            identity: "PLAY_IN_TEAM",
            needs: [],
            personality,
            rosterSizeBeforeThisDecision: 10,
          },
          player: {
            position: "SF",
            overallRating: 75,
            potentialRating: 75,
            age: 27,
            careerGamesMissedToInjury: 0,
          },
        }),
      );
      expect(result.decision, `${personality} should resign a fair peak-age player`).toBe("RESIGN");
    }
  });

  it("lets a clearly declined, washed-up veteran walk under every personality", () => {
    for (const personality of ALL_GM_PERSONALITIES) {
      const result = evaluateReSigningDecision(
        baseInput({
          team: {
            identity: "PLAY_IN_TEAM",
            needs: [],
            personality,
            rosterSizeBeforeThisDecision: 10,
          },
          // Was 68/35. The trade-value rescale (docs/TRADE_AUDIT.md) stopped
          // pricing ageing players at ~zero - a 68-rated centre at his $4.2M
          // re-signing price is now a bargain any club would take, which is the
          // correct answer, not a regression. A player who is genuinely finished
          // is what this test is about, and that is where the margin sits now.
          player: {
            position: "C",
            overallRating: 60,
            potentialRating: 60,
            age: 38,
            careerGamesMissedToInjury: 0,
          },
        }),
      );
      expect(result.decision, `${personality} should let a washed-up veteran walk`).toBe(
        "LET_WALK",
      );
    }
  });

  it("boosts retention for a young, high-upside building block under every personality", () => {
    for (const personality of ALL_GM_PERSONALITIES) {
      const result = evaluateReSigningDecision(
        baseInput({
          team: {
            identity: "REBUILDING",
            needs: [],
            personality,
            rosterSizeBeforeThisDecision: 10,
          },
          player: {
            position: "SG",
            overallRating: 70,
            potentialRating: 85,
            age: 24,
            careerGamesMissedToInjury: 0,
          },
        }),
      );
      expect(result.decision, `${personality} should resign a young high-upside player`).toBe(
        "RESIGN",
      );
    }
  });

  /**
   * The veteran here was a 78 until the re-signing ceiling gained its age
   * discount (docs/CONTRACT_AUDIT.md C-P1-3). A 31-year-old 78 used to be
   * quoted at a 27-year-old's price, which made him an overpay every club
   * refused; priced correctly he is a bargain a rebuilding team would also take,
   * so he stopped being the marginal case this test is about. 72 is where the
   * margin actually sits now. The assertion - that team *context* decides, not
   * personality alone - is unchanged, and so is the threshold it runs against.
   */
  it("splits on an aging, redundant veteran depending on team context - a WIN_NOW contender keeps them, most others don't", () => {
    // Moved 72 -> 59 by the trade-value rescale, and the size of that move is
    // itself worth recording. Trade value is no longer capped at 0.35 of the
    // salary cap while the re-signing offer still is, so value/offer climbs
    // steeply with rating and a fairly-priced veteran of any real quality now
    // clears the bar for every identity. The window where team context alone
    // decides has narrowed to near-minimum players. The assertion - that
    // context, not personality, is what splits it - is unchanged and still
    // holds; see docs/TRADE_AUDIT.md for why this margin is worth revisiting
    // when the re-signing model itself is next audited.
    // Re-anchored twice: once when the veteran minimum became real
    // (docs/CONTRACT_AUDIT.md C-P2-1), and again at 66 when the pricing curve
    // was refit (docs/SALARY_SYSTEM_AUDIT.md P0-1). Both moved what a marginal
    // veteran costs, and this test is about the margin.
    const player = {
      position: "PF" as const,
      overallRating: 66,
      potentialRating: 66,
      age: 31,
      careerGamesMissedToInjury: 0,
    };

    const winNowContender = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "CONTENDER",
          needs: [],
          personality: "WIN_NOW",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
      }),
    );
    expect(winNowContender.decision).toBe("RESIGN");

    const balancedPlayIn = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
      }),
    );
    expect(balancedPlayIn.decision).toBe("LET_WALK");

    // Same WIN_NOW personality, but the team isn't win-now-postured - context
    // should matter, not just personality.
    //
    // This briefly asserted RESIGN and was filed as C-P3-1, because at the old
    // salary scale identity never separated a WIN_NOW GM's decision at any
    // realistic price. Refitting the pricing curve restored it: at 66 a
    // rebuilding club lets this player go where a contender keeps him.
    // C-P3-1 is closed by that refit rather than by a change to this model.
    const winNowRebuilding = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "REBUILDING",
          needs: [],
          personality: "WIN_NOW",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
      }),
    );
    expect(winNowRebuilding.decision).toBe("LET_WALK");
  });

  it("raises the bar once a team is already at the soft roster ceiling, tipping stingier personalities to let a marginal bench player walk", () => {
    // Moved 64 -> 70 -> 67 as the salary scale changed underneath it. The
    // ceiling only decides where a retention is genuinely marginal, and after
    // the pricing refit (docs/SALARY_SYSTEM_AUDIT.md P0-1) that band sits at
    // 67 for a SALARY_CONSCIOUS club. Above it the player is worth keeping
    // even with a full roster; below it he is not worth keeping at all.
    const player = {
      position: "SG" as const,
      overallRating: 67,
      potentialRating: 67,
      age: 29,
      careerGamesMissedToInjury: 0,
    };

    const notFull = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "SALARY_CONSCIOUS",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
      }),
    );
    expect(notFull.decision).toBe("RESIGN");

    const full = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "SALARY_CONSCIOUS",
          rosterSizeBeforeThisDecision: 16,
        },
        player,
      }),
    );
    expect(full.decision).toBe("LET_WALK");
    expect(full.reasons).toContain("ROSTER_FULL");
    // The score itself is unaffected by roster size - only the bar moves.
    expect(full.score).toBe(notFull.score);
  });

  it("gives extra value to a player who fills a recognized need", () => {
    const player = {
      position: "PG" as const,
      overallRating: 73,
      potentialRating: 73,
      age: 27,
      careerGamesMissedToInjury: 0,
    };
    const withNeed = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: ["POINT_GUARD"],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
      }),
    );
    const withoutNeed = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
      }),
    );
    expect(withNeed.score).toBeGreaterThan(withoutNeed.score);
    expect(withNeed.reasons).toContain("FILLS_A_NEED");
  });

  it("Player Morale & Personality System: a standing trade request tips a marginal retention to LET_WALK", () => {
    const player = {
      position: "SF" as const,
      // 74 -> 68 after the pricing refit (docs/SALARY_SYSTEM_AUDIT.md P0-1).
      // A 74-rated player is now worth keeping even having asked out, so he
      // cannot show the request CHANGING anything; below 66 he is not worth
      // keeping either way. 68 is where the retention is genuinely marginal.
      overallRating: 68,
      potentialRating: 68,
      age: 28,
      careerGamesMissedToInjury: 0,
    };
    const noRequest = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player: { ...player, hasStandingTradeRequest: false },
      }),
    );
    const withRequest = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player: { ...player, hasStandingTradeRequest: true },
      }),
    );
    expect(noRequest.decision).toBe("RESIGN");
    expect(withRequest.decision).toBe("LET_WALK");
    // The score itself is unaffected - only the bar moves, same as the roster-ceiling case above.
    expect(withRequest.score).toBe(noRequest.score);
  });

  it("Franchise Finances: a cash-strapped team (higher financial multiplier) lets a marginal retention walk, while a healthy one keeps him", () => {
    // Age 30 rather than 29 for the same reason the fixture above moved: with
    // the age discount reaching the ceiling, a 29-year-old 74 is comfortably
    // worth keeping and no longer a marginal call. Moved again to 68/35 by the
    // trade-value rescale - a 74-rated 30-year-old is now clearly worth his
    // re-signing price whatever the finances, so he stopped being marginal.
    const player = {
      position: "SF" as const,
      overallRating: 68,
      potentialRating: 68,
      age: 35,
      careerGamesMissedToInjury: 0,
    };
    const healthy = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
        financialThresholdMultiplier: 1.0,
      }),
    );
    const strapped = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player,
        financialThresholdMultiplier: 1.5,
      }),
    );
    expect(healthy.decision).toBe("RESIGN");
    expect(strapped.decision).toBe("LET_WALK");
    // Only the bar moves - the player's underlying value is unchanged.
    expect(strapped.score).toBe(healthy.score);
  });

  it("Franchise Finances: financial pressure never overturns a clear bargain", () => {
    // A cheap, peak-age, well-above-replacement player is a bargain no matter
    // how broke the team is - resistance nudges borderline calls, not obvious ones.
    const bargain = {
      position: "PG" as const,
      overallRating: 78,
      potentialRating: 80,
      age: 25,
      careerGamesMissedToInjury: 0,
    };
    const result = evaluateReSigningDecision(
      baseInput({
        team: {
          identity: "PLAY_IN_TEAM",
          needs: [],
          personality: "BALANCED",
          rosterSizeBeforeThisDecision: 10,
        },
        player: bargain,
        financialThresholdMultiplier: 1.5,
      }),
    );
    expect(result.decision).toBe("RESIGN");
  });
});
