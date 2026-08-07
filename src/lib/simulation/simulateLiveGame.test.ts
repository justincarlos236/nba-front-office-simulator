import { describe, expect, it } from "vitest";
import { computeHomeWinProbability } from "./simulateGame";
import {
  simulateQuarter,
  simulateLiveGame,
  allocatePlayerStatsAcrossPeriods,
} from "./simulateLiveGame";
import type { PlayerBoxScoreLine } from "./boxScore";

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("simulateQuarter", () => {
  it("produces a plausible single-quarter score for both teams", () => {
    const q = simulateQuarter(75, 75, 0, 0, () => 0.5);
    expect(q.home).toBeGreaterThan(0);
    expect(q.away).toBeGreaterThan(0);
    // Roughly a real quarter's worth of scoring, not a whole-game total.
    expect(q.home).toBeLessThan(60);
    expect(q.away).toBeLessThan(60);
  });

  it("favors the stronger team's quarter score on average", () => {
    const strongRng = sequence([0.5, 0.5]);
    const strongQuarter = simulateQuarter(90, 60, 0, 0, strongRng);
    expect(strongQuarter.home).toBeGreaterThan(strongQuarter.away);
  });
});

describe("simulateLiveGame", () => {
  it("returns exactly 4 regulation quarters", () => {
    const result = simulateLiveGame(75, 75, 0, 0, () => 0.5);
    expect(result.quarters).toHaveLength(4);
  });

  it("the final score is exactly the sum of all played periods", () => {
    const result = simulateLiveGame(80, 70, 0, 0, Math.random);
    const summedHome =
      result.quarters.reduce((s, q) => s + q.home, 0) +
      result.overtimes.reduce((s, q) => s + q.home, 0);
    const summedAway =
      result.quarters.reduce((s, q) => s + q.away, 0) +
      result.overtimes.reduce((s, q) => s + q.away, 0);
    expect(result.finalHomeScore).toBe(summedHome);
    expect(result.finalAwayScore).toBe(summedAway);
  });

  it("homeWon is consistent with the final score", () => {
    const result = simulateLiveGame(80, 70, 0, 0, Math.random);
    expect(result.homeWon).toBe(result.finalHomeScore > result.finalAwayScore);
  });

  it("goes to overtime only when regulation is tied, and never ends tied", () => {
    for (let i = 0; i < 50; i++) {
      const result = simulateLiveGame(75, 75, 0, 0, Math.random);
      const regulationHome = result.quarters.reduce((s, q) => s + q.home, 0);
      const regulationAway = result.quarters.reduce((s, q) => s + q.away, 0);
      if (result.overtimes.length === 0) {
        expect(regulationHome).not.toBe(regulationAway);
      } else {
        expect(regulationHome).toBe(regulationAway);
      }
      expect(result.finalHomeScore).not.toBe(result.finalAwayScore);
    }
  });

  it("a heavy favorite wins the large majority of games at a realistic strength gap", () => {
    let wins = 0;
    const trials = 500;
    for (let i = 0; i < trials; i++) {
      const result = simulateLiveGame(90, 60, 0, 0, Math.random);
      if (result.homeWon) wins++;
    }
    expect(wins / trials).toBeGreaterThan(0.85);
  });

  describe("calibration against computeHomeWinProbability", () => {
    // Empirical regression check (not a hand-derived formula): summing 4
    // independent quarters must track the single-shot win-probability
    // model within a small tolerance across a spread of realistic
    // strength differentials, or team strength would quietly matter more
    // or less in live playoff games than everywhere else in the app.
    const TRIALS = 4000;
    const TOLERANCE = 0.06;

    it.each([-25, -15, -10, -5, 0, 5, 10, 15, 25])(
      "tracks computeHomeWinProbability within tolerance at strength diff %d",
      (diff) => {
        const homeStrength = 75 + diff / 2;
        const awayStrength = 75 - diff / 2;
        const predicted = computeHomeWinProbability(homeStrength, awayStrength, 0, 0);

        let wins = 0;
        for (let i = 0; i < TRIALS; i++) {
          if (simulateLiveGame(homeStrength, awayStrength, 0, 0, Math.random).homeWon) wins++;
        }
        const actual = wins / TRIALS;
        expect(Math.abs(actual - predicted)).toBeLessThan(TOLERANCE);
      },
    );
  });

  it("is deterministic given the same seeded rng", () => {
    const a = simulateLiveGame(80, 70, 0, 0, sequence([0.3, 0.4, 0.5, 0.6, 0.2, 0.7, 0.1, 0.8]));
    const b = simulateLiveGame(80, 70, 0, 0, sequence([0.3, 0.4, 0.5, 0.6, 0.2, 0.7, 0.1, 0.8]));
    expect(a).toEqual(b);
  });
});

