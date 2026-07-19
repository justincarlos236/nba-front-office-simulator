import { describe, expect, it } from "vitest";
import { pickHigherSeed, seedConference, type StandingsEntry } from "./playoffSeeding";

function entry(leagueTeamId: string, wins: number, losses: number): StandingsEntry {
  return { leagueTeamId, wins, losses };
}

describe("seedConference", () => {
  it("orders 15 teams by winning percentage, best first", () => {
    const standings = [
      entry("a", 10, 40),
      entry("b", 50, 0),
      entry("c", 30, 20),
      ...Array.from({ length: 12 }, (_, i) => entry(`t${i}`, 25, 25)),
    ];
    const seeding = seedConference(standings);
    expect(seeding.directQualifiers[0]).toBe("b");
    expect(seeding.directQualifiers[1]).toBe("c");
  });

  it("splits into top 6 direct qualifiers and next 4 play-in teams", () => {
    const standings = Array.from({ length: 15 }, (_, i) => entry(`t${i}`, 50 - i, i));
    const seeding = seedConference(standings);
    expect(seeding.directQualifiers).toEqual(["t0", "t1", "t2", "t3", "t4", "t5"]);
    expect(seeding.playInTeams).toEqual(["t6", "t7", "t8", "t9"]);
  });

  it("breaks ties in winning percentage by total wins", () => {
    const standings = [entry("fewer-games", 20, 20), entry("more-games", 41, 41)];
    const seeding = seedConference(standings);
    expect(seeding.directQualifiers[0]).toBe("more-games");
  });

  it("treats a winless, gameless team as 0% rather than dividing by zero", () => {
    const standings = [entry("winner", 1, 0), entry("untested", 0, 0)];
    const seeding = seedConference(standings);
    expect(seeding.directQualifiers).toEqual(["winner", "untested"]);
  });
});

describe("pickHigherSeed", () => {
  it("picks the better winning percentage", () => {
    expect(pickHigherSeed(entry("a", 50, 20), entry("b", 45, 25))).toEqual(entry("a", 50, 20));
  });

  it("breaks a percentage tie by total wins", () => {
    expect(pickHigherSeed(entry("fewer", 20, 20), entry("more", 41, 41))).toEqual(
      entry("more", 41, 41),
    );
  });
});
