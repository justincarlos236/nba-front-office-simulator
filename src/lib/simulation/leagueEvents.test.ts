import { describe, expect, it } from "vitest";
import {
  rollForCpuSigning,
  rollForCpuTrade,
  rollForTeamInjury,
  shouldTriggerEvent,
  type CpuTeam,
} from "./leagueEvents";
import { ApronLevel } from "@/lib/cap/apron";

function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe("rollForTeamInjury", () => {
  const roster = [
    { leaguePlayerId: "p1", playerName: "Player One" },
    { leaguePlayerId: "p2", playerName: "Player Two" },
  ];

  it("returns null with an empty roster", () => {
    expect(rollForTeamInjury([], () => 0)).toBeNull();
  });

  it("returns null when the roll misses the chance threshold", () => {
    expect(rollForTeamInjury(roster, () => 0.99, 0.02)).toBeNull();
  });

  it("returns a day-to-day injury for a low tier roll", () => {
    // first call: chance roll (hit); second: player index pick; third: tier roll
    const result = rollForTeamInjury(roster, sequence([0.0, 0.0, 0.0, 0.0]), 0.02);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("DAY_TO_DAY");
    expect(result!.durationGames).toBeGreaterThanOrEqual(1);
    expect(result!.durationGames).toBeLessThanOrEqual(5);
    expect(result!.leaguePlayerId).toBe("p1");
  });

  it("returns an OUT-tier injury for a mid tier roll", () => {
    const result = rollForTeamInjury(roster, sequence([0.0, 0.0, 0.7, 0.0]), 0.02);
    expect(result!.severity).toBe("OUT");
    expect(result!.durationGames).toBeGreaterThanOrEqual(6);
    expect(result!.durationGames).toBeLessThanOrEqual(15);
  });

  it("returns a SEASON_ENDING-tier injury for a high tier roll", () => {
    const result = rollForTeamInjury(roster, sequence([0.0, 0.0, 0.95, 0.0]), 0.02);
    expect(result!.severity).toBe("SEASON_ENDING");
    expect(result!.durationGames).toBeGreaterThanOrEqual(16);
    expect(result!.durationGames).toBeLessThanOrEqual(30);
  });
});

describe("shouldTriggerEvent", () => {
  it("never triggers for zero games", () => {
    expect(shouldTriggerEvent(0, 0.5, () => 0)).toBe(false);
  });

  it("triggers when the roll beats the computed batch probability", () => {
    // P(at least one) over 50 games at 0.6% ~= 0.26 - a roll of 0 always beats it
    expect(shouldTriggerEvent(50, 0.006, () => 0)).toBe(true);
  });

  it("doesn't trigger when the roll exceeds the computed batch probability", () => {
    expect(shouldTriggerEvent(1, 0.006, () => 0.5)).toBe(false);
  });

  it("scales up with more games in the batch", () => {
    // A roll of 0.1 should fail a 1-game batch at 0.6% chance but succeed a 50-game batch
    expect(shouldTriggerEvent(1, 0.006, () => 0.1)).toBe(false);
    expect(shouldTriggerEvent(50, 0.006, () => 0.1)).toBe(true);
  });
});

describe("rollForCpuTrade", () => {
  const capState = {
    apronLevel: ApronLevel.UNDER_CAP,
    capSpaceCents: 50_000_000_00n,
    ownedFutureFirstRoundPickSeasons: [] as number[],
  };

  function makeTeam(id: string, ratings: number[]): CpuTeam {
    return {
      leagueTeamId: id,
      teamLabel: id,
      roster: ratings.map((rating, i) => ({
        leaguePlayerId: `${id}-p${i}`,
        playerName: `${id} Player ${i}`,
        rating,
        salaryCents: 5_000_000_00n,
        noTradeClause: false,
      })),
      capState,
    };
  }

  it("returns null with fewer than two teams", () => {
    expect(rollForCpuTrade([makeTeam("A", [80])], 2024, () => 0)).toBeNull();
  });

  it("returns null when every player has a no-trade clause", () => {
    const teamA = makeTeam("A", [80]);
    teamA.roster[0].noTradeClause = true;
    const teamB = makeTeam("B", [75]);
    teamB.roster[0].noTradeClause = true;
    expect(rollForCpuTrade([teamA, teamB], 2024, () => 0.4, 3)).toBeNull();
  });

  it("finds a legal swap between two teams with matching bench salaries", () => {
    const teamA = makeTeam("A", [90, 70, 65]);
    const teamB = makeTeam("B", [88, 68, 60]);
    const result = rollForCpuTrade([teamA, teamB], 2024, sequence([0, 0.9, 0, 0.1]), 5);
    expect(result).not.toBeNull();
    expect([teamA.leagueTeamId, teamB.leagueTeamId]).toContain(result!.teamA.leagueTeamId);
    expect(result!.teamA.leagueTeamId).not.toBe(result!.teamB.leagueTeamId);
  });

  it("never proposes the same team trading with itself", () => {
    const teamA = makeTeam("A", [80, 70]);
    const teamB = makeTeam("B", [78, 68]);
    // Force both index rolls toward the same team - the function must still
    // resolve to two distinct teams.
    const result = rollForCpuTrade([teamA, teamB], 2024, sequence([0, 0, 0, 0]), 5);
    if (result) {
      expect(result.teamA.leagueTeamId).not.toBe(result.teamB.leagueTeamId);
    }
  });
});

describe("rollForCpuSigning", () => {
  it("returns null with no CPU teams or no free agents", () => {
    expect(rollForCpuSigning([], ["fa1"], () => 0)).toBeNull();
    expect(rollForCpuSigning(["teamA"], [], () => 0)).toBeNull();
  });

  it("picks a team and free agent deterministically from a fixed rng", () => {
    const result = rollForCpuSigning(["teamA", "teamB"], ["fa1", "fa2"], () => 0);
    expect(result).toEqual({ leagueTeamId: "teamA", leaguePlayerId: "fa1" });
  });
});
