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
    offerSalaryCents: computeReSigningMaxOfferCents(overrides.player.overallRating, SEASON),
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
          player: {
            position: "C",
            overallRating: 68,
            potentialRating: 68,
            age: 35,
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

  it("splits on an aging, redundant veteran depending on team context - a WIN_NOW contender keeps them, most others don't", () => {
    const player = {
      position: "PF" as const,
      overallRating: 78,
      potentialRating: 78,
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

    // Same WIN_NOW personality, but the team itself isn't win-now-postured -
    // context (identity), not just personality, should matter.
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
    const player = {
      position: "SG" as const,
      overallRating: 64,
      potentialRating: 64,
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
      overallRating: 74,
      potentialRating: 74,
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
    const player = {
      position: "SF" as const,
      overallRating: 74,
      potentialRating: 74,
      age: 29,
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
