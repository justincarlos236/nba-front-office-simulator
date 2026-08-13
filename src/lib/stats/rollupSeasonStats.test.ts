import { describe, expect, it } from "vitest";
import { computeCareerHighs, type StatLine } from "./milestones";

/**
 * The rollup's correctness claim is that a season's box scores can be replaced
 * by per-season aggregates without changing anything a player's profile
 * displays. The database round-trip belongs to an integration test; what is
 * checkable here - and what the claim actually rests on - is the arithmetic:
 * career highs must survive being computed from per-season maxima instead of
 * from every individual game.
 *
 * This is the regression guard. It fails if `computeCareerHighs` ever stops
 * maxing categories independently, which is the property that makes the rollup
 * lossless rather than approximate.
 */

const line = (points: number, rebounds: number, assists: number, steals = 0, blocks = 0): StatLine => ({
  points,
  rebounds,
  assists,
  steals,
  blocks,
});

/** What `rollupSeasonStats` stores for one season: a max per category. */
function seasonMaxima(games: StatLine[]): StatLine {
  return computeCareerHighs(games)!;
}

describe("season rollup preserves career highs", () => {
  it("gives the same career highs from per-season maxima as from every game", () => {
    const seasonOne = [line(31, 4, 9), line(12, 11, 3), line(28, 7, 2)];
    const seasonTwo = [line(19, 6, 14), line(44, 3, 5), line(22, 13, 1)];
    const seasonThree = [line(25, 9, 7), line(17, 4, 4)];

    const fromEveryGame = computeCareerHighs([...seasonOne, ...seasonTwo, ...seasonThree]);
    const fromRollups = computeCareerHighs([seasonOne, seasonTwo, seasonThree].map(seasonMaxima));

    expect(fromRollups).toEqual(fromEveryGame);
    expect(fromRollups).toEqual({ points: 44, rebounds: 13, assists: 14, steals: 0, blocks: 0 });
  });

  it("still matches when each category's best game is a different game", () => {
    // The case that would break a rollup storing a single "best line" rather
    // than a max per category: no one game holds more than one high.
    const season = [line(50, 2, 1), line(8, 20, 3), line(11, 5, 15), line(9, 4, 2, 7, 1)];

    expect(computeCareerHighs([seasonMaxima(season)])).toEqual(computeCareerHighs(season));
    expect(seasonMaxima(season)).toEqual({
      points: 50,
      rebounds: 20,
      assists: 15,
      steals: 7,
      blocks: 1,
    });
  });

  it("is unchanged when a rolled-up season is combined with a raw one", () => {
    // The live shape: completed seasons arrive as maxima, the season in
    // progress as individual games.
    const completed = [line(33, 8, 6), line(21, 12, 4)];
    const inProgress = [line(29, 5, 11), line(14, 9, 2)];

    expect(computeCareerHighs([seasonMaxima(completed), ...inProgress])).toEqual(
      computeCareerHighs([...completed, ...inProgress]),
    );
  });

  it("reports no career highs for a player who has never played", () => {
    expect(computeCareerHighs([])).toBeNull();
  });
});
