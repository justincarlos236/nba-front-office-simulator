import { describe, expect, it } from "vitest";
import {
  MAX_SCOUTING_DEPTH,
  SWEEP_TARGET_COUNT,
  PRIVATE_WORKOUT_COST,
  PRIVATE_WORKOUT_MIN_DEPTH,
  scoutingAssignmentCapacity,
  scoutingAssignmentsSpent,
  scoutingAssignmentsRemaining,
  checkFocusedLook,
  checkPrivateWorkout,
  planSweep,
  recommendScoutingAssignments,
  type ScoutableForRecommendation,
  type SweepableProspect,
} from "./scoutingAssignments";

describe("scoutingAssignmentCapacity", () => {
  it("returns a higher capacity for a higher department level", () => {
    expect(scoutingAssignmentCapacity("MINIMAL")).toBeLessThan(
      scoutingAssignmentCapacity("STANDARD"),
    );
    expect(scoutingAssignmentCapacity("STANDARD")).toBeLessThan(
      scoutingAssignmentCapacity("MAXIMUM"),
    );
  });
});

describe("scoutingAssignmentsSpent / Remaining", () => {
  it("sums ledger costs as the spent count", () => {
    expect(scoutingAssignmentsSpent([1, 1, 2])).toBe(4);
  });

  it("remaining is capacity minus spent", () => {
    expect(scoutingAssignmentsRemaining("STANDARD", [1, 1, 2])).toBe(
      scoutingAssignmentCapacity("STANDARD") - 4,
    );
  });

  it("empty ledger spends nothing", () => {
    expect(scoutingAssignmentsSpent([])).toBe(0);
  });

  it("a Sweep's cost (1) is independent of how many prospects it touches", () => {
    // The exact bug this ledger model fixes: a Sweep costs 1 regardless of
    // SWEEP_TARGET_COUNT, unlike the old depth-sum derivation which would
    // have silently charged 5.
    expect(scoutingAssignmentsSpent([1])).toBe(1);
  });

  it("a Private Workout's cost (2) is counted even though it changes no Depth", () => {
    expect(scoutingAssignmentsSpent([PRIVATE_WORKOUT_COST])).toBe(PRIVATE_WORKOUT_COST);
  });
});

