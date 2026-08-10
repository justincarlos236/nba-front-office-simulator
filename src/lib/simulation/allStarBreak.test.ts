import { describe, expect, it } from "vitest";
import {
  ALL_STAR_BREAK_GAMES_PLAYED,
  decideAllStarBreak,
  type AllStarWeekendState,
} from "./allStarBreak";

const decide = (userGamesPlayed: number, weekendState: AllStarWeekendState) =>
  decideAllStarBreak({ userGamesPlayed, weekendState });

describe("the All-Star break", () => {
  it("does not interrupt the first half of the season", () => {
    expect(decide(0, null)).toBe("continue");
    expect(decide(ALL_STAR_BREAK_GAMES_PLAYED - 1, null)).toBe("continue");
  });

  it("creates the weekend the moment the break is reached", () => {
    expect(decide(ALL_STAR_BREAK_GAMES_PLAYED, null)).toBe("generate-and-pause");
  });

  it("stops without regenerating a weekend the user has not resolved", () => {
    expect(decide(ALL_STAR_BREAK_GAMES_PLAYED, "PENDING")).toBe("pause");
    expect(decide(60, "PENDING")).toBe("pause");
  });

  /**
   * The regression. This returned "stop" for every game from 41 to 82, so a
   * ten-game request quietly delivered whatever one 50-game league-wide chunk
   * happened to contain - about three.
   */
  it("stops blocking the season once the weekend is resolved", () => {
    expect(decide(ALL_STAR_BREAK_GAMES_PLAYED, "RESOLVED")).toBe("continue");
    expect(decide(47, "RESOLVED")).toBe("continue");
    expect(decide(81, "RESOLVED")).toBe("continue");
  });

  it("treats every game in the back half the same way", () => {
    for (let played = ALL_STAR_BREAK_GAMES_PLAYED; played <= 82; played += 1) {
      expect(decide(played, "RESOLVED"), `game ${played}`).toBe("continue");
    }
  });
});
