import { describe, expect, it } from "vitest";
import { buildStoryCards } from "./storyCards";
import type { LeaguePulse } from "./leaguePulse";
import type { RankableStory } from "./storyRank";

let seq = 0;
const story = (over: Partial<RankableStory> = {}): RankableStory => ({
  id: `s${++seq}`,
  type: "GAME_RESULT",
  description: "something happened",
  importance: "STANDARD",
  season: 2025,
  teamIds: [],
  dayIndex: 5,
  ...over,
});

const emptyPulse: LeaguePulse = {
  hottest: null,
  coldest: null,
  best: null,
  keyInjury: null,
  injuredCount: 0,
};

describe("buildStoryCards", () => {
  it("emits nothing on a quiet stretch rather than empty placeholders", () => {
    const cards = buildStoryCards({
      stories: [story({ type: "PLAYER_MORALE", importance: "MINOR" })],
      pulse: emptyPulse,
      userTeamId: null,
    });
    expect(cards).toEqual([]);
  });

  it("builds a deal card from the biggest recent trade", () => {
    const cards = buildStoryCards({
      stories: [
        story({ id: "small", type: "TRADE", importance: "MINOR" }),
        story({ id: "big", type: "TRADE", importance: "MAJOR" }),
      ],
      pulse: emptyPulse,
      userTeamId: null,
    });
    expect(cards.map((c) => c.key)).toContain("big");
    expect(cards.find((c) => c.key === "big")?.kicker).toBe("Deal");
  });

  it("holds performance and injury cards to a high bar", () => {
    const cards = buildStoryCards({
      stories: [
        story({ type: "GAME_MILESTONE", importance: "STANDARD" }),
        story({ type: "INJURY", importance: "STANDARD" }),
      ],
      pulse: emptyPulse,
      userTeamId: null,
    });
    // Ordinary ones belong in the feed, not in a card.
    expect(cards).toHaveLength(0);
  });

  it("never repeats the lead story", () => {
    const lead = story({ id: "lead", type: "TRADE", importance: "BREAKING" });
    const cards = buildStoryCards({
      stories: [lead],
      pulse: emptyPulse,
      userTeamId: null,
      excludeIds: new Set(["lead"]),
    });
    expect(cards.map((c) => c.key)).not.toContain("lead");
  });

  it("never uses the same story for two cards", () => {
    const cards = buildStoryCards({
      stories: [story({ id: "one", type: "TRADE", importance: "MAJOR", teamIds: ["mine"] })],
      pulse: emptyPulse,
      userTeamId: "mine",
    });
    expect(cards.map((c) => c.key)).toEqual(["one"]);
  });

  it("builds hot and cold cards from standings state, not from news", () => {
    const cards = buildStoryCards({
      stories: [],
      pulse: {
        ...emptyPulse,
        hottest: { leagueTeamId: "h", label: "Lakers", wins: 15, losses: 3, currentStreak: 9 },
        coldest: { leagueTeamId: "c", label: "Wizards", wins: 3, losses: 15, currentStreak: -7 },
      },
      userTeamId: null,
    });
    expect(cards.map((c) => c.kicker)).toEqual(["Hot", "Cold"]);
    expect(cards[0].detail).toBe("Won 9 straight · 15-3");
    expect(cards[1].detail).toBe("Lost 7 straight · 3-15");
  });

  it("marks the user's own franchise on a card", () => {
    const cards = buildStoryCards({
      stories: [story({ type: "TRADE", importance: "MAJOR", teamIds: ["mine"] })],
      pulse: emptyPulse,
      userTeamId: "mine",
    });
    expect(cards[0].isMine).toBe(true);
  });

  it("gives the user's franchise a card only when nothing of theirs is already shown", () => {
    const cards = buildStoryCards({
      stories: [
        story({ id: "their-trade", type: "TRADE", importance: "MAJOR", teamIds: ["other"] }),
        story({ id: "mine", type: "SIGNING", importance: "STANDARD", teamIds: ["mine"] }),
      ],
      pulse: emptyPulse,
      userTeamId: "mine",
    });
    const franchise = cards.find((c) => c.kicker === "Your franchise");
    expect(franchise?.key).toBe("mine");
  });

  it("respects the card cap", () => {
    const cards = buildStoryCards({
      stories: [
        story({ type: "TRADE", importance: "MAJOR" }),
        story({ type: "GAME_MILESTONE", importance: "MAJOR" }),
        story({ type: "INJURY", importance: "MAJOR" }),
        story({ type: "AWARD", importance: "MAJOR" }),
      ],
      pulse: {
        ...emptyPulse,
        hottest: { leagueTeamId: "h", label: "A", wins: 9, losses: 1, currentStreak: 6 },
        coldest: { leagueTeamId: "c", label: "B", wins: 1, losses: 9, currentStreak: -6 },
      },
      userTeamId: null,
      max: 4,
    });
    expect(cards).toHaveLength(4);
  });
});
