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

  it("a high-quality Medical Staff reduces how often the chance roll hits", () => {
    // A roll just above the base 2% chance would normally miss anyway, but
    // this isolates the frequency scaling directly via a mid-range roll
    // that only a *higher* effective chance (poor medical staff) would hit.
    const rollValue = 0.021; // just above the unscaled 2% chance
    const uncoached = rollForTeamInjury(roster, sequence([rollValue]), 0.02, null);
    const poorMedical = rollForTeamInjury(roster, sequence([rollValue]), 0.02, 60);
    const greatMedical = rollForTeamInjury(roster, sequence([rollValue]), 0.02, 99);
    expect(uncoached).toBeNull();
    expect(poorMedical).not.toBeNull(); // higher effective chance clears this roll
    expect(greatMedical).toBeNull(); // lower effective chance still misses
  });

  it("a high-quality Medical Staff shortens injury duration", () => {
    const uncoached = rollForTeamInjury(roster, sequence([0.0, 0.0, 0.7, 0.99]), 0.02, null);
    const greatMedical = rollForTeamInjury(roster, sequence([0.0, 0.0, 0.7, 0.99]), 0.02, 99);
    expect(greatMedical!.durationGames).toBeLessThanOrEqual(uncoached!.durationGames);
  });

  it("premium medical investment reduces injury frequency (Franchise Finances)", () => {
    // Same isolation trick as the Medical Staff frequency test: a mid-range
    // roll that only a *higher* effective chance would clear.
    const rollValue = 0.021;
    const neutral = rollForTeamInjury(roster, sequence([rollValue]), 0.02, null, 0);
    const minimal = rollForTeamInjury(roster, sequence([rollValue]), 0.02, null, -6);
    const premium = rollForTeamInjury(roster, sequence([rollValue]), 0.02, null, 8);
    expect(neutral).toBeNull(); // 0.021 misses the unscaled 2% chance
    expect(minimal).not.toBeNull(); // minimal investment raises the effective chance
    expect(premium).toBeNull(); // premium investment lowers it further
  });

  it("a zero medical-investment delta behaves identically to omitting it", () => {
    const rollValue = 0.5;
    expect(rollForTeamInjury(roster, sequence([rollValue]), 0.02, 72)).toEqual(
      rollForTeamInjury(roster, sequence([rollValue]), 0.02, 72, 0),
    );
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

  function makeTeam(
    id: string,
    players: {
      rating: number;
      age?: number;
      position?: "PG" | "SG" | "SF" | "PF" | "C";
      noTradeClause?: boolean;
    }[],
    overrides: Partial<Pick<CpuTeam, "identity" | "needs" | "personality">> = {},
  ): CpuTeam {
    return {
      leagueTeamId: id,
      teamLabel: id,
      roster: players.map((p, i) => ({
        leaguePlayerId: `${id}-p${i}`,
        playerName: `${id} Player ${i}`,
        rating: p.rating,
        potentialRating: p.rating,
        age: p.age ?? 27,
        position: p.position ?? "SF",
        salaryCents: 5_000_000_00n,
        noTradeClause: p.noTradeClause ?? false,
        injuryStatus: "HEALTHY" as const,
        careerGamesMissedToInjury: 0,
      })),
      capState,
      identity: overrides.identity ?? "PLAY_IN_TEAM",
      needs: overrides.needs ?? [],
      personality: overrides.personality ?? "BALANCED",
    };
  }

  it("returns null with fewer than two teams", () => {
    expect(rollForCpuTrade([makeTeam("A", [{ rating: 80 }])], 2024, () => 0)).toBeNull();
  });

  it("returns null when every player has a no-trade clause", () => {
    const teamA = makeTeam("A", [{ rating: 80, noTradeClause: true }]);
    const teamB = makeTeam("B", [{ rating: 75, noTradeClause: true }]);
    expect(rollForCpuTrade([teamA, teamB], 2024, () => 0.4, 3)).toBeNull();
  });

  it("finds a mutually-agreeable, legal swap between two evenly-matched teams", () => {
    const teamA = makeTeam("A", [{ rating: 88 }, { rating: 75 }, { rating: 68 }]);
    const teamB = makeTeam("B", [{ rating: 88 }, { rating: 75 }, { rating: 68 }]);
    const result = rollForCpuTrade([teamA, teamB], 2024, () => 0, 5);
    expect(result).not.toBeNull();
    expect([teamA.leagueTeamId, teamB.leagueTeamId]).toContain(result!.teamA.leagueTeamId);
    expect(result!.teamA.leagueTeamId).not.toBe(result!.teamB.leagueTeamId);
  });

  it("never proposes the same team trading with itself", () => {
    const teamA = makeTeam("A", [{ rating: 80 }, { rating: 70 }]);
    const teamB = makeTeam("B", [{ rating: 78 }, { rating: 68 }]);
    // Force both index rolls toward the same team - the function must still
    // resolve to two distinct teams.
    const result = rollForCpuTrade([teamA, teamB], 2024, sequence([0, 0, 0, 0]), 5);
    if (result) {
      expect(result.teamA.leagueTeamId).not.toBe(result.teamB.leagueTeamId);
    }
  });

  it("targets a player who fills the seeking team's recognized need, not a random one", () => {
    const teamA = makeTeam(
      "A",
      [
        { rating: 80, position: "C" },
        { rating: 70, position: "SF" },
      ],
      {
        needs: ["POINT_GUARD"],
      },
    );
    const teamB = makeTeam("B", [
      { rating: 78, position: "PG" },
      { rating: 66, position: "SF" },
    ]);
    const result = rollForCpuTrade([teamA, teamB], 2024, () => 0, 5);
    expect(result).not.toBeNull();
    // Team A's own player, B-p0 (the recognized-need-filling PG), moves to A.
    expect(result!.teamB.player.leaguePlayerId).toBe("B-p0");
  });

  it("a WIN_NOW/CONTENDER seeker targets an older player and a REBUILDING/PROSPECT_LOVER seeker targets a younger one, from the same candidate pool", () => {
    const targetPool = [
      { rating: 65, age: 34 },
      { rating: 65, age: 22 },
    ];
    const winNowSeeker = makeTeam(
      "A",
      [
        { rating: 85, age: 29 },
        { rating: 80, age: 30 },
        { rating: 64, age: 27 },
        { rating: 58, age: 26 },
      ],
      { identity: "CONTENDER", personality: "WIN_NOW" },
    );
    const rebuildingSeeker = makeTeam(
      "A2",
      [
        { rating: 70, age: 27 },
        { rating: 66, age: 28 },
        { rating: 65, age: 26 },
        { rating: 55, age: 25 },
      ],
      { identity: "REBUILDING", personality: "PROSPECT_LOVER" },
    );

    const winNowResult = rollForCpuTrade(
      [winNowSeeker, makeTeam("B", targetPool)],
      2024,
      () => 0,
      5,
    );
    const rebuildingResult = rollForCpuTrade(
      [rebuildingSeeker, makeTeam("B2", targetPool)],
      2024,
      () => 0,
      5,
    );

    expect(winNowResult).not.toBeNull();
    expect(winNowResult!.teamB.player.age).toBe(34);
    expect(rebuildingResult).not.toBeNull();
    expect(rebuildingResult!.teamB.player.age).toBe(22);
  });

  it("never executes an objectively lopsided trade, even across many rng values", () => {
    const teamA = makeTeam("A", [{ rating: 65, age: 30 }], { needs: ["STAR_SCORER"] });
    const teamB = makeTeam("B", [{ rating: 96, age: 24 }], { identity: "CONTENDER" });
    for (const rngVal of [0, 0.1, 0.3, 0.5, 0.7, 0.9]) {
      const result = rollForCpuTrade(
        [teamA, teamB],
        2024,
        sequence([rngVal, rngVal, rngVal, rngVal]),
        5,
      );
      expect(
        result,
        `rng=${rngVal} should not execute a bench-guy-for-a-superstar trade`,
      ).toBeNull();
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
