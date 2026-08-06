import { describe, it, expect } from "vitest";
import { computeFanMandate, computeMandateSatisfaction, type FanMandateInputs } from "./fanMandate";

function baseInputs(overrides: Partial<FanMandateInputs> = {}): FanMandateInputs {
  return {
    marketSize: "MID",
    seasonOutcomes: [],
    teamStrength: 65,
    averageRosterAge: 26,
    recentLotteryPicks: 0,
    franchisePopularity: 55,
    patience: 50,
    expectationCeiling: 50,
    ...overrides,
  };
}

describe("computeFanMandate", () => {
  it("CHAMPIONSHIP_OR_BUST for a title-favorite roster", () => {
    expect(computeFanMandate(baseInputs({ teamStrength: 85 }), 2030)).toBe("CHAMPIONSHIP_OR_BUST");
  });

  it("CHAMPIONSHIP_OR_BUST for a recent Finals appearance, even with a modest roster now", () => {
    const mandate = computeFanMandate(
      baseInputs({
        teamStrength: 65,
        seasonOutcomes: [{ season: 2029, playoffDepth: 5 }],
      }),
      2030,
    );
    expect(mandate).toBe("CHAMPIONSHIP_OR_BUST");
  });

  it("WIN_NOW for a veteran core with recent playoff appearances", () => {
    const mandate = computeFanMandate(
      baseInputs({
        teamStrength: 70,
        averageRosterAge: 30,
        seasonOutcomes: [{ season: 2029, playoffDepth: 2 }],
      }),
      2030,
    );
    expect(mandate).toBe("WIN_NOW");
  });

  it("an old roster with no recent playoff appearances is NOT read as WIN_NOW", () => {
    const mandate = computeFanMandate(
      baseInputs({
        teamStrength: 55,
        averageRosterAge: 30,
        seasonOutcomes: [{ season: 2029, playoffDepth: 0 }],
      }),
      2030,
    );
    expect(mandate).not.toBe("WIN_NOW");
  });

  it("the SAME young/rebuilding roster reads as BE_PATIENT in a patient city and SHOW_ME_PROGRESS in an impatient one - the core design point", () => {
    const rebuildOutcomes = [
      { season: 2027, playoffDepth: 0 },
      { season: 2028, playoffDepth: 1 },
      { season: 2029, playoffDepth: 0 },
    ];
    const patientCity = computeFanMandate(
      baseInputs({
        averageRosterAge: 23,
        recentLotteryPicks: 2,
        seasonOutcomes: rebuildOutcomes,
        patience: 85,
      }),
      2030,
    );
    const impatientCity = computeFanMandate(
      baseInputs({
        averageRosterAge: 23,
        recentLotteryPicks: 2,
        seasonOutcomes: rebuildOutcomes,
        patience: 15,
      }),
      2030,
    );
    expect(patientCity).toBe("BE_PATIENT_WITH_THE_KIDS");
    expect(impatientCity).toBe("SHOW_ME_PROGRESS");
    expect(patientCity).not.toBe(impatientCity);
  });

  it("BE_PATIENT_WITH_THE_KIDS for a fresh expansion-style young roster with no history yet", () => {
    const mandate = computeFanMandate(
      baseInputs({ averageRosterAge: 23, seasonOutcomes: [], patience: 60 }),
      2025,
    );
    expect(mandate).toBe("BE_PATIENT_WITH_THE_KIDS");
  });

  it("GIVE_US_A_REASON_TO_CARE for sustained irrelevance with low popularity", () => {
    const irrelevantOutcomes = [0, 1, 0, 0, 1].map((depth, i) => ({
      season: 2026 + i,
      playoffDepth: depth,
    }));
    const mandate = computeFanMandate(
      baseInputs({
        averageRosterAge: 27, // NOT young, so it doesn't fall into the rebuild branch
        seasonOutcomes: irrelevantOutcomes,
        franchisePopularity: 25,
        patience: 50,
      }),
      2030,
    );
    expect(mandate).toBe("GIVE_US_A_REASON_TO_CARE");
  });

  it("never throws across a wide grid of inputs", () => {
    for (let strength = 40; strength <= 95; strength += 15) {
      for (let age = 22; age <= 33; age += 3) {
        for (let patience = 0; patience <= 100; patience += 25) {
          expect(() =>
            computeFanMandate(
              baseInputs({ teamStrength: strength, averageRosterAge: age, patience }),
              2030,
            ),
          ).not.toThrow();
        }
      }
    }
  });
});

describe("computeMandateSatisfaction", () => {
  it("is always within 0-100", () => {
    const kinds = [
      "BE_PATIENT_WITH_THE_KIDS",
      "SHOW_ME_PROGRESS",
      "WIN_NOW",
      "CHAMPIONSHIP_OR_BUST",
      "GIVE_US_A_REASON_TO_CARE",
    ] as const;
    for (const mandate of kinds) {
      for (const depth of [0, 1, 3, 5, 6]) {
        const s = computeMandateSatisfaction({
          mandate,
          teamStrength: 70,
          latestSeasonOutcome: { season: 2030, playoffDepth: depth },
          recentLotteryPicks: 0,
        });
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });

  it("CHAMPIONSHIP_OR_BUST satisfaction rises with how deep the actual run went", () => {
    const lottery = computeMandateSatisfaction({
      mandate: "CHAMPIONSHIP_OR_BUST",
      teamStrength: 85,
      latestSeasonOutcome: { season: 2030, playoffDepth: 0 },
      recentLotteryPicks: 0,
    });
    const champion = computeMandateSatisfaction({
      mandate: "CHAMPIONSHIP_OR_BUST",
      teamStrength: 85,
      latestSeasonOutcome: { season: 2030, playoffDepth: 6 },
      recentLotteryPicks: 0,
    });
    expect(champion).toBeGreaterThan(lottery);
  });

  it("handles a null latestSeasonOutcome (no games played yet) without throwing", () => {
    expect(() =>
      computeMandateSatisfaction({
        mandate: "WIN_NOW",
        teamStrength: 70,
        latestSeasonOutcome: null,
        recentLotteryPicks: 0,
      }),
    ).not.toThrow();
  });
});
