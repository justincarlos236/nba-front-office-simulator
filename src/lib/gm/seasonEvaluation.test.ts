import { describe, expect, it } from "vitest";
import {
  computeActualOutcome,
  computeConfidenceDelta,
  evaluateSeason,
  type PlayoffSeriesForOutcome,
} from "./seasonEvaluation";

describe("computeActualOutcome", () => {
  it("reports missing the playoffs entirely", () => {
    const result = computeActualOutcome("team-a", false, []);
    expect(result.index).toBe(0);
    expect(result.label).toBe("Missed the playoffs");
  });

  it("reports a play-in elimination", () => {
    const result = computeActualOutcome("team-a", true, []);
    expect(result.index).toBe(1);
  });

  it("reports a round-1 elimination", () => {
    const series: PlayoffSeriesForOutcome[] = [
      { round: 1, higherSeedTeamId: "team-a", lowerSeedTeamId: "team-b", winnerTeamId: "team-b" },
    ];
    expect(computeActualOutcome("team-a", true, series).index).toBe(2);
  });

  it("uses the latest (highest) round the team appeared in", () => {
    const series: PlayoffSeriesForOutcome[] = [
      { round: 1, higherSeedTeamId: "team-a", lowerSeedTeamId: "team-b", winnerTeamId: "team-a" },
      { round: 2, higherSeedTeamId: "team-a", lowerSeedTeamId: "team-c", winnerTeamId: "team-c" },
    ];
    expect(computeActualOutcome("team-a", true, series).index).toBe(3);
  });

  it("reports winning the championship distinctly from losing the finals", () => {
    const championSeries: PlayoffSeriesForOutcome[] = [
      { round: 4, higherSeedTeamId: "team-a", lowerSeedTeamId: "team-b", winnerTeamId: "team-a" },
    ];
    const runnerUpSeries: PlayoffSeriesForOutcome[] = [
      { round: 4, higherSeedTeamId: "team-a", lowerSeedTeamId: "team-b", winnerTeamId: "team-b" },
    ];
    expect(computeActualOutcome("team-a", true, championSeries).index).toBe(6);
    expect(computeActualOutcome("team-a", true, runnerUpSeries).index).toBe(5);
  });
});

describe("evaluateSeason", () => {
  it("marks an outcome matching the expectation as MET", () => {
    expect(evaluateSeason("MAKE_PLAYOFFS", { index: 2, label: "" })).toBe("MET");
  });

  it("marks a better-than-expected outcome as EXCEEDED", () => {
    expect(evaluateSeason("MAKE_PLAYOFFS", { index: 4, label: "" })).toBe("EXCEEDED");
  });

  it("marks one level short as FELL_SHORT", () => {
    expect(evaluateSeason("MAKE_PLAYOFFS", { index: 1, label: "" })).toBe("FELL_SHORT");
  });

  it("marks two or more levels short as DRASTICALLY_FELL_SHORT", () => {
    expect(evaluateSeason("CHAMPIONSHIP_CONTENTION", { index: 1, label: "" })).toBe(
      "DRASTICALLY_FELL_SHORT",
    );
  });
});

describe("computeConfidenceDelta", () => {
  it("amplifies penalties for higher payroll tiers", () => {
    const modest = computeConfidenceDelta("DRASTICALLY_FELL_SHORT", "MODEST");
    const extreme = computeConfidenceDelta("DRASTICALLY_FELL_SHORT", "EXTREME");
    expect(extreme).toBeLessThan(modest);
  });

  it("amplifies rewards for higher payroll tiers too", () => {
    const modest = computeConfidenceDelta("EXCEEDED", "MODEST");
    const extreme = computeConfidenceDelta("EXCEEDED", "EXTREME");
    expect(extreme).toBeGreaterThan(modest);
  });

  it("gives a small positive nudge for simply meeting expectations", () => {
    expect(computeConfidenceDelta("MET", "MODERATE")).toBeGreaterThan(0);
  });
});
