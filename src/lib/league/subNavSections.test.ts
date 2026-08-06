import { describe, expect, it } from "vitest";
import { getSubNavSections } from "./subNavSections";
import type { LeaguePhase } from "./leaguePhase";

const ALL_PHASES: LeaguePhase[] = [
  "regular-season",
  "playoffs-incomplete",
  "pre-draft",
  "draft-incomplete",
  "ready",
];

describe("getSubNavSections", () => {
  it("never hides a section entirely - every section appears in primary or secondary for every phase", () => {
    for (const phase of ALL_PHASES) {
      const { primary, secondary } = getSubNavSections(phase);
      expect(primary.length + secondary.length).toBe(13);
      const ids = new Set([...primary, ...secondary].map((s) => s.id));
      expect(ids.size).toBe(13);
    }
  });

  it("promotes Rotation/Schedule/Standings/Playoffs during the regular season", () => {
    const { primary } = getSubNavSections("regular-season");
    const ids = primary.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["rotation", "schedule", "standings", "playoffs"]));
  });

  it("promotes Playoffs/Standings/Rotation once the regular season ends but no champion is crowned", () => {
    const { primary } = getSubNavSections("playoffs-incomplete");
    const ids = primary.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["playoffs", "standings", "rotation"]));
  });

  it("promotes Draft/Offseason/Staff during the pre-draft scouting window", () => {
    const { primary } = getSubNavSections("pre-draft");
    const ids = primary.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["draft", "offseason", "staff"]));
  });

  it("promotes Draft/Offseason/Free Agents while the draft is incomplete", () => {
    const { primary } = getSubNavSections("draft-incomplete");
    const ids = primary.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["draft", "offseason", "freeAgents"]));
  });

  it("promotes Offseason/Free Agents/Staff once ready to advance", () => {
    const { primary } = getSubNavSections("ready");
    const ids = primary.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["offseason", "freeAgents", "staff"]));
  });

  it("every secondary section is still routable - it has a real, non-empty path", () => {
    for (const phase of ALL_PHASES) {
      const { secondary } = getSubNavSections(phase);
      for (const section of secondary) {
        expect(section.path.startsWith("/")).toBe(true);
      }
    }
  });
});
