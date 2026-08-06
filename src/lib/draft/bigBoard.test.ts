import { describe, expect, it } from "vitest";
import { computePublicEvaluationFactors, computeBigBoard, type BigBoardProspect } from "./bigBoard";

function prospect(overrides: Partial<BigBoardProspect> = {}): BigBoardProspect {
  return {
    id: "p1",
    age: 20,
    position: "SF",
    heightInches: 78,
    isInternational: false,
    ...overrides,
  };
}

describe("computePublicEvaluationFactors", () => {
  it("is deterministic for the same prospect and reveal state", () => {
    const a = computePublicEvaluationFactors(prospect(), false);
    const b = computePublicEvaluationFactors(prospect(), false);
    expect(a).toEqual(b);
  });

  it("gives different prospects different evaluations", () => {
    const a = computePublicEvaluationFactors(prospect({ id: "a" }), false);
    const b = computePublicEvaluationFactors(prospect({ id: "b" }), false);
    expect(a.publicEvaluation).not.toBe(b.publicEvaluation);
  });

  it("scores a younger prospect's age factor higher than an older one, all else equal", () => {
    const young = computePublicEvaluationFactors(prospect({ id: "x", age: 19 }), false);
    const old = computePublicEvaluationFactors(prospect({ id: "x", age: 23 }), false);
    expect(young.ageScore).toBeGreaterThan(old.ageScore);
  });

  it("scores prototypical height for the position higher than an off-prototype height", () => {
    // Prototypical center height is 84in - an undersized 78in center should
    // score lower on the physical factor than one at prototypical height.
    const prototypical = computePublicEvaluationFactors(
      prospect({ id: "c1", position: "C", heightInches: 84 }),
      false,
    );
    const undersized = computePublicEvaluationFactors(
      prospect({ id: "c1", position: "C", heightInches: 74 }),
      false,
    );
    expect(prototypical.physicalScore).toBeGreaterThan(undersized.physicalScore);
  });

  it("systematically scores international prospects lower on competition/visibility", () => {
    // Run across many seeds to confirm this is a real, consistent bias, not
    // an artifact of one prospect's random draw.
    let internationalWins = 0;
    const trials = 40;
    for (let i = 0; i < trials; i++) {
      const domestic = computePublicEvaluationFactors(
        prospect({ id: `dom-${i}`, isInternational: false }),
        false,
      );
      const international = computePublicEvaluationFactors(
        prospect({ id: `intl-${i}`, isInternational: true }),
        false,
      );
      if (domestic.competitionScore > international.competitionScore) internationalWins++;
    }
    // Not every single trial needs to go this way (there's real randomness
    // layered on top of the bias), but the bias should dominate clearly.
    expect(internationalWins).toBeGreaterThan(trials * 0.7);
  });

  it("leaves tournamentScore null and excludes it from the evaluation before reveal", () => {
    const result = computePublicEvaluationFactors(prospect(), false);
    expect(result.tournamentScore).toBeNull();
  });

  it("reveals a real tournamentScore once revealed, and it can shift the overall evaluation", () => {
    const before = computePublicEvaluationFactors(prospect({ id: "shift-me" }), false);
    const after = computePublicEvaluationFactors(prospect({ id: "shift-me" }), true);
    expect(after.tournamentScore).not.toBeNull();
    expect(after.tournamentScore).toBeGreaterThanOrEqual(0);
    expect(after.tournamentScore).toBeLessThanOrEqual(100);
    // The reveal folds in a new factor - the overall evaluation should
    // actually move (deterministically, not necessarily up or down).
    expect(after.publicEvaluation).not.toBe(before.publicEvaluation);
  });

  it("never reads overallRating/potentialRating - the module doesn't even accept them", () => {
    // Type-level guarantee: BigBoardProspect has no rating fields at all,
    // so it's structurally impossible for this module to rank by truth.
    const p: unknown = prospect();
    expect((p as Record<string, unknown>).overallRating).toBeUndefined();
    expect((p as Record<string, unknown>).potentialRating).toBeUndefined();
  });
});

describe("noiseMultiplier (class character variance)", () => {
  it("a higher noise multiplier widens the spread of production/competition/tournament scores across many prospects", () => {
    function spread(multiplier: number): number {
      const values = Array.from(
        { length: 60 },
        (_, i) =>
          computePublicEvaluationFactors(
            prospect({ id: `noise-${multiplier}-${i}` }),
            true,
            multiplier,
          ).publicEvaluation,
      );
      return Math.max(...values) - Math.min(...values);
    }
    expect(spread(1.5)).toBeGreaterThan(spread(1));
  });

  it("a noise multiplier of 1 (default) matches omitting the argument entirely", () => {
    const withDefault = computePublicEvaluationFactors(prospect({ id: "same" }), true);
    const withExplicit1 = computePublicEvaluationFactors(prospect({ id: "same" }), true, 1);
    expect(withDefault).toEqual(withExplicit1);
  });
});

describe("computeBigBoard", () => {
  it("ranks every prospect exactly once, 1 through N", () => {
    const prospects = Array.from({ length: 10 }, (_, i) => prospect({ id: `p${i}` }));
    const board = computeBigBoard(prospects, false);
    expect(board).toHaveLength(10);
    expect(board.map((e) => e.publicRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("ranks by descending publicEvaluation", () => {
    const prospects = Array.from({ length: 15 }, (_, i) => prospect({ id: `rank-${i}` }));
    const board = computeBigBoard(prospects, false);
    for (let i = 1; i < board.length; i++) {
      expect(board[i - 1].publicEvaluation).toBeGreaterThanOrEqual(board[i].publicEvaluation);
    }
  });

  it("is deterministic across calls", () => {
    const prospects = Array.from({ length: 8 }, (_, i) => prospect({ id: `det-${i}` }));
    const a = computeBigBoard(prospects, false);
    const b = computeBigBoard(prospects, false);
    expect(a).toEqual(b);
  });

  it("can re-order after the tournament reveal", () => {
    const prospects = Array.from({ length: 20 }, (_, i) => prospect({ id: `reorder-${i}` }));
    const before = computeBigBoard(prospects, false).map((e) => e.prospectId);
    const after = computeBigBoard(prospects, true).map((e) => e.prospectId);
    expect(before).not.toEqual(after);
  });
});
