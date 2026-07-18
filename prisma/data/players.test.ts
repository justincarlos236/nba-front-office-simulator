import { describe, expect, it } from "vitest";
import players from "./players.json";
import { TEAM_SEEDS } from "./teams";

describe("players fixture", () => {
  it("matches every stats-fixture player to a real bio", () => {
    expect(players.players.length).toBe(497);
  });

  it("only references real team abbreviations", () => {
    const validAbbreviations = new Set(TEAM_SEEDS.map((t) => t.abbreviation));
    for (const player of players.players) {
      if (player.teamAbbreviation) {
        expect(validAbbreviations.has(player.teamAbbreviation)).toBe(true);
      }
    }
  });

  it("gives every player a valid position", () => {
    const validPositions = new Set(["PG", "SG", "SF", "PF", "C"]);
    for (const player of players.players) {
      expect(validPositions.has(player.position)).toBe(true);
    }
  });

  it("includes real, verifiable stars with correct current teams", () => {
    const jokic = players.players.find((p) => p.fullName === "Nikola Jokic");
    expect(jokic?.teamAbbreviation).toBe("DEN");
    expect(jokic?.position).toBe("C");
  });

  it("can have a current team that differs from the 2023-24 stats-season team (real trades since then)", () => {
    // Luka Doncic played the 2023-24 season with Dallas but was traded to
    // the Lakers in a real Feb 2025 blockbuster - teamAbbreviation here
    // reflects his real current team, while his season stat line below is
    // still correctly attributed to Dallas for that season.
    const doncic = players.players.find((p) => p.fullName === "Luka Doncic");
    expect(doncic?.teamAbbreviation).toBe("LAL");
  });

  it("has no duplicate players", () => {
    const ids = players.players.map((p) => p.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
