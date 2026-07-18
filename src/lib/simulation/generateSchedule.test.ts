import { describe, expect, it } from "vitest";
import { generateRoundRobinSchedule } from "./generateSchedule";

const TEAM_IDS = Array.from({ length: 30 }, (_, i) => `team-${i}`);

describe("generateRoundRobinSchedule", () => {
  it("gives every team exactly 58 games (twice against each of the other 29)", () => {
    const schedule = generateRoundRobinSchedule(TEAM_IDS, "seed-1");
    const gamesPerTeam = new Map<string, number>();
    for (const game of schedule) {
      gamesPerTeam.set(game.homeLeagueTeamId, (gamesPerTeam.get(game.homeLeagueTeamId) ?? 0) + 1);
      gamesPerTeam.set(game.awayLeagueTeamId, (gamesPerTeam.get(game.awayLeagueTeamId) ?? 0) + 1);
    }
    expect(gamesPerTeam.size).toBe(30);
    for (const count of gamesPerTeam.values()) {
      expect(count).toBe(58);
    }
  });

  it("gives every team an equal 29 home and 29 away games", () => {
    const schedule = generateRoundRobinSchedule(TEAM_IDS, "seed-1");
    const homeCounts = new Map<string, number>();
    const awayCounts = new Map<string, number>();
    for (const game of schedule) {
      homeCounts.set(game.homeLeagueTeamId, (homeCounts.get(game.homeLeagueTeamId) ?? 0) + 1);
      awayCounts.set(game.awayLeagueTeamId, (awayCounts.get(game.awayLeagueTeamId) ?? 0) + 1);
    }
    for (const teamId of TEAM_IDS) {
      expect(homeCounts.get(teamId)).toBe(29);
      expect(awayCounts.get(teamId)).toBe(29);
    }
  });

  it("assigns sequential, unique game numbers", () => {
    const schedule = generateRoundRobinSchedule(TEAM_IDS, "seed-1");
    const gameNumbers = schedule.map((g) => g.gameNumber).sort((a, b) => a - b);
    expect(gameNumbers).toEqual(Array.from({ length: schedule.length }, (_, i) => i + 1));
  });

  it("is deterministic for the same seed", () => {
    const a = generateRoundRobinSchedule(TEAM_IDS, "same-seed");
    const b = generateRoundRobinSchedule(TEAM_IDS, "same-seed");
    expect(a).toEqual(b);
  });

  it("produces a different ordering for a different seed", () => {
    const a = generateRoundRobinSchedule(TEAM_IDS, "seed-a");
    const b = generateRoundRobinSchedule(TEAM_IDS, "seed-b");
    expect(a).not.toEqual(b);
  });

  it("never schedules a team against itself", () => {
    const schedule = generateRoundRobinSchedule(TEAM_IDS, "seed-1");
    for (const game of schedule) {
      expect(game.homeLeagueTeamId).not.toBe(game.awayLeagueTeamId);
    }
  });
});
