import { describe, expect, it } from "vitest";
import { computeDraftOrder, type DraftOrderTeam } from "./draftOrder";

function makeTeams(count: number): DraftOrderTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    leagueTeamId: `team-${i + 1}`,
    wins: i, // team-1 has the worst record (0 wins), team-30 the best
    losses: count - 1 - i,
  }));
}

describe("computeDraftOrder", () => {
  it("returns exactly 60 picks (30 teams x 2 rounds), each team appearing twice", () => {
    const teams = makeTeams(30);
    const playoffTeamIds = new Set(teams.slice(14).map((t) => t.leagueTeamId)); // 16 best teams made it
    const order = computeDraftOrder(teams, playoffTeamIds, Math.random);
    expect(order).toHaveLength(60);
    const round1 = order.slice(0, 30);
    const round2 = order.slice(30);
    expect(new Set(round1).size).toBe(30);
    expect(new Set(round2).size).toBe(30);
  });

  it("round 1 picks 15-30 are the playoff teams in reverse regular-season record", () => {
    const teams = makeTeams(30);
    const playoffTeamIds = new Set(teams.slice(14).map((t) => t.leagueTeamId));
    const order = computeDraftOrder(teams, playoffTeamIds, Math.random);
    const playoffPortion = order.slice(14, 30);
    // team-15 (worst playoff record) should pick before team-30 (best/champion).
    expect(playoffPortion.indexOf("team-15")).toBeLessThan(playoffPortion.indexOf("team-30"));
    expect(new Set(playoffPortion)).toEqual(playoffTeamIds);
  });

  it("round 1 picks 1-14 are only non-playoff teams", () => {
    const teams = makeTeams(30);
    const playoffTeamIds = new Set(teams.slice(14).map((t) => t.leagueTeamId));
    const order = computeDraftOrder(teams, playoffTeamIds, Math.random);
    const lotteryPortion = order.slice(0, 14);
    for (const id of lotteryPortion) {
      expect(playoffTeamIds.has(id)).toBe(false);
    }
  });

  it("round 2 is a clean reverse-record sweep of all 30 teams, no lottery", () => {
    const teams = makeTeams(30);
    const playoffTeamIds = new Set(teams.slice(14).map((t) => t.leagueTeamId));
    const order = computeDraftOrder(teams, playoffTeamIds, Math.random);
    const round2 = order.slice(30);
    expect(round2).toEqual(teams.map((t) => t.leagueTeamId));
  });

  it("is deterministic for a fixed rng", () => {
    const teams = makeTeams(30);
    const playoffTeamIds = new Set(teams.slice(14).map((t) => t.leagueTeamId));
    const rng = () => 0.42;
    expect(computeDraftOrder(teams, playoffTeamIds, rng)).toEqual(
      computeDraftOrder(teams, playoffTeamIds, rng),
    );
  });
});
