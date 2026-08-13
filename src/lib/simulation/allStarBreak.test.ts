import { describe, expect, it } from "vitest";
import {
  allStarBreakStartDayIndex,
  decideAllStarBreak,
  type AllStarWeekendState,
} from "./allStarBreak";
import { allStarBreakDayRange } from "../calendar/seasonCalendar";

// The break is a real position on the calendar now, so it moves with the
// season - see `seasonCalendar.ts`. Pinned to one season here so the fixtures
// stay concrete.
const SEASON = 2026;

/**
 * The break is keyed off the schedule now, not the user's game count - see
 * `allStarBreak.ts`. `nextGameDayIndex` is the day of the league's next
 * unplayed regular-season game, and `null` means there are none left.
 */
const decide = (nextGameDayIndex: number | null, weekendState: AllStarWeekendState) =>
  decideAllStarBreak({ season: SEASON, nextGameDayIndex, weekendState });

const BEFORE = allStarBreakStartDayIndex(SEASON) - 1;
// No games are scheduled inside the break window, so the first game the loop
// can actually reach after the break is the day it ends plus one.
const AFTER = allStarBreakDayRange(SEASON).end + 1;

describe("the All-Star break", () => {
  it("does not interrupt the first half of the season", () => {
    expect(decide(1, null)).toBe("continue");
    expect(decide(BEFORE, null)).toBe("continue");
  });

  it("creates the weekend the moment the break is reached", () => {
    // The next unplayed game is on the far side of the break, which means
    // every pre-break game has been played.
    expect(decide(AFTER, null)).toBe("generate-and-pause");
  });

  it("stops without regenerating a weekend the user has not resolved", () => {
    expect(decide(AFTER, "PENDING")).toBe("pause");
    expect(decide(AFTER + 20, "PENDING")).toBe("pause");
  });

  /**
   * The regression. This returned "stop" for the entire back half of the
   * season, so a ten-game request quietly delivered whatever one 50-game
   * league-wide chunk happened to contain - about three.
   */
  it("stops blocking the season once the weekend is resolved", () => {
    expect(decide(AFTER, "RESOLVED")).toBe("continue");
    expect(decide(AFTER + 30, "RESOLVED")).toBe("continue");
  });

  it("treats every day in the back half the same way", () => {
    for (let day = AFTER; day <= 190; day += 1) {
      expect(decide(day, "RESOLVED"), `day ${day}`).toBe("continue");
    }
  });

  it("does not hold up a season that has no games left", () => {
    // Null means every game has been played. A finished season cannot still
    // have the break ahead of it, whatever the weekend's status says.
    expect(decide(null, null)).toBe("continue");
    expect(decide(null, "PENDING")).toBe("continue");
    expect(decide(null, "RESOLVED")).toBe("continue");
  });
});
