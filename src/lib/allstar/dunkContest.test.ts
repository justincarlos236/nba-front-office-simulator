import { describe, expect, it } from "vitest";
import {
  selectDunkContestParticipants,
  simulateDunkContest,
  type DunkContestCandidate,
} from "./dunkContest";

const SEASON = 2026;
const SEED = "league-1-2026-dunk";

let counter = 0;
function candidate(overrides: Partial<DunkContestCandidate>): DunkContestCandidate {
  counter += 1;
  return {
    leaguePlayerId: `p${counter}`,
    position: "SG",
    draftYear: SEASON - 3, // age ~25
    birthDate: null,
    overallRating: 75,
    ...overrides,
  };
}

describe("selectDunkContestParticipants", () => {
  it("favors younger guard/wing players over older bigs, all else equal", () => {
    const youngGuard = candidate({
      leaguePlayerId: "young-guard",
      position: "SG",
      draftYear: SEASON - 1,
    });
    const oldCenter = candidate({
      leaguePlayerId: "old-center",
      position: "C",
      draftYear: SEASON - 14,
    });
    const participants = selectDunkContestParticipants([youngGuard, oldCenter], SEASON, SEED);
    const youngScore = participants.find((p) => p.leaguePlayerId === "young-guard")!.dunkAppeal;
    const oldScore = participants.find((p) => p.leaguePlayerId === "old-center")!.dunkAppeal;
    expect(youngScore).toBeGreaterThan(oldScore);
  });

  it("selects at most 4 participants", () => {
    const filler = Array.from({ length: 15 }, () => candidate({}));
    expect(selectDunkContestParticipants(filler, SEASON, SEED).length).toBeLessThanOrEqual(4);
  });

  it("is deterministic given the same seed", () => {
    const pool = Array.from({ length: 10 }, (_, i) => candidate({ leaguePlayerId: `pool-${i}` }));
    const a = selectDunkContestParticipants(pool, SEASON, SEED);
    counter = 0;
    const pool2 = Array.from({ length: 10 }, (_, i) => candidate({ leaguePlayerId: `pool-${i}` }));
    const b = selectDunkContestParticipants(pool2, SEASON, SEED);
    expect(a).toEqual(b);
  });
});

describe("simulateDunkContest", () => {
  const field = [
    { leaguePlayerId: "a", dunkAppeal: 0.9 },
    { leaguePlayerId: "b", dunkAppeal: 0.8 },
    { leaguePlayerId: "c", dunkAppeal: 0.7 },
    { leaguePlayerId: "d", dunkAppeal: 0.6 },
  ];

  it("is deterministic given the same seed", () => {
    expect(simulateDunkContest(field, SEED)).toEqual(simulateDunkContest(field, SEED));
  });

  it("halves the field of 4 down to a champion in 2 rounds", () => {
    const result = simulateDunkContest(field, SEED);
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds[0].advanced).toHaveLength(2);
    expect(result.rounds[1].advanced).toHaveLength(1);
    expect(field.map((p) => p.leaguePlayerId)).toContain(result.championId);
  });

  it("does not crash and returns a null champion with no participants", () => {
    const result = simulateDunkContest([], SEED);
    expect(result.rounds).toHaveLength(0);
    expect(result.championId).toBeNull();
  });
});