describe("allocatePlayerStatsAcrossPeriods", () => {
  function player(
    overrides: Partial<PlayerBoxScoreLine> & { leagueTeamId: string },
  ): PlayerBoxScoreLine {
    return {
      leaguePlayerId: overrides.leaguePlayerId ?? "p1",
      minutesPlayed: 30,
      points: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fgMade: 0,
      fgAttempted: 0,
      fg3Made: 0,
      fg3Attempted: 0,
      ftMade: 0,
      ftAttempted: 0,
      ...overrides,
    };
  }

  it("every period's per-player stats sum back to the exact authoritative final total", () => {
    const boxScore = [
      player({
        leaguePlayerId: "home-star",
        leagueTeamId: "HOME",
        points: 37,
        rebounds: 8,
        assists: 5,
      }),
      player({
        leaguePlayerId: "home-role",
        leagueTeamId: "HOME",
        points: 11,
        rebounds: 4,
        assists: 2,
      }),
      player({
        leaguePlayerId: "away-star",
        leagueTeamId: "AWAY",
        points: 29,
        rebounds: 10,
        assists: 7,
      }),
    ];
    const periods = [
      { home: 30, away: 20 },
      { home: 25, away: 28 },
      { home: 20, away: 15 },
      { home: 33, away: 25 },
    ];
    const perPeriod = allocatePlayerStatsAcrossPeriods(boxScore, periods, "HOME");

    expect(perPeriod).toHaveLength(4);
    for (const player of boxScore) {
      const summed = perPeriod.reduce(
        (sum, period) =>
          sum + period.find((p) => p.leaguePlayerId === player.leaguePlayerId)!.points,
        0,
      );
      expect(summed).toBe(player.points);
    }
  });

  it("each period's summed player points match that period's real team score", () => {
    const boxScore = [
      player({ leaguePlayerId: "h1", leagueTeamId: "HOME", points: 22 }),
      player({ leaguePlayerId: "h2", leagueTeamId: "HOME", points: 18 }),
      player({ leaguePlayerId: "a1", leagueTeamId: "AWAY", points: 40 }),
    ];
    const periods = [
      { home: 12, away: 25 },
      { home: 10, away: 8 },
      { home: 9, away: 4 },
      { home: 9, away: 3 },
    ];
    const perPeriod = allocatePlayerStatsAcrossPeriods(boxScore, periods, "HOME");

    periods.forEach((period, i) => {
      const homeSum = perPeriod[i]
        .filter((p) => ["h1", "h2"].includes(p.leaguePlayerId))
        .reduce((sum, p) => sum + p.points, 0);
      const awaySum = perPeriod[i]
        .filter((p) => p.leaguePlayerId === "a1")
        .reduce((sum, p) => sum + p.points, 0);
      expect(homeSum).toBe(period.home);
      expect(awaySum).toBe(period.away);
    });
  });

  it("handles a player with zero of a stat without dividing by zero", () => {
    const boxScore = [player({ leaguePlayerId: "p1", leagueTeamId: "HOME", points: 0, blocks: 0 })];
    const periods = [
      { home: 0, away: 0 },
      { home: 0, away: 0 },
    ];
    expect(() => allocatePlayerStatsAcrossPeriods(boxScore, periods, "HOME")).not.toThrow();
  });
});
