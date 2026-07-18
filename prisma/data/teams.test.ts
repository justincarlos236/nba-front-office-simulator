import { describe, expect, it } from "vitest";
import { TEAM_SEEDS } from "./teams";

describe("TEAM_SEEDS", () => {
  it("has exactly 30 teams", () => {
    expect(TEAM_SEEDS).toHaveLength(30);
  });

  it("has unique abbreviations", () => {
    const abbreviations = TEAM_SEEDS.map((t) => t.abbreviation);
    expect(new Set(abbreviations).size).toBe(abbreviations.length);
  });

  it("splits 15/15 between conferences", () => {
    const east = TEAM_SEEDS.filter((t) => t.conference === "EAST");
    const west = TEAM_SEEDS.filter((t) => t.conference === "WEST");
    expect(east).toHaveLength(15);
    expect(west).toHaveLength(15);
  });

  it("groups each conference into three five-team divisions", () => {
    for (const conference of ["EAST", "WEST"] as const) {
      const divisions = new Map<string, number>();
      for (const team of TEAM_SEEDS.filter((t) => t.conference === conference)) {
        divisions.set(team.division, (divisions.get(team.division) ?? 0) + 1);
      }
      expect(divisions.size).toBe(3);
      for (const count of divisions.values()) {
        expect(count).toBe(5);
      }
    }
  });

  it("gives every team valid hex colors", () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    for (const team of TEAM_SEEDS) {
      expect(team.primaryColor).toMatch(hexPattern);
      expect(team.secondaryColor).toMatch(hexPattern);
    }
  });
});
