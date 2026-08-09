import { describe, expect, it } from "vitest";
import {
  computeActionCenterItems,
  ACTION_CENTER_DISPLAY_LIMIT,
  type ActionCenterInput,
  type ActionCenterRosterPlayer,
} from "./actionCenter";

function player(overrides: Partial<ActionCenterRosterPlayer> = {}): ActionCenterRosterPlayer {
  const fullName = overrides.fullName ?? "Player One";
  return {
    fullName,
    overallRating: 75,
    injuryStatus: "HEALTHY",
    contractEndSeason: null,
    morale: 70,
    tradeRequestActive: false,
    rotation: {
      leaguePlayerId: fullName,
      fullName,
      overallRating: 75,
      position: "SF",
      realStat: null,
      rotationSlot: null,
      targetMinutesPerGame: null,
    },
    ...overrides,
  };
}

function baseInput(overrides: Partial<ActionCenterInput> = {}): ActionCenterInput {
  return {
    leagueId: "league-1",
    currentSeason: 2023,
    phase: "regular-season",
    ownerConfidence: 65,
    pendingTradeOffer: null,
    payrollReductionTargetCents: null,
    payrollDirectiveSeason: null,
    totalSalaryCents: 100_000_000n,
    capSpaceCents: 0n,
    simpleCapStatus: "OVER_CAP",
    teamNeeds: [],
    pendingPlayoffGame: null,
    noGamesPlayedThisSeasonYet: false,
    allStarWeekendPending: false,
    pendingDraftLottery: false,
    yourPickIsUp: false,
    roster: [
      player({
        rotation: {
          leaguePlayerId: "p1",
          fullName: "Player One",
          overallRating: 75,
          position: "SF",
          realStat: null,
          rotationSlot: 0,
          targetMinutesPerGame: 30,
        },
      }),
    ],
    staffVacancies: [],
    pendingBusinessDecisions: null,
    ...overrides,
  };
}

