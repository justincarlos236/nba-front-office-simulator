import { describe, expect, it } from "vitest";
import { generateRoundRobinSchedule, type ScheduleTeam } from "./generateSchedule";

// Mirrors the real fixture shape: 2 conferences x 3 divisions x 5 teams.
const CONFERENCES: ("EAST" | "WEST")[] = ["EAST", "WEST"];
const DIVISIONS = ["A", "B", "C"];
const TEAMS: ScheduleTeam[] = CONFERENCES.flatMap((conference) =>
  DIVISIONS.flatMap((division) =>
    Array.from({ length: 5 }, (_, i) => ({
      leagueTeamId: `${conference}-${division}-${i}`,
      conference,
      division: `${conference}-${division}`,
    })),
  ),
);

function divisionOf(teamId: string): string {
  return teamId.split("-").slice(0, 2).join("-");
}
function conferenceOf(teamId: string): string {
  return teamId.split("-")[0];
}

const SEASON = 2025;

describe("generateRoundRobinSchedule", () => {
  it("gives every team exactly 82 games, 1230 total league-wide", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    expect(schedule).toHaveLength(1230);

    const gamesPerTeam = new Map<string, number>();
    for (const game of schedule) {
      gamesPerTeam.set(game.homeLeagueTeamId, (gamesPerTeam.get(game.homeLeagueTeamId) ?? 0) + 1);
      gamesPerTeam.set(game.awayLeagueTeamId, (gamesPerTeam.get(game.awayLeagueTeamId) ?? 0) + 1);
    }
    expect(gamesPerTeam.size).toBe(30);
    for (const count of gamesPerTeam.values()) {
      expect(count).toBe(82);
    }
  });

  it("gives every team the exact real-NBA split: 16 division + 36 conference-non-division + 30 other-conference", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    const gamesAgainst = new Map<string, Map<string, number>>();
    for (const game of schedule) {
      for (const [a, b] of [
        [game.homeLeagueTeamId, game.awayLeagueTeamId],
        [game.awayLeagueTeamId, game.homeLeagueTeamId],
      ]) {
        const inner = gamesAgainst.get(a) ?? new Map<string, number>();
        inner.set(b, (inner.get(b) ?? 0) + 1);
        gamesAgainst.set(a, inner);
      }
    }

    for (const team of TEAMS) {
      const opponents = gamesAgainst.get(team.leagueTeamId)!;
      let divisionGames = 0;
      let conferenceNonDivisionGames = 0;
      let otherConferenceGames = 0;
      for (const [opponentId, count] of opponents) {
        if (divisionOf(opponentId) === divisionOf(team.leagueTeamId)) divisionGames += count;
        else if (conferenceOf(opponentId) === conferenceOf(team.leagueTeamId))
          conferenceNonDivisionGames += count;
        else otherConferenceGames += count;
      }
      expect(divisionGames).toBe(16);
      expect(conferenceNonDivisionGames).toBe(36);
      expect(otherConferenceGames).toBe(30);
    }
  });

  it("never schedules a team against itself", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    for (const game of schedule) {
      expect(game.homeLeagueTeamId).not.toBe(game.awayLeagueTeamId);
    }
  });

  it("never double-books a team on the same day", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    const teamsByDay = new Map<number, Set<string>>();
    for (const game of schedule) {
      const teams = teamsByDay.get(game.dayIndex) ?? new Set<string>();
      expect(teams.has(game.homeLeagueTeamId)).toBe(false);
      expect(teams.has(game.awayLeagueTeamId)).toBe(false);
      teams.add(game.homeLeagueTeamId);
      teams.add(game.awayLeagueTeamId);
      teamsByDay.set(game.dayIndex, teams);
    }
  });

  it("never lets a team play 3 days in a row", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    const daysByTeam = new Map<string, number[]>();
    for (const game of schedule) {
      for (const teamId of [game.homeLeagueTeamId, game.awayLeagueTeamId]) {
        const days = daysByTeam.get(teamId) ?? [];
        days.push(game.dayIndex);
        daysByTeam.set(teamId, days);
      }
    }
    for (const days of daysByTeam.values()) {
      const sorted = [...days].sort((a, b) => a - b);
      let streak = 1;
      for (let i = 1; i < sorted.length; i++) {
        streak = sorted[i] === sorted[i - 1] + 1 ? streak + 1 : 1;
        expect(streak).toBeLessThanOrEqual(2);
      }
    }
  });

  it("keeps the season length in a realistic range", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    const maxDay = Math.max(...schedule.map((g) => g.dayIndex));
    expect(maxDay).toBeGreaterThanOrEqual(150);
    expect(maxDay).toBeLessThanOrEqual(230);
  });

  it("keeps every team's final game close to the league's last day", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    const lastDayByTeam = new Map<string, number>();
    for (const game of schedule) {
      for (const teamId of [game.homeLeagueTeamId, game.awayLeagueTeamId]) {
        lastDayByTeam.set(teamId, Math.max(lastDayByTeam.get(teamId) ?? 0, game.dayIndex));
      }
    }
    const maxDay = Math.max(...lastDayByTeam.values());
    for (const lastDay of lastDayByTeam.values()) {
      expect(maxDay - lastDay).toBeLessThanOrEqual(15);
    }
  });

  it("assigns sequential, unique game numbers consistent with dayIndex order", () => {
    const schedule = generateRoundRobinSchedule(TEAMS, "seed-1", SEASON);
    const gameNumbers = schedule.map((g) => g.gameNumber).sort((a, b) => a - b);
    expect(gameNumbers).toEqual(Array.from({ length: schedule.length }, (_, i) => i + 1));

    const byGameNumber = [...schedule].sort((a, b) => a.gameNumber - b.gameNumber);
    for (let i = 1; i < byGameNumber.length; i++) {
      expect(byGameNumber[i].dayIndex).toBeGreaterThanOrEqual(byGameNumber[i - 1].dayIndex);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateRoundRobinSchedule(TEAMS, "same-seed", SEASON);
    const b = generateRoundRobinSchedule(TEAMS, "same-seed", SEASON);
    expect(a).toEqual(b);
  });

  it("produces a different ordering for a different seed", () => {
    const a = generateRoundRobinSchedule(TEAMS, "seed-a", SEASON);
    const b = generateRoundRobinSchedule(TEAMS, "seed-b", SEASON);
    expect(a).not.toEqual(b);
  });
});
