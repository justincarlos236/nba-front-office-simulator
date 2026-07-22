import { describe, expect, it } from "vitest";
import { selectAllStars, type PlayerSeasonPerformanceSnapshot } from "./selection";

let counter = 0;
function player(
  overrides: Partial<PlayerSeasonPerformanceSnapshot>,
): PlayerSeasonPerformanceSnapshot {
  counter += 1;
  return {
    leaguePlayerId: `p${counter}`,
    position: "PG",
    conference: "EAST",
    overallRating: 72,
    gamesPlayed: 30,
    minutesPerGame: 30,
    pointsPerGame: 15,
    reboundsPerGame: 5,
    assistsPerGame: 3,
    stealsPerGame: 1,
    blocksPerGame: 0.5,
    turnoversPerGame: 1.5,
    trueShootingPct: 0.56,
    teamWinPct: 0.5,
    isHealthy: true,
    ...overrides,
  };
}

describe("selectAllStars", () => {
  it("excludes an elite-rated player having a poor season, includes a lower-rated breakout player", () => {
    const eliteButBad = player({
      leaguePlayerId: "elite-bad",
      overallRating: 95,
      pointsPerGame: 8,
      reboundsPerGame: 2,
      assistsPerGame: 1,
      trueShootingPct: 0.45,
    });
    const breakout = player({
      leaguePlayerId: "breakout",
      overallRating: 68,
      pointsPerGame: 26,
      reboundsPerGame: 8,
      assistsPerGame: 7,
      trueShootingPct: 0.62,
    });
    // Fill out the rest of the eligible pool with mediocre players so both
    // real candidates are ranked against a realistic field.
    const filler = Array.from({ length: 20 }, () => player({ position: "PG" }));

    const { selections } = selectAllStars([eliteButBad, breakout, ...filler]);
    const selectedIds = selections.map((s) => s.leaguePlayerId);
    expect(selectedIds).toContain("breakout");
    expect(selectedIds).not.toContain("elite-bad");
  });

  it("excludes players below the games-played eligibility floor", () => {
    const smallSample = player({
      leaguePlayerId: "small-sample",
      gamesPlayed: 5,
      pointsPerGame: 40,
    });
    const filler = Array.from({ length: 20 }, () => player({ position: "PG" }));
    const { selections } = selectAllStars([smallSample, ...filler]);
    expect(selections.map((s) => s.leaguePlayerId)).not.toContain("small-sample");
  });

  it("selects starters respecting guard/frontcourt position slots", () => {
    const guards = Array.from({ length: 5 }, (_, i) =>
      player({
        leaguePlayerId: `guard-${i}`,
        position: i % 2 === 0 ? "PG" : "SG",
        pointsPerGame: 20 + i,
      }),
    );
    const bigs = Array.from({ length: 5 }, (_, i) =>
      player({ leaguePlayerId: `big-${i}`, position: "C", pointsPerGame: 20 + i }),
    );
    const { selections } = selectAllStars([...guards, ...bigs]);
    const starters = selections.filter((s) => s.role === "STARTER" && s.conference === "EAST");
    const starterGuards = starters.filter((s) => s.positionGroup === "GUARD");
    const starterFrontcourt = starters.filter((s) => s.positionGroup === "FRONTCOURT");
    expect(starterGuards).toHaveLength(2);
    expect(starterFrontcourt).toHaveLength(3);
  });

  it("replaces an injured selection with the next-best eligible alternate at the same position", () => {
    // One clear-cut star at PG, injured, plus enough depth for a replacement.
    const injuredStar = player({
      leaguePlayerId: "injured-star",
      position: "PG",
      pointsPerGame: 30,
      isHealthy: false,
    });
    const depth = Array.from({ length: 10 }, (_, i) =>
      player({ leaguePlayerId: `depth-${i}`, position: "PG", pointsPerGame: 15 + i }),
    );
    const { selections } = selectAllStars([injuredStar, ...depth]);
    const injuredEntry = selections.find((s) => s.leaguePlayerId === "injured-star");
    const replacement = selections.find((s) => s.role === "INJURY_REPLACEMENT");
    expect(injuredEntry).toBeDefined(); // still honored, not removed
    expect(replacement).toBeDefined();
    expect(replacement?.leaguePlayerId).not.toBe("injured-star");
  });

  it("reports snubs as the top non-selected players by pure performance, not persisted as selections", () => {
    // 9 clear locks (2 starter guard slots + 7 reserve slots), a snub who
    // just misses the cut but clearly outranks the rest of the unselected
    // pool, and low-stat filler well below everyone else.
    const locks = Array.from({ length: 9 }, (_, i) =>
      player({ leaguePlayerId: `lock-${i}`, pointsPerGame: 40 + i }),
    );
    const snubCandidate = player({ leaguePlayerId: "snub", pointsPerGame: 28 });
    const filler = Array.from({ length: 15 }, () => player({ pointsPerGame: 10 }));
    const { selections, snubs } = selectAllStars([...locks, snubCandidate, ...filler]);
    expect(selections.map((s) => s.leaguePlayerId)).not.toContain("snub");
    expect(snubs.some((s) => s.leaguePlayerId === "snub")).toBe(true);
  });
});
