import { describe, expect, it } from "vitest";
import {
  rollForCpuSigning,
  rollForCpuTrade,
  rollEventCount,
  rollForCpuOfferToUser,
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
    // The PG was a 78. With the trade-value curve fitted to a real market
    // (docs/TRADE_AUDIT.md, T-P0-3) an eight-point rating gap is far too large
    // for team B to agree to, so the swap never happened and this test could no
    // longer observe *which* player was targeted. At equal ratings the
    // need-fit bonus is exactly what tips it - which is the thing under test.
    const teamB = makeTeam("B", [
      { rating: 70, position: "PG" },
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
        // 64 -> 65 after the pricing curve was refit
        // (docs/SALARY_SYSTEM_AUDIT.md P0-1). Contract surplus is priced
        // through `ageAdjustedMarketValueCents`, which shares
        // `scoreToCapFraction`, so the refit moved what B would take for its
        // 34-year-old. The seeker still has to have something B actually
        // wants, and at 64 it no longer did.
        { rating: 65, age: 27 },
        { rating: 58, age: 26 },
      ],
      { identity: "CONTENDER", personality: "WIN_NOW" },
    );
    const rebuildingSeeker = makeTeam(
      "A2",
      // The 65-year-old-26 became a 66 aged 22: the age curve now applies to
      // the money rather than being compressed through a logistic, so a 26- and
      // a 22-year-old are further apart and B2 would not part with its
      // 22-year-old for the older piece. The seeker still has to have something
      // the pool's owner actually wants.
      [
        { rating: 70, age: 27 },
        { rating: 66, age: 28 },
        { rating: 66, age: 22 },
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

  const futureFirst = (teamId: string, season: number) => ({
    draftPickId: `${teamId}-first-${season}`,
    season,
    round: 1 as const,
    originalTeamCompetitivenessPercentile: 0.2,
    label: `${season} 1st Round Pick`,
  });

  it("attaches a pick to close a deal the player alone could not", () => {
    // A clearly worse player for a clearly better one. Nothing about the two
    // rosters alone can make this mutual - only real capital can.
    const seeker = makeTeam("A", [{ rating: 78 }, { rating: 70 }, { rating: 62 }], {
      identity: "CONTENDER",
      personality: "WIN_NOW",
    });
    const holder = makeTeam("B", [{ rating: 82 }, { rating: 74 }, { rating: 66 }], {
      identity: "REBUILDING",
      personality: "PROSPECT_LOVER",
    });

    const withoutPicks = rollForCpuTrade([seeker, holder], 2024, () => 0, 20);
    const withPicks = rollForCpuTrade(
      [
        {
          ...seeker,
          tradeablePicks: [2026, 2027, 2028].map((s) => futureFirst("A", s)),
          capState: {
            ...seeker.capState,
            ownedFutureFirstRoundPickSeasons: [2026, 2027, 2028],
          },
        },
        holder,
      ],
      2024,
      () => 0,
      20,
    );

    // The pick is what changed - so if the bare version already fired, this
    // fixture proves nothing and should be re-anchored rather than trusted.
    expect(withoutPicks).toBeNull();
    expect(withPicks).not.toBeNull();
    expect(withPicks!.pickFromTeamA).toBeDefined();
  });

  it("will not attach a first the Stepien rule forbids moving", () => {
    const seeker = makeTeam("A", [{ rating: 78 }, { rating: 70 }, { rating: 62 }], {
      identity: "CONTENDER",
      personality: "WIN_NOW",
    });
    const holder = makeTeam("B", [{ rating: 82 }, { rating: 74 }, { rating: 66 }], {
      identity: "REBUILDING",
      personality: "PROSPECT_LOVER",
    });
    const result = rollForCpuTrade(
      [
        {
          ...seeker,
          // A single future first. Moving it leaves no first in back-to-back
          // years, which validateTrade must refuse even though the trade is
          // otherwise agreeable to both sides.
          tradeablePicks: [futureFirst("A", 2026)],
          capState: { ...seeker.capState, ownedFutureFirstRoundPickSeasons: [2026] },
        },
        holder,
      ],
      2024,
      () => 0,
      20,
    );
    expect(result).toBeNull();
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

describe("rollForCpuOfferToUser", () => {
  const capState = {
    apronLevel: ApronLevel.UNDER_CAP,
    capSpaceCents: 50_000_000_00n,
    ownedFutureFirstRoundPickSeasons: [] as number[],
  };

  function team(
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

  const roster = [{ rating: 78 }, { rating: 74 }, { rating: 70 }, { rating: 66 }];

  it("returns null when there are no CPU teams", () => {
    expect(rollForCpuOfferToUser([], team("USER", roster), 2024, () => 0.4)).toBeNull();
  });

  it("returns null when the user has no roster to want from", () => {
    expect(
      rollForCpuOfferToUser([team("A", roster)], team("USER", []), 2024, () => 0.4),
    ).toBeNull();
  });

  it("returns null when every user player is untouchable", () => {
    const untouchable = roster.map((p) => ({ ...p, noTradeClause: true }));
    expect(
      rollForCpuOfferToUser([team("A", roster)], team("USER", untouchable), 2024, () => 0.4, 3),
    ).toBeNull();
  });

  it("always proposes between the CPU club and the user, in both directions", () => {
    const offer = rollForCpuOfferToUser([team("A", roster)], team("USER", roster), 2024, () => 0.4);
    if (!offer) return; // the roll may legitimately decline; shape is asserted when it fires
    expect(offer.fromTeam.leagueTeamId).toBe("A");
    // The club gives up one of its own and asks for one of the user's.
    expect(offer.offering.leaguePlayerId.startsWith("A-")).toBe(true);
    expect(offer.wanting.leaguePlayerId.startsWith("USER-")).toBe(true);
  });

  it("never asks for a player the user cannot trade", () => {
    const mixed = [
      { rating: 82, noTradeClause: true },
      { rating: 74 },
      { rating: 70 },
      { rating: 66 },
    ];
    for (const seed of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const offer = rollForCpuOfferToUser(
        [team("A", roster)],
        team("USER", mixed),
        2024,
        () => seed,
      );
      if (offer) expect(offer.wanting.leaguePlayerId).not.toBe("USER-p0");
    }
  });

  it("is deterministic for a given seed", () => {
    const run = () =>
      rollForCpuOfferToUser([team("A", roster)], team("USER", roster), 2024, () => 0.4);
    expect(run()).toEqual(run());
  });

  it("reports the proposing club's own score, not the user's", () => {
    // The offer carries why the CPU wants it. Whether it is good for the user
    // is deliberately not decided here - that is what the user is being asked.
    const offer = rollForCpuOfferToUser([team("A", roster)], team("USER", roster), 2024, () => 0.4);
    if (offer) expect(typeof offer.proposerScore).toBe("number");
  });
});

describe("rollEventCount", () => {
  function seeded(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("does not depend on how the games are batched", () => {
    // THE REGRESSION THIS EXISTS FOR. `shouldTriggerEvent` collapsed a whole
    // batch into one boolean, so league activity was a function of CHUNK_SIZE
    // rather than the calendar - a season simulated in one batch produced one
    // trade, the same season in 25 batches produced up to 25.
    // 1250 rather than a real 1230-game season only because it divides evenly
    // by the chunk size - comparing 1230 whole against 25 chunks of 50 would
    // be comparing 1230 games to 1250.
    const CHANCE = 0.03;
    const GAMES = 1250;
    const CHUNK = 50;
    const whole = rollEventCount(GAMES, CHANCE, seeded(7));
    const rng = seeded(7);
    let chunked = 0;
    for (let i = 0; i < GAMES / CHUNK; i += 1) chunked += rollEventCount(CHUNK, CHANCE, rng);
    expect(chunked).toBe(whole);
  });

  it("scales with the number of games", () => {
    const rng = seeded(3);
    const few = rollEventCount(50, 0.03, rng);
    const many = rollEventCount(1000, 0.03, rng);
    expect(many).toBeGreaterThan(few);
  });

  it("lands near the expected count over a season", () => {
    // 1230 games at 3% should average ~37 opportunities.
    const rng = seeded(99);
    const runs = Array.from({ length: 20 }, () => rollEventCount(1230, 0.03, rng));
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThan(28);
    expect(mean).toBeLessThan(48);
  });

  it("returns zero for a degenerate batch", () => {
    expect(rollEventCount(0, 0.5, seeded(1))).toBe(0);
    expect(rollEventCount(100, 0, seeded(1))).toBe(0);
  });
});
