import { describe, expect, it } from "vitest";
import {
  computeAttendancePct,
  computeFanHappinessDelta,
  computeFranchisePopularity,
  getFranchisePopularityTier,
  type FanHappinessInputs,
} from "./fanHappiness";

function inputs(overrides: Partial<FanHappinessInputs>): FanHappinessInputs {
  return {
    evaluationVerdict: null,
    teamWinPct: 0.5,
    transactionSentiment: 0,
    starPowerTier: null,
    coachStyle: null,
    ...overrides,
  };
}

describe("computeFanHappinessDelta", () => {
  it("is neutral (near zero) for a perfectly average team with no events", () => {
    expect(computeFanHappinessDelta(inputs({}))).toBe(0);
  });

  it("rewards exceeding expectations more than a rebuilding team merely meeting them", () => {
    const exceeded = computeFanHappinessDelta(inputs({ evaluationVerdict: "EXCEEDED" }));
    const met = computeFanHappinessDelta(inputs({ evaluationVerdict: "MET" }));
    expect(exceeded).toBeGreaterThan(met);
    expect(met).toBeGreaterThan(0);
  });

  it("lets a rebuilding team's modest verdict beat a contender's identical-record fall-short", () => {
    // Same real-world record could read as MET for a rebuilder (low
    // expectation) or FELL_SHORT for a contender (high expectation) -
    // that difference is exactly what the existing evaluateSeason/
    // ExpectationLevel system already encodes, reused here as-is.
    const rebuilder = computeFanHappinessDelta(inputs({ evaluationVerdict: "MET" }));
    const contender = computeFanHappinessDelta(inputs({ evaluationVerdict: "FELL_SHORT" }));
    expect(rebuilder).toBeGreaterThan(contender);
  });

  it("punishes drastically falling short harder than a mild miss", () => {
    const mild = computeFanHappinessDelta(inputs({ evaluationVerdict: "FELL_SHORT" }));
    const drastic = computeFanHappinessDelta(
      inputs({ evaluationVerdict: "DRASTICALLY_FELL_SHORT" }),
    );
    expect(drastic).toBeLessThan(mild);
  });

  it("falls back to win% for CPU teams with no SeasonExpectation", () => {
    const winning = computeFanHappinessDelta(inputs({ teamWinPct: 0.75 }));
    const losing = computeFanHappinessDelta(inputs({ teamWinPct: 0.25 }));
    expect(winning).toBeGreaterThan(losing);
  });

  it("reacts positively to a good transaction season", () => {
    const delta = computeFanHappinessDelta(inputs({ transactionSentiment: 2 }));
    expect(delta).toBeGreaterThan(0);
  });

  it("reacts negatively to a bad transaction season", () => {
    const delta = computeFanHappinessDelta(inputs({ transactionSentiment: -2 }));
    expect(delta).toBeLessThan(0);
  });

  it("gives a small boost for star power and an exciting coaching style", () => {
    const withStar = computeFanHappinessDelta(inputs({ starPowerTier: "SUPERSTAR" }));
    const withoutStar = computeFanHappinessDelta(inputs({ starPowerTier: "MINIMUM" }));
    expect(withStar).toBeGreaterThan(withoutStar);

    const exciting = computeFanHappinessDelta(inputs({ coachStyle: "PACE_AND_SPACE" }));
    const grindy = computeFanHappinessDelta(inputs({ coachStyle: "GRIND_IT_OUT" }));
    expect(exciting).toBeGreaterThan(grindy);
  });
});

describe("computeFranchisePopularity", () => {
  it("scores higher for large markets than small markets given identical inputs", () => {
    const large = computeFranchisePopularity(70, "STAR", "LARGE");
    const small = computeFranchisePopularity(70, "STAR", "SMALL");
    expect(large).toBeGreaterThan(small);
  });

  it("scores higher with a superstar than with a minimum-tier best player", () => {
    const withSuperstar = computeFranchisePopularity(70, "SUPERSTAR", "MID");
    const withoutStar = computeFranchisePopularity(70, "MINIMUM", "MID");
    expect(withSuperstar).toBeGreaterThan(withoutStar);
  });

  it("stays within 0-100", () => {
    expect(computeFranchisePopularity(100, "SUPERSTAR", "LARGE")).toBeLessThanOrEqual(100);
    expect(computeFranchisePopularity(0, "MINIMUM", "SMALL")).toBeGreaterThanOrEqual(0);
  });
});

describe("computeAttendancePct", () => {
  it("gives large markets a higher floor than small markets at the same happiness", () => {
    const large = computeAttendancePct(65, "LARGE");
    const small = computeAttendancePct(65, "SMALL");
    expect(large).toBeGreaterThan(small);
  });

  it("rises with fan happiness", () => {
    const happy = computeAttendancePct(95, "MID");
    const unhappy = computeAttendancePct(20, "MID");
    expect(happy).toBeGreaterThan(unhappy);
  });

  it("stays within 0.3-1.0", () => {
    expect(computeAttendancePct(100, "LARGE")).toBeLessThanOrEqual(1.0);
    expect(computeAttendancePct(0, "SMALL")).toBeGreaterThanOrEqual(0.3);
  });
});

describe("getFranchisePopularityTier", () => {
  it("rises monotonically with popularity", () => {
    expect(getFranchisePopularityTier(90)).toBe("TRENDING");
    expect(getFranchisePopularityTier(75)).toBe("STRONG");
    expect(getFranchisePopularityTier(60)).toBe("STEADY");
    expect(getFranchisePopularityTier(45)).toBe("SOFT");
    expect(getFranchisePopularityTier(10)).toBe("WEAK");
  });
});
