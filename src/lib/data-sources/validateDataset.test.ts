import { describe, it, expect } from "vitest";
import type { Position } from "./mapPosition";
import { validateDataset, type ValidatablePlayer } from "./validateDataset";

// Build a positionally-balanced 15-man team so a valid team passes cleanly.
function makeTeam(team: string, baseId: number): ValidatablePlayer[] {
  const positions: Position[] = [
    "PG",
    "PG",
    "SG",
    "SG",
    "SF",
    "SF",
    "PF",
    "PF",
    "C",
    "C",
    "PG",
    "SG",
    "SF",
    "PF",
    "C",
  ];
  return positions.map((position, i) => ({
    externalId: String(baseId + i),
    fullName: `${team} Player ${i}`,
    position,
    teamAbbreviation: team,
    seedOverallRating: 75 - i, // descending so the trim is deterministic
    seedPotentialRating: 78 - i,
  }));
}

function leagueOf(teams: string[]): ValidatablePlayer[] {
  return teams.flatMap((t, i) => makeTeam(t, i * 100));
}

const THIRTY = Array.from({ length: 30 }, (_, i) => `T${i}`);
const KNOWN = new Set(THIRTY);

describe("validateDataset", () => {
  it("passes a well-formed 30-team league and reports a star", () => {
    const players = leagueOf(THIRTY);
    players[0].seedOverallRating = 95; // ensure a star exists
    players[0].seedPotentialRating = 95;
    const r = validateDataset(players, KNOWN);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.teamsCovered).toBe(30);
    expect(r.warnings.find((w) => w.code === "no_stars")).toBeUndefined();
  });

  it("flags out-of-range ratings", () => {
    const players = leagueOf(THIRTY);
    players[0].seedOverallRating = 105;
    players[1].seedPotentialRating = 50; // below overall
    const r = validateDataset(players, KNOWN);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "rating_range")).toBe(true);
    expect(r.errors.some((e) => e.code === "potential_range")).toBe(true);
  });

  it("flags duplicate external ids and unknown teams", () => {
    const players = leagueOf(THIRTY);
    players[1].externalId = players[0].externalId; // dup
    players[2].teamAbbreviation = "ZZZ"; // unknown
    const r = validateDataset(players, KNOWN);
    expect(r.errors.some((e) => e.code === "duplicate_id")).toBe(true);
    expect(r.errors.some((e) => e.code === "unknown_team")).toBe(true);
  });

  it("flags a team that can't field a balanced roster", () => {
    // A team of only guards can't field a frontcourt.
    const allGuards: ValidatablePlayer[] = Array.from({ length: 15 }, (_, i) => ({
      externalId: `g${i}`,
      fullName: `Guard ${i}`,
      position: "PG" as Position,
      teamAbbreviation: "T0",
      seedOverallRating: 72,
      seedPotentialRating: 72,
    }));
    const players = [...allGuards, ...leagueOf(THIRTY.slice(1))];
    const r = validateDataset(players, KNOWN);
    expect(r.errors.some((e) => e.code === "no_frontcourt")).toBe(true);
  });

  it("flags incomplete team coverage", () => {
    const r = validateDataset(leagueOf(THIRTY.slice(0, 28)), KNOWN);
    expect(r.errors.some((e) => e.code === "team_coverage")).toBe(true);
  });
});
