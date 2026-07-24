import { describe, it, expect } from "vitest";
import { normalizePlayerName } from "../normalizeName";
import {
  espnSeasonYear,
  parseHeightInches,
  parseWeightLbs,
  inferPosition,
  rosterRowToBio,
  aggregateSeasonStats,
} from "./hoopR";

describe("espnSeasonYear", () => {
  it("maps our start-year to ESPN's end-year label", () => {
    expect(espnSeasonYear(2025)).toBe(2026); // 2025-26
    expect(espnSeasonYear(2023)).toBe(2024);
  });
});

describe("parseHeightInches / parseWeightLbs", () => {
  it("parses ESPN's formatted strings", () => {
    expect(parseHeightInches("6' 5\"")).toBe(77);
    expect(parseHeightInches("7' 0\"")).toBe(84);
    expect(parseWeightLbs("205 lbs")).toBe(205);
  });
  it("returns null on missing/garbage input", () => {
    expect(parseHeightInches(null)).toBeNull();
    expect(parseHeightInches("N/A")).toBeNull();
    expect(parseWeightLbs(null)).toBeNull();
  });
});

describe("inferPosition", () => {
  it("splits guards and forwards by height for lineup variety", () => {
    expect(inferPosition("G", 74)).toBe("PG"); // 6'2" -> PG
    expect(inferPosition("G", 79)).toBe("SG"); // 6'7" -> SG
    expect(inferPosition("F", 79)).toBe("SF"); // 6'7" -> SF
    expect(inferPosition("F", 82)).toBe("PF"); // 6'10" -> PF
    expect(inferPosition("C", 84)).toBe("C");
  });
  it("falls back to the coarse mapping when height is unknown", () => {
    expect(inferPosition("G", null)).toBe("PG");
    expect(inferPosition("F", null)).toBe("SF");
  });
});

describe("rosterRowToBio", () => {
  it("maps a real-shaped roster row into a canonical bio", () => {
    const bio = rosterRowToBio({
      athlete_id: "4278039",
      full_name: "Nickeil Alexander-Walker",
      display_name: "Nickeil Alexander-Walker",
      position_abbreviation: "G",
      height: "6' 5\"",
      weight: "205 lbs",
      date_of_birth: "1998-09-02T07:00Z",
      birth_place_country: "Canada",
      headshot_href: "https://a.espncdn.com/i/headshots/nba/players/full/4278039.png",
      team_abbreviation: "ATL",
    });
    expect(bio.fullName).toBe("Nickeil Alexander-Walker");
    expect(bio.position).toBe("SG"); // "G" at 6'5" -> SG via height-refined inference
    expect(bio.heightInches).toBe(77);
    expect(bio.weightLbs).toBe(205);
    expect(bio.birthDate).toBe("1998-09-02"); // time component trimmed
    expect(bio.nationality).toBe("Canada");
    expect(bio.currentTeamAbbreviation).toBe("ATL");
    expect(bio.photoUrl).toContain("4278039.png");
    expect(bio.refs).toEqual([{ provider: "hoopR", id: "4278039" }]);
    // Not present in the rosters file - must be null, never fabricated.
    expect(bio.draftYear).toBeNull();
    expect(bio.college).toBeNull();
  });
});

describe("aggregateSeasonStats", () => {
  function box(over: Record<string, unknown>): Record<string, unknown> {
    return {
      season_type: 2,
      did_not_play: false,
      active: true,
      athlete_id: "1",
      athlete_display_name: "Test Player",
      team_abbreviation: "DEN",
      minutes: 30,
      points: 20,
      rebounds: 10,
      assists: 5,
      steals: 1,
      blocks: 1,
      turnovers: 2,
      field_goals_made: 8,
      field_goals_attempted: 15,
      three_point_field_goals_made: 1,
      three_point_field_goals_attempted: 4,
      free_throws_made: 3,
      free_throws_attempted: 4,
      ...over,
    };
  }

  it("aggregates per-game averages and TS% across a player's games, tagged with identity", () => {
    const rows = [box({}), box({ points: 30, field_goals_made: 12, field_goals_attempted: 20 })];
    const [line] = aggregateSeasonStats(rows, 2025, 1);
    expect(line.ref).toEqual({ provider: "hoopR", id: "1" });
    expect(line.normalizedName).toBe(normalizePlayerName("Test Player"));
    const { stat } = line;
    expect(stat.season).toBe(2025);
    expect(stat.team).toBe("DEN");
    expect(stat.gamesPlayed).toBe(2);
    expect(stat.pointsPerGame).toBe(25); // (20+30)/2
    // TS% = totalPts / (2*(totalFGA + 0.44*totalFTA)) = 50 / (2*(35 + 0.44*8)) = 0.649
    expect(stat.trueShootingPct).toBeCloseTo(0.649, 3);
  });

  it("excludes playoffs, DNPs, and sub-threshold samples", () => {
    const rows = [
      box({ athlete_id: "1" }),
      box({ athlete_id: "1", season_type: 3 }), // playoff game - ignored
      box({ athlete_id: "2", did_not_play: true }), // DNP - ignored
      box({ athlete_id: "3", minutes: 0 }), // no minutes - ignored
    ];
    const stats = aggregateSeasonStats(rows, 2025, 1);
    expect(stats).toHaveLength(1);
    expect(stats[0].stat.gamesPlayed).toBe(1); // only the one regular-season game for athlete 1
  });

  it("picks the most-frequent team for a mid-season-traded player", () => {
    const rows = [
      box({ team_abbreviation: "DEN" }),
      box({ team_abbreviation: "DEN" }),
      box({ team_abbreviation: "LAL" }),
    ];
    const [line] = aggregateSeasonStats(rows, 2025, 1);
    expect(line.stat.team).toBe("DEN");
  });
});
