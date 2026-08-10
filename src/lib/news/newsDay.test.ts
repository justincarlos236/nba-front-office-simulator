import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay } from "./newsDay";
import type { RankableStory } from "./storyRank";

let seq = 0;
function story(over: Partial<RankableStory> = {}): RankableStory {
  seq += 1;
  return {
    id: `s${seq}`,
    type: "GAME_RESULT",
    description: "something happened",
    importance: "STANDARD",
    season: 2025,
    teamIds: [],
    dayIndex: 10,
    ...over,
  };
}

describe("groupByDay", () => {
  it("files each day separately, newest first", () => {
    const days = groupByDay([
      story({ dayIndex: 12 }),
      story({ dayIndex: 12 }),
      story({ dayIndex: 11 }),
    ]);
    expect(days.map((d) => d.dayIndex)).toEqual([12, 11]);
  });

  it("splits a day into what led it and what merely happened", () => {
    const [day] = groupByDay([
      story({ id: "trade", type: "TRADE", importance: "MAJOR" }),
      story({ type: "INJURY", importance: "MINOR" }),
      story({ type: "INJURY", importance: "MINOR" }),
      story({ type: "PLAYER_MORALE", importance: "MINOR" }),
    ]);
    expect(day.headlines.map((s) => s.id)).toEqual(["trade"]);
    expect(day.rollups.map((r) => r.key).sort()).toEqual(["INJURIES", "MORALE"]);
  });

  it("keeps every story, headline or rolled up", () => {
    const rows = [
      story({ type: "TRADE", importance: "MAJOR" }),
      ...Array.from({ length: 9 }, () => story({ type: "PLAYER_MORALE", importance: "MINOR" })),
    ];
    const [day] = groupByDay(rows);
    const held = day.headlines.length + day.rollups.reduce((n, r) => n + r.stories.length, 0);
    expect(held).toBe(rows.length);
    expect(day.total).toBe(rows.length);
  });

  it("leads a day with a routine-type story when it is genuinely big", () => {
    // A 40-point night is a GAME_MILESTONE, normally rolled up - at MAJOR it
    // is the reason to read that day.
    const [day] = groupByDay([story({ id: "big", type: "GAME_MILESTONE", importance: "MAJOR" })]);
    expect(day.headlines.map((s) => s.id)).toEqual(["big"]);
  });

  it("leads with a trade even at standard importance", () => {
    const [day] = groupByDay([story({ id: "deal", type: "TRADE", importance: "STANDARD" })]);
    expect(day.headlines.map((s) => s.id)).toEqual(["deal"]);
  });

  it("never leads with a routine injury or an ordinary result", () => {
    const [day] = groupByDay([
      story({ type: "INJURY", importance: "MINOR" }),
      story({ type: "GAME_RESULT", importance: "STANDARD" }),
    ]);
    expect(day.headlines).toHaveLength(0);
  });

  it("orders rollups biggest-first so a day says what dominated it", () => {
    const [day] = groupByDay([
      story({ type: "ROTATION_CHANGE", importance: "MINOR" }),
      ...Array.from({ length: 6 }, () => story({ type: "PLAYER_MORALE", importance: "MINOR" })),
    ]);
    expect(day.rollups[0].key).toBe("MORALE");
  });

  it("keeps undated stories as their own group rather than guessing a day", () => {
    const days = groupByDay([story({ dayIndex: null }), story({ dayIndex: 4 })]);
    expect(days.map((d) => d.dayIndex)).toEqual([null, 4]);
  });

  it("does not merge the same day number across different seasons", () => {
    const days = groupByDay([
      story({ season: 2026, dayIndex: 3 }),
      story({ season: 2025, dayIndex: 3 }),
    ]);
    expect(days).toHaveLength(2);
  });
});

describe("dayLabel", () => {
  it("reads as a date in the basketball calendar", () => {
    expect(dayLabel(2025, 0)).toBe("Oct 22");
    expect(dayLabel(2025, 30)).toBe("Nov 21");
  });

  it("says so plainly when a story has no day", () => {
    expect(dayLabel(2025, null)).toBe("Undated");
  });
});