describe("computeActionCenterItems", () => {
  it("returns nothing when the league is in a fully unremarkable state", () => {
    expect(computeActionCenterItems(baseInput())).toEqual([]);
  });

  it("surfaces a pending playoff game", () => {
    const items = computeActionCenterItems(
      baseInput({
        pendingPlayoffGame: { seriesId: "s1", gameNumber: 3, opponentLabel: "Miami Heat" },
      }),
    );
    expect(items[0].id).toBe("pending-playoff-game");
    expect(items[0].href).toBe("/leagues/league-1/playoffs/live/s1");
    expect(items[0].label).toContain("Miami Heat");
  });

  it("surfaces a pending All-Star Weekend", () => {
    const items = computeActionCenterItems(baseInput({ allStarWeekendPending: true }));
    expect(items.map((i) => i.id)).toContain("all-star-weekend-pending");
  });

  it("surfaces the pre-draft scouting window, pointing at the Draft page (not straight at the lottery)", () => {
    // Scouting Pillar Redesign (Phase 2) - the class is revealed before the
    // lottery on purpose, so this item routes to scouting, not past it.
    const items = computeActionCenterItems(baseInput({ pendingDraftLottery: true }));
    const item = items.find((i) => i.id === "pending-draft-lottery");
    expect(item?.href).toBe("/leagues/league-1/draft");
  });

  it("surfaces when the user's own pick is up, with a league-scoped href", () => {
    const items = computeActionCenterItems(baseInput({ yourPickIsUp: true }));
    const item = items.find((i) => i.id === "your-pick-is-up");
    expect(item?.href).toBe("/leagues/league-1/draft");
  });

  it("surfaces a pending business decision as critical when it's BREAKING", () => {
    const items = computeActionCenterItems(
      baseInput({
        pendingBusinessDecisions: { count: 1, earliestDeadlineDays: 2, hasBreaking: true },
      }),
    );
    const item = items.find((i) => i.id === "pending-business-decisions");
    expect(item?.severity).toBe("critical");
    expect(item?.href).toBe("/leagues/league-1/finances/inbox");
  });

  it("surfaces a pending business decision as info when there's real runway", () => {
    const items = computeActionCenterItems(
      baseInput({
        pendingBusinessDecisions: { count: 2, earliestDeadlineDays: 10, hasBreaking: false },
      }),
    );
    const item = items.find((i) => i.id === "pending-business-decisions");
    expect(item?.severity).toBe("info");
  });

  it.each(["HOT_SEAT", "CRITICAL"] as const)(
    "surfaces job security at %s but not at STABLE",
    () => {
      const hot = computeActionCenterItems(baseInput({ ownerConfidence: 20 }));
      expect(hot.map((i) => i.id)).toContain("job-security-critical");
      const stable = computeActionCenterItems(baseInput({ ownerConfidence: 65 }));
      expect(stable.map((i) => i.id)).not.toContain("job-security-critical");
    },
  );

  it("surfaces ready-to-advance only when phase is ready", () => {
    expect(computeActionCenterItems(baseInput({ phase: "ready" })).map((i) => i.id)).toContain(
      "ready-to-advance",
    );
    expect(
      computeActionCenterItems(baseInput({ phase: "draft-incomplete" })).map((i) => i.id),
    ).not.toContain("ready-to-advance");
  });

  it("surfaces an unmet payroll directive but not a met one", () => {
    const unmet = computeActionCenterItems(
      baseInput({
        payrollReductionTargetCents: 100_000_000n,
        payrollDirectiveSeason: 2023,
        totalSalaryCents: 120_000_000n,
      }),
    );
    expect(unmet.map((i) => i.id)).toContain("payroll-directive-unmet");

    const met = computeActionCenterItems(
      baseInput({
        payrollReductionTargetCents: 100_000_000n,
        payrollDirectiveSeason: 2023,
        totalSalaryCents: 80_000_000n,
      }),
    );
    expect(met.map((i) => i.id)).not.toContain("payroll-directive-unmet");
  });

  describe("rotation", () => {
    it("flags an OUT player still occupying a rotation slot", () => {
      const roster = [
        player({
          fullName: "Hurt Guy",
          injuryStatus: "OUT",
          rotation: {
            leaguePlayerId: "p1",
            fullName: "Hurt Guy",
            overallRating: 80,
            position: "PG",
            realStat: null,
            rotationSlot: 0,
            targetMinutesPerGame: 32,
          },
        }),
      ];
      const items = computeActionCenterItems(baseInput({ roster }));
      expect(items[0].id).toBe("rotation-injured-starter");
      expect(items[0].label).toContain("Hurt Guy");
    });

    it("does not flag a DAY_TO_DAY player", () => {
      const roster = [
        player({
          injuryStatus: "DAY_TO_DAY",
          rotation: {
            leaguePlayerId: "p1",
            fullName: "Player One",
            overallRating: 80,
            position: "PG",
            realStat: null,
            rotationSlot: 0,
            targetMinutesPerGame: 32,
          },
        }),
      ];
      expect(computeActionCenterItems(baseInput({ roster })).map((i) => i.id)).not.toContain(
        "rotation-injured-starter",
      );
    });

    it("flags never having set a rotation, when nobody is hurt", () => {
      const untouched = [player()]; // helper defaults to rotationSlot: null
      const items = computeActionCenterItems(baseInput({ roster: untouched }));
      expect(items.map((i) => i.id)).toContain("rotation-never-set");
    });
  });

  describe("expiring key player", () => {
    it("flags a STARTER-tier player whose contract expires this season", () => {
      const roster = [player({ fullName: "Star Guy", overallRating: 78, contractEndSeason: 2023 })];
      const items = computeActionCenterItems(baseInput({ roster }));
      expect(items.map((i) => i.id)).toContain("expiring-key-player");
      expect(items.find((i) => i.id === "expiring-key-player")!.label).toContain("Star Guy");
    });

    it("does not flag a MINIMUM-tier player or a different season", () => {
      const bench = [player({ overallRating: 60, contractEndSeason: 2023 })];
      expect(computeActionCenterItems(baseInput({ roster: bench })).map((i) => i.id)).not.toContain(
        "expiring-key-player",
      );

      const laterExpiry = [player({ overallRating: 78, contractEndSeason: 2024 })];
      expect(
        computeActionCenterItems(baseInput({ roster: laterExpiry })).map((i) => i.id),
      ).not.toContain("expiring-key-player");
    });
  });

  describe("staff vacancies", () => {
    it("flags a Head Coach vacancy at warning severity", () => {
      const items = computeActionCenterItems(baseInput({ staffVacancies: ["HEAD_COACH"] }));
      const item = items.find((i) => i.id === "staff-vacancy");
      expect(item?.severity).toBe("warning");
      expect(item?.label).toContain("Head Coach");
    });

    it("flags a non-coach vacancy at info severity", () => {
      const items = computeActionCenterItems(baseInput({ staffVacancies: ["MEDICAL_STAFF"] }));
      expect(items.find((i) => i.id === "staff-vacancy")?.severity).toBe("info");
    });
  });

  describe("cap space + need", () => {
    it("surfaces when there's meaningful cap space and a real need", () => {
      const items = computeActionCenterItems(
        baseInput({
          simpleCapStatus: "UNDER_CAP",
          capSpaceCents: 10_000_000_00n,
          teamNeeds: ["POINT_GUARD"],
        }),
      );
      expect(items.map((i) => i.id)).toContain("cap-space-and-need");
    });

    it("does not surface without a real need, without enough space, or when not under the cap", () => {
      expect(
        computeActionCenterItems(
          baseInput({ simpleCapStatus: "UNDER_CAP", capSpaceCents: 10_000_000_00n, teamNeeds: [] }),
        ).map((i) => i.id),
      ).not.toContain("cap-space-and-need");

      expect(
        computeActionCenterItems(
          baseInput({
            simpleCapStatus: "UNDER_CAP",
            capSpaceCents: 1_000_00n,
            teamNeeds: ["POINT_GUARD"],
          }),
        ).map((i) => i.id),
      ).not.toContain("cap-space-and-need");

      expect(
        computeActionCenterItems(
          baseInput({
            simpleCapStatus: "OVER_CAP",
            capSpaceCents: 10_000_000_00n,
            teamNeeds: ["POINT_GUARD"],
          }),
        ).map((i) => i.id),
      ).not.toContain("cap-space-and-need");
    });
  });

  it("orders items by fixed priority when several apply at once", () => {
    const items = computeActionCenterItems(
      baseInput({
        pendingPlayoffGame: { seriesId: "s1", gameNumber: 1, opponentLabel: "Miami Heat" },
        allStarWeekendPending: true,
        ownerConfidence: 10,
      }),
    );
    expect(items.map((i) => i.id)).toEqual([
      "pending-playoff-game",
      "all-star-weekend-pending",
      "job-security-critical",
    ]);
  });

  it("exposes a display limit of 3 for the UI to slice with", () => {
    expect(ACTION_CENTER_DISPLAY_LIMIT).toBe(3);
  });

  it("every item carries reasoning and a consequence for the 'Why is this recommended?' disclosure", () => {
    const items = computeActionCenterItems(
      baseInput({
        pendingPlayoffGame: { seriesId: "s1", gameNumber: 1, opponentLabel: "Miami Heat" },
      }),
    );
    for (const item of items) {
      expect(item.reasoning, `${item.id} is missing reasoning`).toBeTruthy();
      expect(item.consequence, `${item.id} is missing a consequence`).toBeTruthy();
    }
  });

  describe("first-session welcome", () => {
    it("surfaces when the regular season is underway but no game has been played yet", () => {
      const items = computeActionCenterItems(
        baseInput({ phase: "regular-season", noGamesPlayedThisSeasonYet: true }),
      );
      const item = items.find((i) => i.id === "first-games-not-simulated");
      expect(item).toBeDefined();
      expect(item?.href).toBe("/leagues/league-1/standings");
    });

    it("does not surface once a game has been played", () => {
      const items = computeActionCenterItems(
        baseInput({ phase: "regular-season", noGamesPlayedThisSeasonYet: false }),
      );
      expect(items.map((i) => i.id)).not.toContain("first-games-not-simulated");
    });

    it("does not surface outside the regular season, even with no games played this season", () => {
      const items = computeActionCenterItems(
        baseInput({ phase: "ready", noGamesPlayedThisSeasonYet: true }),
      );
      expect(items.map((i) => i.id)).not.toContain("first-games-not-simulated");
    });
  });

  it("Player Morale & Personality System: surfaces a critical item for a player demanding a trade, linking to the Trade Builder", () => {
    const items = computeActionCenterItems(
      baseInput({ roster: [player({ fullName: "Unhappy Guy", tradeRequestActive: true })] }),
    );
    const item = items.find((i) => i.id === "player-demanding-trade");
    expect(item?.severity).toBe("critical");
    expect(item?.label).toContain("Unhappy Guy");
    expect(item?.href).toBe("/leagues/league-1/trades/new");
  });

  it("Player Morale & Personality System: surfaces a warning for a trending-disgruntled player, linking to the morale guide, but not both at once", () => {
    const trendingItems = computeActionCenterItems(
      baseInput({
        roster: [player({ fullName: "Grumpy Guy", morale: 15, tradeRequestActive: false })],
      }),
    );
    expect(trendingItems.map((i) => i.id)).toContain("player-trending-unhappy");
    expect(trendingItems.map((i) => i.id)).not.toContain("player-demanding-trade");
    const item = trendingItems.find((i) => i.id === "player-trending-unhappy");
    expect(item?.href).toBe("/guide/roster#morale");

    const bothItems = computeActionCenterItems(
      baseInput({
        roster: [
          player({ fullName: "Demanding Guy", tradeRequestActive: true }),
          player({ fullName: "Grumpy Guy", morale: 15, tradeRequestActive: false }),
        ],
      }),
    );
    expect(bothItems.map((i) => i.id)).toContain("player-demanding-trade");
    expect(bothItems.map((i) => i.id)).not.toContain("player-trending-unhappy");
  });

  it("Player Morale & Personality System: content players never surface a morale item", () => {
    const items = computeActionCenterItems(baseInput({ roster: [player({ morale: 70 })] }));
    expect(items.map((i) => i.id)).not.toContain("player-demanding-trade");
    expect(items.map((i) => i.id)).not.toContain("player-trending-unhappy");
  });
});
