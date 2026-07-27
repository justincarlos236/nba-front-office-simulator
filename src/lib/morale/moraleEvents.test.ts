import { describe, expect, it } from "vitest";
import {
  computeRoleChangeMoraleDelta,
  computeMinutesShortfallMoraleDelta,
  computeTeamPerformanceMoraleDelta,
  computeContractSituationMoraleDelta,
  computeCoachFitMoraleDelta,
  computeMoraleAfterTrade,
  decayMoraleTowardBaseline,
} from "./moraleEvents";
import type { PlayerPersonalityAxes } from "./generatePersonality";

const neutralPersonality: PlayerPersonalityAxes = {
  competitiveness: 50,
  roleSensitivity: 50,
  loyalty: 50,
  financialMotivation: 50,
};

describe("computeRoleChangeMoraleDelta", () => {
  it("returns 0 when the role category doesn't change", () => {
    const delta = computeRoleChangeMoraleDelta({
      personality: neutralPersonality,
      previousRole: "ROTATION_PLAYER",
      newRole: "ROTATION_PLAYER",
      valueTier: "STARTER",
      age: 27,
    });
    expect(delta).toBe(0);
  });

  it("is negative for a demotion and positive for a promotion, same magnitude of role change", () => {
    const demotion = computeRoleChangeMoraleDelta({
      personality: neutralPersonality,
      previousRole: "STARTER",
      newRole: "BENCH_PLAYER",
      valueTier: "STARTER",
      age: 27,
    });
    const promotion = computeRoleChangeMoraleDelta({
      personality: neutralPersonality,
      previousRole: "BENCH_PLAYER",
      newRole: "STARTER",
      valueTier: "STARTER",
      age: 27,
    });
    expect(demotion).toBeLessThan(0);
    expect(promotion).toBeGreaterThan(0);
  });

  it("hits a young player with a demotion less hard than an established veteran", () => {
    const young = computeRoleChangeMoraleDelta({
      personality: neutralPersonality,
      previousRole: "STARTER",
      newRole: "BENCH_PLAYER",
      valueTier: "STARTER",
      age: 21,
    });
    const veteran = computeRoleChangeMoraleDelta({
      personality: neutralPersonality,
      previousRole: "STARTER",
      newRole: "BENCH_PLAYER",
      valueTier: "STARTER",
      age: 30,
    });
    expect(Math.abs(young)).toBeLessThan(Math.abs(veteran));
  });

  it("hits a high-role-sensitivity player harder than a low-role-sensitivity one for the same demotion", () => {
    const sensitive = computeRoleChangeMoraleDelta({
      personality: { ...neutralPersonality, roleSensitivity: 95 },
      previousRole: "STARTER",
      newRole: "BENCH_PLAYER",
      valueTier: "STARTER",
      age: 30,
    });
    const easygoing = computeRoleChangeMoraleDelta({
      personality: { ...neutralPersonality, roleSensitivity: 10 },
      previousRole: "STARTER",
      newRole: "BENCH_PLAYER",
      valueTier: "STARTER",
      age: 30,
    });
    expect(Math.abs(sensitive)).toBeGreaterThan(Math.abs(easygoing));
  });
});

describe("computeMinutesShortfallMoraleDelta", () => {
  it("returns 0 for a gap within normal game-to-game noise", () => {
    const delta = computeMinutesShortfallMoraleDelta({
      personality: neutralPersonality,
      targetMinutesPerGame: 30,
      recentActualMinutesPerGame: 29,
    });
    expect(delta).toBe(0);
  });

  it("is negative and bounded for a real, sustained shortfall", () => {
    const delta = computeMinutesShortfallMoraleDelta({
      personality: neutralPersonality,
      targetMinutesPerGame: 30,
      recentActualMinutesPerGame: 10,
    });
    expect(delta).toBeLessThan(0);
    expect(delta).toBeGreaterThanOrEqual(-8);
  });
});

