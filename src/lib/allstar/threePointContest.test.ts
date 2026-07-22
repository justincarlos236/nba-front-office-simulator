import { describe, expect, it } from "vitest";
import {
  selectThreePointParticipants,
  simulateThreePointContest,
  type ThreePointCandidate,
} from "./threePointContest";

let counter = 0;
function candidate(overrides: Partial<ThreePointCandidate>): ThreePointCandidate {
  counter += 1;
  return {
    leaguePlayerId: `p${counter}`,
    fg3Made: 100,
    fg3Attempted: 250,
    overallRating: 75,
    ...overrides,
  };
}

describe("selectThreePointParticipants", () => {
  it("does not simply choose the highest-overall-rating players", () => {
    const eliteNonShooter = candidate({
      leaguePlayerId: "elite-non-shooter",
      overallRating: 96,
      fg3Made: 20,
      fg3Attempted: 90, // clears the floor but is a low-volume, mediocre shooter
    });
    const sharpshooter = candidate({
      leaguePlayerId: "sharpshooter",
      overallRating: 74,
      fg3Made: 160,
      fg3Attempted: 320,
    });
    const filler = Array.from({ length: 10 }, () => candidate({ fg3Made: 90, fg3Attempted: 240 }));

    const participants = selectThreePointParticipants([eliteNonShooter, sharpshooter, ...filler]);
    const ids = participants.map((p) => p.leaguePlayerId);
    expect(ids).toContain("sharpshooter");
    expect(ids).not.toContain("elite-non-shooter");
  });

  it("excludes players below the attempts eligibility floor", () => {
    const lowVolume = candidate({ leaguePlayerId: "low-volume", fg3Made: 40, fg3Attempted: 60 });
    const filler = Array.from({ length: 10 }, () => candidate({}));
    const participants = selectThreePointParticipants([lowVolume, ...filler]);
    expect(participants.map((p) => p.leaguePlayerId)).not.toContain("low-volume");
  });

  it("selects at most 8 participants", () => {
    const filler = Array.from({ length: 15 }, () => candidate({}));
    const participants = selectThreePointParticipants(filler);
    expect(participants.length).toBeLessThanOrEqual(8);
  });
});

describe("simulateThreePointContest", () => {
  const field = Array.from({ length: 8 }, (_, i) => ({
    leaguePlayerId: `p${i}`,
    fg3Pct: 0.35 + i * 0.02,
  }));

  it("is deterministic given the same seed", () => {
    const a = simulateThreePointContest(field, "league-1-2026-3pt");
    const b = simulateThreePointContest(field, "league-1-2026-3pt");
    expect(a).toEqual(b);
  });

  it("produces a single champion who was a participant", () => {
    const result = simulateThreePointContest(field, "league-1-2026-3pt");
    expect(field.map((p) => p.leaguePlayerId)).toContain(result.championId);
  });

  it("halves the field each round down to a final", () => {
    const result = simulateThreePointContest(field, "league-1-2026-3pt");
    expect(result.rounds).toHaveLength(3);
    expect(result.rounds[0].advanced).toHaveLength(4);
    expect(result.rounds[1].advanced).toHaveLength(2);
    expect(result.rounds[2].advanced).toHaveLength(1);
  });

  it("does not crash and returns a null champion with no participants", () => {
    const result = simulateThreePointContest([], "league-1-2026-3pt");
    expect(result.rounds).toHaveLength(0);
    expect(result.championId).toBeNull();
  });
});
