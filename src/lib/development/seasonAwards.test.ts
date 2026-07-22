import { describe, expect, it } from "vitest";
import {
  computeDefensivePlayerOfTheYear,
  computeMostImprovedPlayer,
  computeMVP,
  computeRookieOfTheYear,
  computeSixthManOfTheYear,
  type BenchSeasonSnapshot,
  type DefensiveSeasonSnapshot,
  type PlayerSeasonSnapshot,
} from "./seasonAwards";

function player(overrides: Partial<PlayerSeasonSnapshot>): PlayerSeasonSnapshot {
  return {
    leaguePlayerId: "p",
    overallRating: 70,
    previousRating: null,
    experience: 3,
    teamWinPct: 0.5,
    ...overrides,
  };
}

describe("computeMVP", () => {
  it("picks the highest-rated player on the best team", () => {
    const players = [
      player({ leaguePlayerId: "a", overallRating: 90, teamWinPct: 0.7 }),
      player({ leaguePlayerId: "b", overallRating: 85, teamWinPct: 0.9 }),
    ];
    const mvp = computeMVP(players);
    expect(mvp?.leaguePlayerId).toBe("a");
  });

  it("lets team success tip a close rating gap", () => {
    const players = [
      player({ leaguePlayerId: "a", overallRating: 80, teamWinPct: 0.2 }),
      player({ leaguePlayerId: "b", overallRating: 78, teamWinPct: 0.9 }),
    ];
    const mvp = computeMVP(players);
    expect(mvp?.leaguePlayerId).toBe("b");
  });

  it("never lets a bad-team benchwarmer beat a superstar on a bad team", () => {
    const players = [
      player({ leaguePlayerId: "star", overallRating: 95, teamWinPct: 0.1 }),
      player({ leaguePlayerId: "role", overallRating: 60, teamWinPct: 1.0 }),
    ];
    const mvp = computeMVP(players);
    expect(mvp?.leaguePlayerId).toBe("star");
  });

  it("returns null for an empty league", () => {
    expect(computeMVP([])).toBeNull();
  });
});

describe("computeRookieOfTheYear", () => {
  it("picks the highest-rated rookie, ignoring veterans", () => {
    const players = [
      player({ leaguePlayerId: "vet", overallRating: 99, experience: 10 }),
      player({ leaguePlayerId: "rookie-a", overallRating: 65, experience: 0 }),
      player({ leaguePlayerId: "rookie-b", overallRating: 72, experience: 0 }),
    ];
    expect(computeRookieOfTheYear(players)?.leaguePlayerId).toBe("rookie-b");
  });

  it("returns null when there are no rookies", () => {
    const players = [player({ experience: 5 }), player({ experience: 8 })];
    expect(computeRookieOfTheYear(players)).toBeNull();
  });
});

describe("computeMostImprovedPlayer", () => {
  it("picks the largest positive rating delta", () => {
    const players = [
      player({ leaguePlayerId: "a", overallRating: 80, previousRating: 75 }),
      player({ leaguePlayerId: "b", overallRating: 82, previousRating: 70 }),
    ];
    const mip = computeMostImprovedPlayer(players);
    expect(mip?.leaguePlayerId).toBe("b");
    expect(mip?.value).toBe(12);
  });

  it("ignores players with no prior rating on record", () => {
    const players = [player({ leaguePlayerId: "new-signing", previousRating: null })];
    expect(computeMostImprovedPlayer(players)).toBeNull();
  });

  it("returns null when nobody actually improved", () => {
    const players = [
      player({ overallRating: 70, previousRating: 75 }),
      player({ overallRating: 60, previousRating: 65 }),
    ];
    expect(computeMostImprovedPlayer(players)).toBeNull();
  });
});

function defender(overrides: Partial<DefensiveSeasonSnapshot>): DefensiveSeasonSnapshot {
  return {
    leaguePlayerId: "d",
    gamesPlayed: 40,
    minutesPerGame: 30,
    stealsPerGame: 1,
    blocksPerGame: 0.5,
    reboundsPerGame: 5,
    ...overrides,
  };
}

describe("computeDefensivePlayerOfTheYear", () => {
  it("picks the best per-36 defensive producer", () => {
    const players = [
      defender({ leaguePlayerId: "a", stealsPerGame: 1, blocksPerGame: 3, minutesPerGame: 32 }),
      defender({ leaguePlayerId: "b", stealsPerGame: 0.5, blocksPerGame: 0.5, minutesPerGame: 20 }),
    ];
    expect(computeDefensivePlayerOfTheYear(players)?.leaguePlayerId).toBe("a");
  });

  it("normalizes per-36 so a lower-minutes specialist can beat a high-minutes starter", () => {
    const players = [
      // Low minutes, but elite per-36 rim protection.
      defender({
        leaguePlayerId: "specialist",
        minutesPerGame: 18,
        blocksPerGame: 2.5,
        stealsPerGame: 1,
      }),
      // Heavy minutes, modest defensive stats.
      defender({
        leaguePlayerId: "starter",
        minutesPerGame: 34,
        blocksPerGame: 0.4,
        stealsPerGame: 0.8,
      }),
    ];
    expect(computeDefensivePlayerOfTheYear(players)?.leaguePlayerId).toBe("specialist");
  });

  it("excludes players below the games-played threshold", () => {
    const players = [
      defender({ leaguePlayerId: "small-sample", gamesPlayed: 3, blocksPerGame: 10 }),
    ];
    expect(computeDefensivePlayerOfTheYear(players)).toBeNull();
  });

  it("returns null for an empty league", () => {
    expect(computeDefensivePlayerOfTheYear([])).toBeNull();
  });
});

function benchPlayer(overrides: Partial<BenchSeasonSnapshot>): BenchSeasonSnapshot {
  return {
    leaguePlayerId: "b",
    gamesPlayed: 40,
    minutesPerGame: 22,
    pointsPerGame: 12,
    reboundsPerGame: 4,
    assistsPerGame: 2,
    stealsPerGame: 1,
    blocksPerGame: 0.3,
    turnoversPerGame: 1.5,
    trueShootingPct: 0.56,
    ...overrides,
  };
}

describe("computeSixthManOfTheYear", () => {
  it("picks the best-producing bench player", () => {
    const players = [
      benchPlayer({ leaguePlayerId: "a", pointsPerGame: 20, reboundsPerGame: 6 }),
      benchPlayer({ leaguePlayerId: "b", pointsPerGame: 10, reboundsPerGame: 3 }),
    ];
    expect(computeSixthManOfTheYear(players)?.leaguePlayerId).toBe("a");
  });

  it("excludes starter-level minutes even if production is strong", () => {
    const players = [
      benchPlayer({ leaguePlayerId: "starter", minutesPerGame: 34, pointsPerGame: 28 }),
      benchPlayer({ leaguePlayerId: "real-bench", minutesPerGame: 24, pointsPerGame: 15 }),
    ];
    expect(computeSixthManOfTheYear(players)?.leaguePlayerId).toBe("real-bench");
  });

  it("excludes players below the games-played threshold", () => {
    const players = [
      benchPlayer({ leaguePlayerId: "small-sample", gamesPlayed: 2, pointsPerGame: 30 }),
    ];
    expect(computeSixthManOfTheYear(players)).toBeNull();
  });

  it("returns null for an empty league", () => {
    expect(computeSixthManOfTheYear([])).toBeNull();
  });
});
