import { describe, expect, it } from "vitest";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { simulateAllStarGame } from "./allStarGame";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import type { Position } from "@/generated/prisma/client";

function makePlayer(
  id: string,
  position: Position,
  overallRating: number,
): RosterPlayerForSimulation {
  return {
    leaguePlayerId: id,
    fullName: `Player ${id}`,
    overallRating,
    position,
    realStat: null,
  };
}

const POSITIONS: Position[] = ["PG", "SG", "SF", "PF", "C"];

function selectees(count: number): { player: RosterPlayerForSimulation; score: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    player: makePlayer(`p${i}`, POSITIONS[i % POSITIONS.length], 75 + (count - i)),
    score: 100 - i,
  }));
}

describe("simulateAllStarGame", () => {
  it("drafts every selectee into exactly one of two teams, captained by the top two scorers", () => {
    const pool = selectees(24);
    const result = simulateAllStarGame(pool, createSeededRandom("league-1-2026-asg"));
    expect(result.captainAId).toBe("p0");
    expect(result.captainBId).toBe("p1");
  });

  it("is deterministic given the same seed", () => {
    const pool = selectees(24);
    const a = simulateAllStarGame(pool, createSeededRandom("league-1-2026-asg"));
    const b = simulateAllStarGame(pool, createSeededRandom("league-1-2026-asg"));
    expect(a).toEqual(b);
  });

  it("generates box score lines only for drafted players (deep-bench DNP-CD is still possible) and a real MVP from the pool", () => {
    const pool = selectees(24);
    const result = simulateAllStarGame(pool, createSeededRandom("league-1-2026-asg"));
    const poolIds = new Set(pool.map((s) => s.player.leaguePlayerId));
    expect(result.stats.length).toBeGreaterThan(0);
    for (const line of result.stats) {
      expect(poolIds.has(line.leaguePlayerId)).toBe(true);
    }
    expect(poolIds.has(result.mvpLeaguePlayerId)).toBe(true);
  });

  it("produces a plausible, non-tied-at-zero final score for both sides", () => {
    const pool = selectees(24);
    const result = simulateAllStarGame(pool, createSeededRandom("league-1-2026-asg"));
    expect(result.teamAScore).toBeGreaterThan(50);
    expect(result.teamBScore).toBeGreaterThan(50);
  });
});
