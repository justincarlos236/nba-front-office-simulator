import { describe, expect, it } from "vitest";
import { draftTeams } from "./draftTeams";

describe("draftTeams", () => {
  it("makes the top two scorers the captains", () => {
    const result = draftTeams([
      { leaguePlayerId: "a", score: 90 },
      { leaguePlayerId: "b", score: 95 },
      { leaguePlayerId: "c", score: 80 },
      { leaguePlayerId: "d", score: 70 },
    ]);
    expect(result.captainAId).toBe("b");
    expect(result.captainBId).toBe("a");
  });

  it("splits every player into exactly one of the two teams", () => {
    const players = Array.from({ length: 13 }, (_, i) => ({ leaguePlayerId: `p${i}`, score: i }));
    const result = draftTeams(players);
    const allDrafted = [...result.teamA, ...result.teamB];
    expect(new Set(allDrafted).size).toBe(players.length);
    expect(allDrafted).toHaveLength(players.length);
  });

  it("is deterministic given the same input", () => {
    const players = [
      { leaguePlayerId: "a", score: 50 },
      { leaguePlayerId: "b", score: 80 },
      { leaguePlayerId: "c", score: 60 },
    ];
    expect(draftTeams(players)).toEqual(draftTeams(players));
  });

  it("throws with fewer than 2 players", () => {
    expect(() => draftTeams([{ leaguePlayerId: "a", score: 1 }])).toThrow();
  });
});