describe("computeTeamPerformanceMoraleDelta", () => {
  it("reacts positively to a strong team and negatively to a weak one", () => {
    const strong = computeTeamPerformanceMoraleDelta({
      personality: neutralPersonality,
      competitivenessPercentile: 0.95,
      currentStreak: 6,
    });
    const weak = computeTeamPerformanceMoraleDelta({
      personality: neutralPersonality,
      competitivenessPercentile: 0.05,
      currentStreak: -6,
    });
    expect(strong).toBeGreaterThan(0);
    expect(weak).toBeLessThan(0);
  });

  it("reacts more strongly for a highly competitive player than an indifferent one", () => {
    const caresALot = computeTeamPerformanceMoraleDelta({
      personality: { ...neutralPersonality, competitiveness: 95 },
      competitivenessPercentile: 0.1,
      currentStreak: -5,
    });
    const doesntCare = computeTeamPerformanceMoraleDelta({
      personality: { ...neutralPersonality, competitiveness: 10 },
      competitivenessPercentile: 0.1,
      currentStreak: -5,
    });
    expect(Math.abs(caresALot)).toBeGreaterThan(Math.abs(doesntCare));
  });
});

describe("computeContractSituationMoraleDelta", () => {
  it("returns 0 when no market value estimate is available", () => {
    const delta = computeContractSituationMoraleDelta({
      personality: neutralPersonality,
      currentSeasonSalaryCents: 100n,
      marketValueCents: 0n,
      seasonsRemaining: 2,
    });
    expect(delta).toBe(0);
  });

  it("is negative when paid well below market value, more so heading into an unprotected final year", () => {
    const midContract = computeContractSituationMoraleDelta({
      personality: neutralPersonality,
      currentSeasonSalaryCents: 1000n,
      marketValueCents: 2000n,
      seasonsRemaining: 3,
    });
    const finalYear = computeContractSituationMoraleDelta({
      personality: neutralPersonality,
      currentSeasonSalaryCents: 1000n,
      marketValueCents: 2000n,
      seasonsRemaining: 1,
    });
    expect(midContract).toBeLessThan(0);
    expect(finalYear).toBeLessThanOrEqual(midContract);
  });

  it("has no effect when paid at or above market value", () => {
    const delta = computeContractSituationMoraleDelta({
      personality: neutralPersonality,
      currentSeasonSalaryCents: 2000n,
      marketValueCents: 2000n,
      seasonsRemaining: 3,
    });
    expect(delta).toBe(0);
  });
});

describe("computeCoachFitMoraleDelta", () => {
  it("is positive for an elite coach and negative for a poor one, relative to the neutral anchor", () => {
    const elite = computeCoachFitMoraleDelta({ personality: neutralPersonality, coachQuality: 95 });
    const poor = computeCoachFitMoraleDelta({ personality: neutralPersonality, coachQuality: 50 });
    expect(elite).toBeGreaterThan(0);
    expect(poor).toBeLessThan(0);
  });
});

describe("computeMoraleAfterTrade", () => {
  it("pulls extreme morale most of the way back toward baseline", () => {
    const afterTrade = computeMoraleAfterTrade(5, {
      personality: neutralPersonality,
      newTeamIdentity: "PLAY_IN_TEAM",
      fillsNeed: false,
    });
    expect(afterTrade).toBeGreaterThan(5);
  });

  it("gives an extra bump for landing on a contender and filling a need", () => {
    const goodFit = computeMoraleAfterTrade(50, {
      personality: neutralPersonality,
      newTeamIdentity: "CONTENDER",
      fillsNeed: true,
    });
    const badFit = computeMoraleAfterTrade(50, {
      personality: neutralPersonality,
      newTeamIdentity: "TANKING",
      fillsNeed: false,
    });
    expect(goodFit).toBeGreaterThan(badFit);
  });
});

describe("decayMoraleTowardBaseline", () => {
  it("regresses toward the neutral baseline", () => {
    const fromLow = decayMoraleTowardBaseline(10, 50);
    const fromHigh = decayMoraleTowardBaseline(95, 50);
    expect(fromLow).toBeGreaterThan(10);
    expect(fromHigh).toBeLessThan(95);
  });

  it("decays faster for a high-loyalty player than a low-loyalty one", () => {
    const forgiving = decayMoraleTowardBaseline(10, 95);
    const grudgeHolding = decayMoraleTowardBaseline(10, 5);
    expect(forgiving).toBeGreaterThan(grudgeHolding);
  });
});
