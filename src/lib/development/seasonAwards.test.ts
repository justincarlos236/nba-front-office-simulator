import { describe, expect, it } from "vitest";
import {
  computeMostImprovedPlayer,
  computeMVP,
  computeRookieOfTheYear,
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
