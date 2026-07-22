import { describe, expect, it } from "vitest";
import { selectRisingStars, type RisingStarsCandidate } from "./risingStars";

const SEASON = 2026;

let counter = 0;
function candidate(overrides: Partial<RisingStarsCandidate>): RisingStarsCandidate {
  counter += 1;
  return {
    leaguePlayerId: `p${counter}`,
    draftYear: SEASON, // rookie by default
    gamesPlayed: 25,
    minutesPerGame: 28,
    pointsPerGame: 14,
    reboundsPerGame: 4,
    assistsPerGame: 3,
    stealsPerGame: 1,
    blocksPerGame: 0.4,
    turnoversPerGame: 1.5,
    trueShootingPct: 0.55,
    ...overrides,
  };
}

describe("selectRisingStars", () => {
  it("includes rookies and second-year players, excludes third-year players", () => {
    const rookie = candidate({ leaguePlayerId: "rookie", draftYear: SEASON });
    const sophomore = candidate({ leaguePlayerId: "sophomore", draftYear: SEASON - 1 });
    const veteran = candidate({
      leaguePlayerId: "veteran",
      draftYear: SEASON - 2,
      pointsPerGame: 40,
    });
    const filler = Array.from({ length: 20 }, () => candidate({}));

    const { selections } = selectRisingStars([rookie, sophomore, veteran, ...filler], SEASON);
    const ids = selections.map((s) => s.leaguePlayerId);
    expect(ids).toContain("rookie");
    expect(ids).toContain("sophomore");
    expect(ids).not.toContain("veteran");
  });

  it("excludes players below the games-played eligibility floor", () => {
    const smallSample = candidate({
      leaguePlayerId: "small-sample",
      gamesPlayed: 2,
      pointsPerGame: 40,
    });
    const filler = Array.from({ length: 20 }, () => candidate({}));
    const { selections } = selectRisingStars([smallSample, ...filler], SEASON);
    expect(selections.map((s) => s.leaguePlayerId)).not.toContain("small-sample");
  });

  it("selects the top 14 eligible players by performance score", () => {
    const stars = Array.from({ length: 14 }, (_, i) =>
      candidate({ leaguePlayerId: `star-${i}`, pointsPerGame: 25 + i }),
    );
    const filler = Array.from({ length: 10 }, () => candidate({ pointsPerGame: 8 }));
    const { selections } = selectRisingStars([...stars, ...filler], SEASON);
    expect(selections).toHaveLength(14);
    for (const star of stars) {
      expect(selections.map((s) => s.leaguePlayerId)).toContain(star.leaguePlayerId);
    }
  });

  it("drafts every selection into exactly one of two teams, captained by the top scorers", () => {
    const stars = Array.from({ length: 14 }, (_, i) =>
      candidate({ leaguePlayerId: `star-${i}`, pointsPerGame: 20 + i }),
    );
    const result = selectRisingStars(stars, SEASON);
    const allDrafted = [...result.teamA, ...result.teamB];
    expect(new Set(allDrafted).size).toBe(result.selections.length);
    expect(allDrafted).toHaveLength(result.selections.length);
    expect(result.captainAId).toBe("star-13");
    expect(result.captainBId).toBe("star-12");
  });

  it("does not crash and returns null captains when fewer than 2 players are eligible", () => {
    const lone = candidate({ leaguePlayerId: "lone-rookie" });
    const result = selectRisingStars([lone], SEASON);
    expect(result.selections).toHaveLength(1);
    expect(result.captainAId).toBeNull();
    expect(result.captainBId).toBeNull();
    expect(result.teamA).toHaveLength(0);
    expect(result.teamB).toHaveLength(0);
  });
});
