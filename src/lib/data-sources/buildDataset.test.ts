import { describe, it, expect } from "vitest";
import type { CanonicalPlayerBio, CanonicalSeasonStat } from "./canonical";
import type { ProviderSeasonStatLine } from "./providers/adapter";
import { normalizePlayerName } from "./normalizeName";
import {
  computeAgeAtSeason,
  mergeCanonicalPlayers,
  NO_STATS_DEFAULT_OVERALL,
} from "./buildDataset";

function bio(id: string, name: string, over: Partial<CanonicalPlayerBio> = {}): CanonicalPlayerBio {
  return {
    normalizedName: normalizePlayerName(name),
    fullName: name,
    position: "C",
    heightInches: null,
    weightLbs: null,
    birthDate: null,
    draftYear: null,
    draftRound: null,
    draftPick: null,
    nationality: null,
    college: null,
    photoUrl: null,
    currentTeamAbbreviation: "DEN",
    refs: [{ provider: "hoopR", id }],
    ...over,
  };
}

function line(
  id: string,
  name: string,
  season: number,
  stat: Partial<CanonicalSeasonStat> = {},
): ProviderSeasonStatLine {
  return {
    ref: { provider: "hoopR", id },
    normalizedName: normalizePlayerName(name),
    stat: {
      season,
      team: "DEN",
      gamesPlayed: 70,
      minutesPerGame: 30,
      pointsPerGame: 18,
      reboundsPerGame: 6,
      assistsPerGame: 4,
      stealsPerGame: 1,
      blocksPerGame: 0.6,
      turnoversPerGame: 1.8,
      fgPct: 0.47,
      fg3Pct: 0.36,
      ftPct: 0.8,
      trueShootingPct: 0.58,
      usagePct: null,
      winSharesPer48: null,
      boxPlusMinus: null,
      valueOverReplacement: null,
      ...stat,
    },
  };
}

describe("computeAgeAtSeason", () => {
  it("computes age as of Oct 1 of the season's start year", () => {
    expect(computeAgeAtSeason("1998-09-02", 2025)).toBe(27); // birthday passed by Oct 1
    expect(computeAgeAtSeason("1998-12-20", 2025)).toBe(26); // birthday not yet reached
  });
  it("defaults when birthDate is missing/invalid", () => {
    expect(computeAgeAtSeason(null, 2025)).toBe(25);
    expect(computeAgeAtSeason("not-a-date", 2025)).toBe(25);
  });
});

describe("mergeCanonicalPlayers", () => {
  it("uses the target-season line when present", () => {
    const { players, report } = mergeCanonicalPlayers({
      targetSeason: 2025,
      bios: [bio("1", "Target Guy")],
      statSets: [
        { season: 2025, lines: [line("1", "Target Guy", 2025)] },
        { season: 2024, lines: [line("1", "Target Guy", 2024)] },
      ],
    });
    expect(report.fromTargetSeason).toBe(1);
    expect(report.fromFallbackSeason).toBe(0);
    expect(players[0].stat.season).toBe(2025);
  });

  it("falls back to a prior season for an injured-all-season player", () => {
    const { players, report } = mergeCanonicalPlayers({
      targetSeason: 2025,
      bios: [bio("2", "Hurt Star")],
      statSets: [
        { season: 2025, lines: [] }, // missed the whole target season
        { season: 2024, lines: [line("2", "Hurt Star", 2024)] },
      ],
    });
    expect(report.fromFallbackSeason).toBe(1);
    expect(players[0].stat.season).toBe(2024);
    expect(players[0].seedOverallRating).toBeGreaterThan(NO_STATS_DEFAULT_OVERALL);
  });

  it("assigns the no-stats default when no line exists in any season", () => {
    const { players, report } = mergeCanonicalPlayers({
      targetSeason: 2025,
      bios: [bio("3", "Two Way Player")],
      statSets: [{ season: 2025, lines: [] }],
    });
    expect(report.noStatDefault).toBe(1);
    expect(players[0].seedOverallRating).toBe(NO_STATS_DEFAULT_OVERALL);
    expect(players[0].stat.gamesPlayed).toBe(0);
  });

  it("applies a consensus override on top of the model rating", () => {
    const { players, report } = mergeCanonicalPlayers({
      targetSeason: 2025,
      bios: [bio("4", "Stephen Curry")],
      statSets: [{ season: 2025, lines: [line("4", "Stephen Curry", 2025)] }],
    });
    expect(players[0].overrideApplied).toBe(true);
    expect(players[0].seedOverallRating).toBe(93); // from ratingOverrides.json
    expect(report.overridesApplied).toBe(1);
    expect(report.overridesUnmatched).not.toContain(normalizePlayerName("Stephen Curry"));
  });

  it("flags duplicate normalized names for review", () => {
    const { report } = mergeCanonicalPlayers({
      targetSeason: 2025,
      bios: [bio("5", "John Smith"), bio("6", "John Smith")],
      statSets: [{ season: 2025, lines: [] }],
    });
    expect(report.duplicateNames).toContain(normalizePlayerName("John Smith"));
  });

  it("joins by exact provider id even when names would not match", () => {
    const { report } = mergeCanonicalPlayers({
      targetSeason: 2025,
      bios: [bio("7", "Display Name")],
      // Same id, different name spelling in the stat feed - id join still hits.
      statSets: [{ season: 2025, lines: [line("7", "Totally Different", 2025)] }],
    });
    expect(report.fromTargetSeason).toBe(1);
  });
});
