/**
 * The wire, filed by day instead of as one undifferentiated column.
 *
 * A day of simulated basketball produces a handful of things worth reading
 * and a long tail of things worth *having*: four injuries, six morale ticks,
 * five ordinary results. Presented as equal rows they bury the handful. This
 * splits each day into the stories that lead it and rollups that hold the
 * rest, so a day costs a few lines whether it generated eight events or
 * eighty - and nothing is thrown away.
 *
 * Day comes from `LeagueTransaction.dayIndex`, added for exactly this. It is
 * null for anything with no game day (offseason moves, the draft, finance
 * reports) and for every row written before the column existed, so an
 * undated group is a real and permanent case, not a migration artifact.
 */

import type { RankableStory } from "./storyRank";

/**
 * Which stories lead their day rather than folding into a rollup.
 *
 * Importance is the primary gate because the engine already derives it from
 * real context - injury duration, player tier, streak length, upset
 * probability - so this reads a signal rather than inventing one.
 */
const ALWAYS_HEADLINE = new Set(["MAJOR", "BREAKING"]);

/**
 * Types newsworthy enough to lead a day even at STANDARD. A trade is a roster
 * change a reader wants to see happen; a STANDARD injury or ordinary win is
 * the day's texture.
 */
const HEADLINE_AT_STANDARD = new Set([
  "TRADE",
  "SIGNING",
  "RETIREMENT",
  "AWARD",
  "DRAFT_LOTTERY",
  "DRAFT_SELECTION",
  "ALL_STAR_RESULT",
  "OWNERSHIP_MESSAGE",
  "STAFF_FIRE",
]);

/** How the tail of a day is bundled. Several types can share one rollup. */
const ROLLUP_OF: Record<string, string> = {
  INJURY: "INJURIES",
  PLAYER_MORALE: "MORALE",
  ROTATION_CHANGE: "ROTATION",
  GAME_RESULT: "GAMES",
  WIN_STREAK: "STREAKS",
  GAME_MILESTONE: "MILESTONES",
  FINANCIAL_REPORT: "FINANCES",
  FRANCHISE_MILESTONE: "FINANCES",
  BUSINESS_DECISION: "FINANCES",
  ALL_STAR_SELECTION: "ALL_STAR",
  ALL_STAR_SNUB: "ALL_STAR",
  STAFF_HIRE: "STAFF",
};

export const ROLLUP_LABEL: Record<string, string> = {
  INJURIES: "Injuries",
  MORALE: "Morale updates",
  ROTATION: "Rotation moves",
  GAMES: "Other games",
  STREAKS: "Streaks",
  MILESTONES: "Milestones",
  FINANCES: "Business",
  ALL_STAR: "All-Star",
  STAFF: "Staff",
  OTHER: "Other",
};

export interface DayRollup {
  key: string;
  stories: RankableStory[];
}

export interface NewsDay {
  season: number;
  /** Null for stories with no game day - the offseason, the draft, old rows. */
  dayIndex: number | null;
  /** What led the day, in the order it filed. */
  headlines: RankableStory[];
  /** Everything else, bundled by category. */
  rollups: DayRollup[];
  /** Total stories filed that day, headlines included. */
  total: number;
}

function leadsTheDay(story: RankableStory): boolean {
  if (ALWAYS_HEADLINE.has(story.importance)) return true;
  return story.importance === "STANDARD" && HEADLINE_AT_STANDARD.has(story.type);
}

/**
 * Groups stories into days, newest first, splitting each into headlines and
 * rollups. Input is expected newest-first; order within a day is preserved.
 */
export function groupByDay(stories: RankableStory[]): NewsDay[] {
  const days = new Map<string, RankableStory[]>();
  const order: string[] = [];

  for (const story of stories) {
    const key = `${story.season}:${story.dayIndex ?? "none"}`;
    if (!days.has(key)) {
      days.set(key, []);
      order.push(key);
    }
    days.get(key)!.push(story);
  }

  return order.map((key) => {
    const group = days.get(key)!;
    const headlines: RankableStory[] = [];
    const rollupMap = new Map<string, RankableStory[]>();

    for (const story of group) {
      if (leadsTheDay(story)) {
        headlines.push(story);
        continue;
      }
      const rollupKey = ROLLUP_OF[story.type] ?? "OTHER";
      const list = rollupMap.get(rollupKey) ?? [];
      list.push(story);
      rollupMap.set(rollupKey, list);
    }

    return {
      season: group[0].season,
      dayIndex: group[0].dayIndex ?? null,
      headlines,
      // Biggest bundle first: a day with twelve morale ticks should say so
      // before it mentions the one rotation change.
      rollups: [...rollupMap.entries()]
        .map(([k, s]) => ({ key: k, stories: s }))
        .sort((a, b) => b.stories.length - a.stories.length),
      total: group.length,
    };
  });
}

/**
 * A season runs late October to mid-April. `dayIndex` is a day offset from
 * the opener, so this is a readable label rather than a real calendar date -
 * the simulation has no real dates and inventing one would be fake precision
 * of a different kind. Deliberately month + day only, no year.
 */
const SEASON_START_MONTH = 9; // October, zero-indexed
const SEASON_START_DAY = 22;

export function dayLabel(season: number, dayIndex: number | null): string {
  if (dayIndex === null) return "Undated";
  const date = new Date(Date.UTC(season, SEASON_START_MONTH, SEASON_START_DAY + dayIndex));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
