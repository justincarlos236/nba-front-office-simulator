import { describe, expect, it } from "vitest";
import { computeDraftResolutionSummary } from "./draftResolution";

describe("computeDraftResolutionSummary", () => {
  it("reports the depth reached and its label", () => {
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 2,
      resolvedHiddenTraits: [],
      myBoardRank: null,
      bigBoardRank: 10,
    });
    expect(summary.depthReached).toBe(2);
    expect(summary.depthLabel).toBe("Studied");
  });

  it("splits resolved vs unresolved hidden axes exhaustively", () => {
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 3,
      resolvedHiddenTraits: ["WORK_ETHIC"],
      myBoardRank: 1,
      bigBoardRank: 5,
    });
    expect(summary.resolvedAxes).toEqual(["WORK_ETHIC"]);
    expect(summary.unresolvedAxes).toEqual(["INJURY_OUTLOOK"]);
  });

  it("both axes resolved leaves nothing unresolved", () => {
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 3,
      resolvedHiddenTraits: ["WORK_ETHIC", "INJURY_OUTLOOK"],
      myBoardRank: 1,
      bigBoardRank: 1,
    });
    expect(summary.resolvedAxes).toEqual(["WORK_ETHIC", "INJURY_OUTLOOK"]);
    expect(summary.unresolvedAxes).toEqual([]);
  });

  it("neither axis resolved leaves both unresolved", () => {
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 0,
      resolvedHiddenTraits: [],
      myBoardRank: null,
      bigBoardRank: 30,
    });
    expect(summary.resolvedAxes).toEqual([]);
    expect(summary.unresolvedAxes).toEqual(["WORK_ETHIC", "INJURY_OUTLOOK"]);
  });

  it("computes a positive rank gap when your board rated him higher than the Big Board", () => {
    // Big Board says #20, you had him #5 - a real disagreement in your favor.
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 3,
      resolvedHiddenTraits: [],
      myBoardRank: 5,
      bigBoardRank: 20,
    });
    expect(summary.rankGapFromBigBoard).toBe(15);
  });

  it("computes a negative rank gap when the Big Board rated him higher than you did", () => {
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 3,
      resolvedHiddenTraits: [],
      myBoardRank: 20,
      bigBoardRank: 5,
    });
    expect(summary.rankGapFromBigBoard).toBe(-15);
  });

  it("rankGapFromBigBoard is null when the prospect was never on My Board", () => {
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 1,
      resolvedHiddenTraits: [],
      myBoardRank: null,
      bigBoardRank: 12,
    });
    expect(summary.rankGapFromBigBoard).toBeNull();
  });

  it("never exposes anything about true potentialRating - the summary shape has no such field", () => {
    const summary = computeDraftResolutionSummary({
      scoutingDepth: 3,
      resolvedHiddenTraits: [],
      myBoardRank: 1,
      bigBoardRank: 1,
    });
    expect("potentialRating" in summary).toBe(false);
    expect("bustRisk" in summary).toBe(false);
    expect("verdict" in summary).toBe(false);
  });
});
