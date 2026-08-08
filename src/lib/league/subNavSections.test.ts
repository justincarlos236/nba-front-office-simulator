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

/** Sections now live in drawers; flatten for the "nothing is ever hidden" checks. */
function allSections(phase: LeaguePhase) {
  const { primary, groups } = getSubNavSections(phase);
  return [...primary, ...groups.flatMap((g) => g.sections)];
}

describe("getSubNavSections", () => {
  it("never hides a section entirely - every section appears in primary or a group for every phase", () => {
    for (const phase of ALL_PHASES) {
      const sections = allSections(phase);
      // 13 original sections plus All-Star, which previously appeared in no
      // navigation at all despite hard-blocking season simulation.
      expect(sections.length).toBe(14);
      expect(new Set(sections.map((s) => s.id)).size).toBe(14);
    }
  });

  it("assigns every section to exactly one drawer", () => {
    for (const phase of ALL_PHASES) {
      const { primary, groups } = getSubNavSections(phase);
      const grouped = groups.flatMap((g) => g.sections.map((s) => s.id));
      // A promoted section leaves its drawer, so the two sets never overlap.
      const promoted = new Set(primary.map((s) => s.id));
      for (const id of grouped) expect(promoted.has(id)).toBe(false);
      expect(new Set(grouped).size).toBe(grouped.length);
    }
  });

  it("keeps All-Star reachable in every phase", () => {
    for (const phase of ALL_PHASES) {
      expect(allSections(phase).map((s) => s.id)).toContain("allStar");
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

  it("every section is still routable - it has a real, non-empty path", () => {
    for (const phase of ALL_PHASES) {
      for (const section of allSections(phase)) {
        expect(section.path.startsWith("/")).toBe(true);
      }
    }
  });

  it("labels match their routes - the nav said News, the page said Transactions & News, the URL said /transactions", () => {
    const transactions = allSections("regular-season").find((s) => s.id === "transactions");
    expect(transactions?.label).toBe("Transactions");
    expect(transactions?.path).toBe("/transactions");
  });
});