describe("checkFocusedLook", () => {
  it("allows a look when depth and budget both have room", () => {
    expect(checkFocusedLook(1, 5)).toEqual({ allowed: true, reason: null });
  });

  it("blocks a look at max depth even with budget remaining", () => {
    const result = checkFocusedLook(MAX_SCOUTING_DEPTH, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("blocks a look with zero budget even at low depth", () => {
    const result = checkFocusedLook(0, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("blocks a look with negative budget", () => {
    expect(checkFocusedLook(0, -1).allowed).toBe(false);
  });
});

describe("checkPrivateWorkout", () => {
  it("blocks below the minimum depth even with budget and no resolved axes", () => {
    const result = checkPrivateWorkout(PRIVATE_WORKOUT_MIN_DEPTH - 1, 0, 10);
    expect(result.allowed).toBe(false);
  });

  it("allows at exactly the minimum depth with enough budget", () => {
    const result = checkPrivateWorkout(PRIVATE_WORKOUT_MIN_DEPTH, 0, PRIVATE_WORKOUT_COST);
    expect(result).toEqual({ allowed: true, reason: null });
  });

  it("blocks when both hidden axes are already resolved", () => {
    const result = checkPrivateWorkout(MAX_SCOUTING_DEPTH, 2, 10);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already resolved");
  });

  it("blocks when remaining budget is below the workout's cost", () => {
    const result = checkPrivateWorkout(MAX_SCOUTING_DEPTH, 0, PRIVATE_WORKOUT_COST - 1);
    expect(result.allowed).toBe(false);
  });

  it("allows with exactly one axis already resolved, if budget covers it", () => {
    const result = checkPrivateWorkout(MAX_SCOUTING_DEPTH, 1, PRIVATE_WORKOUT_COST);
    expect(result.allowed).toBe(true);
  });
});

describe("planSweep", () => {
  function pool(
    pathway: SweepableProspect["pathway"],
    count: number,
    currentDepth = 0,
  ): SweepableProspect[] {
    return Array.from({ length: count }, (_, i) => ({
      prospectId: `${pathway}-${i}`,
      pathway,
      currentDepth,
    }));
  }

  it("blocks with zero remaining budget", () => {
    const result = planSweep(
      "league-1",
      2026,
      "INTERNATIONAL_PROFESSIONAL",
      pool("INTERNATIONAL_PROFESSIONAL", 10),
      0,
      0,
    );
    expect(result.allowed).toBe(false);
    expect(result.targetProspectIds).toEqual([]);
  });

  it("blocks when every prospect on the pathway is already scouted", () => {
    const result = planSweep("league-1", 2026, "MID_MAJOR", pool("MID_MAJOR", 5, 1), 10, 0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already been scouted");
  });

  it("only targets prospects on the requested pathway", () => {
    const prospects = [...pool("MID_MAJOR", 10), ...pool("POWER_CONFERENCE", 10)];
    const result = planSweep("league-1", 2026, "MID_MAJOR", prospects, 5, 0);
    expect(result.allowed).toBe(true);
    for (const id of result.targetProspectIds) {
      expect(id.startsWith("MID_MAJOR")).toBe(true);
    }
  });

  it("only targets prospects still at Unknown depth", () => {
    const scoutedAlready = pool("MID_MAJOR", 3, 2);
    const stillUnknown = [
      { prospectId: "unknown-1", pathway: "MID_MAJOR" as const, currentDepth: 0 },
      { prospectId: "unknown-2", pathway: "MID_MAJOR" as const, currentDepth: 0 },
    ];
    const result = planSweep(
      "league-1",
      2026,
      "MID_MAJOR",
      [...scoutedAlready, ...stillUnknown],
      5,
      0,
    );
    expect(result.targetProspectIds.every((id) => id.startsWith("unknown"))).toBe(true);
  });

  it(`caps targets at SWEEP_TARGET_COUNT even with a larger pool`, () => {
    const result = planSweep(
      "league-1",
      2026,
      "POWER_CONFERENCE",
      pool("POWER_CONFERENCE", 30),
      20,
      0,
    );
    expect(result.targetProspectIds.length).toBe(SWEEP_TARGET_COUNT);
  });

  it("targets everyone available when the pool is smaller than SWEEP_TARGET_COUNT", () => {
    const result = planSweep(
      "league-1",
      2026,
      "DEVELOPMENT_PATHWAY",
      pool("DEVELOPMENT_PATHWAY", 3),
      5,
      0,
    );
    expect(result.targetProspectIds.length).toBe(3);
  });

  it("is deterministic for the same league/season/pathway/prior-sweep-count", () => {
    const prospects = pool("MID_MAJOR", 20);
    const a = planSweep("league-1", 2026, "MID_MAJOR", prospects, 5, 0);
    const b = planSweep("league-1", 2026, "MID_MAJOR", prospects, 5, 0);
    expect(a.targetProspectIds).toEqual(b.targetProspectIds);
  });

  it("a second sweep on the same pathway can surface a different set than the first", () => {
    const prospects = pool("MID_MAJOR", 20);
    const first = planSweep("league-1", 2026, "MID_MAJOR", prospects, 5, 0);
    const second = planSweep("league-1", 2026, "MID_MAJOR", prospects, 5, 1);
    expect(first.targetProspectIds).not.toEqual(second.targetProspectIds);
  });
});

describe("recommendScoutingAssignments", () => {
  function prospect(
    overrides: Partial<ScoutableForRecommendation> = {},
  ): ScoutableForRecommendation {
    return {
      prospectId: "p1",
      position: "SF",
      overallRating: 70,
      currentDepth: 0,
      ...overrides,
    };
  }

  it("returns nothing with zero remaining budget", () => {
    expect(recommendScoutingAssignments([prospect()], [], 0)).toEqual([]);
  });

  it("spends every assignment when there's enough room across the pool", () => {
    const prospects = [
      prospect({ prospectId: "p1", overallRating: 90 }),
      prospect({ prospectId: "p2", overallRating: 85 }),
      prospect({ prospectId: "p3", overallRating: 80 }),
      prospect({ prospectId: "p4", overallRating: 75 }),
    ];
    const assignments = recommendScoutingAssignments(prospects, [], 6);
    expect(assignments.length).toBe(6);
  });

  it("weights a prospect at a real team need above a slightly better-rated prospect elsewhere", () => {
    const prospects = [
      prospect({ prospectId: "better-off-need", position: "PF", overallRating: 78 }),
      prospect({ prospectId: "needed-position", position: "PG", overallRating: 70 }),
    ];
    const assignments = recommendScoutingAssignments(prospects, ["POINT_GUARD"], 1);
    expect(assignments[0]).toBe("needed-position");
  });

  it("never assigns past MAX_SCOUTING_DEPTH for a single prospect", () => {
    const prospects = [prospect({ prospectId: "p1", currentDepth: 0 })];
    const assignments = recommendScoutingAssignments(prospects, [], 10);
    const spentOnP1 = assignments.filter((id) => id === "p1").length;
    expect(spentOnP1).toBe(MAX_SCOUTING_DEPTH);
  });

  it("skips a prospect already at max depth", () => {
    const prospects = [
      prospect({ prospectId: "maxed", currentDepth: MAX_SCOUTING_DEPTH }),
      prospect({ prospectId: "fresh", currentDepth: 0 }),
    ];
    const assignments = recommendScoutingAssignments(prospects, [], 3);
    expect(assignments.every((id) => id !== "maxed")).toBe(true);
  });

  it("is deterministic - same inputs always produce the same plan", () => {
    const prospects = [
      prospect({ prospectId: "p1", overallRating: 82 }),
      prospect({ prospectId: "p2", overallRating: 79 }),
      prospect({ prospectId: "p3", overallRating: 76 }),
    ];
    const a = recommendScoutingAssignments(prospects, ["BENCH_DEPTH"], 5);
    const b = recommendScoutingAssignments(prospects, ["BENCH_DEPTH"], 5);
    expect(a).toEqual(b);
  });

  it("spreads depth across several prospects rather than maxing out only the top one", () => {
    const prospects = [
      prospect({ prospectId: "p1", overallRating: 90 }),
      prospect({ prospectId: "p2", overallRating: 89 }),
      prospect({ prospectId: "p3", overallRating: 88 }),
      prospect({ prospectId: "p4", overallRating: 87 }),
    ];
    const assignments = recommendScoutingAssignments(prospects, [], 4);
    const distinctProspects = new Set(assignments);
    expect(distinctProspects.size).toBeGreaterThan(1);
  });
});
