import { describe, expect, it } from "vitest";
import { condenseWire, rankNews, scoreStory, type RankableStory } from "./storyRank";

const MY_TEAM = "team-mine";

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
    ...over,
  };
}

describe("scoreStory", () => {
  it("ranks a bigger story above a routine one at the same recency", () => {
    const trade = story({ type: "TRADE", importance: "MAJOR" });
    const morale = story({ type: "PLAYER_MORALE", importance: "STANDARD" });
    expect(scoreStory(trade, 0, null)).toBeGreaterThan(scoreStory(morale, 0, null));
  });

  /** The failure the redesign exists to fix: recency alone owning the page. */
  it("keeps an older major trade above a run of fresh morale notes", () => {
    const trade = story({ type: "TRADE", importance: "MAJOR" });
    const morale = story({ type: "PLAYER_MORALE", importance: "STANDARD" });
    // The trade filed 30 rows ago; the morale note filed this second.
    expect(scoreStory(trade, 30, null)).toBeGreaterThan(scoreStory(morale, 0, null));
  });

  it("never lets routine traffic outrank a breaking story", () => {
    const breaking = story({ type: "TRADE", importance: "BREAKING" });
    const fresh = story({ type: "TRADE", importance: "STANDARD" });
    expect(scoreStory(breaking, 60, null)).toBeGreaterThan(scoreStory(fresh, 0, null));
  });

  it("weights the user's own franchise above the identical story elsewhere", () => {
    const mine = story({ type: "TRADE", importance: "MAJOR", teamIds: [MY_TEAM] });
    const theirs = story({ type: "TRADE", importance: "MAJOR", teamIds: ["other"] });
    expect(scoreStory(mine, 0, MY_TEAM)).toBeGreaterThan(scoreStory(theirs, 0, MY_TEAM));
  });

  it("decays with recency so the page does not go stale", () => {
    const s = story({ type: "TRADE", importance: "MAJOR" });
    expect(scoreStory(s, 0, null)).toBeGreaterThan(scoreStory(s, 80, null));
  });
});

describe("rankNews", () => {
  it("promotes nothing when the week is genuinely quiet", () => {
    const quiet = Array.from({ length: 20 }, () =>
      story({ type: "PLAYER_MORALE", importance: "MINOR" }),
    );
    const ranked = rankNews(quiet, { userTeamId: null });
    // An empty lead is honest. Padding it would make routine noise look like news.
    expect(ranked.lead).toBeNull();
    expect(ranked.topStories).toHaveLength(0);
  });

  it("leads with the biggest story rather than the newest", () => {
    const stories = [
      story({ type: "PLAYER_MORALE", importance: "STANDARD" }),
      story({ type: "PLAYER_MORALE", importance: "STANDARD" }),
      story({ id: "the-trade", type: "TRADE", importance: "BREAKING" }),
    ];
    expect(rankNews(stories, { userTeamId: null }).lead?.id).toBe("the-trade");
  });

  it("never repeats a promoted story in the franchise column", () => {
    const mine = story({
      id: "mine-big",
      type: "TRADE",
      importance: "BREAKING",
      teamIds: [MY_TEAM],
    });
    const alsoMine = story({ type: "INJURY", importance: "MINOR", teamIds: [MY_TEAM] });
    const ranked = rankNews([mine, alsoMine], { userTeamId: MY_TEAM });
    expect(ranked.lead?.id).toBe("mine-big");
    expect(ranked.franchise.map((s) => s.id)).not.toContain("mine-big");
  });

  it("keeps every row on the wire even after promoting some", () => {
    const stories = [
      story({ type: "TRADE", importance: "BREAKING" }),
      story({ type: "TRADE", importance: "MAJOR" }),
      story({ type: "PLAYER_MORALE", importance: "MINOR" }),
    ];
    // Promotion changes where the eye lands, not what the record contains.
    expect(rankNews(stories, { userTeamId: null }).wire).toHaveLength(3);
  });

  it("returns no franchise column when the user controls no team", () => {
    const stories = [story({ teamIds: ["someone"] })];
    expect(rankNews(stories, { userTeamId: null }).franchise).toEqual([]);
  });

  it("caps how much it promotes", () => {
    const many = Array.from({ length: 30 }, () => story({ type: "TRADE", importance: "BREAKING" }));
    const ranked = rankNews(many, { userTeamId: null, maxTopStories: 4 });
    expect(ranked.topStories).toHaveLength(4);
  });
});

describe("condenseWire", () => {
  it("collapses a run of repetitive routine rows into one entry", () => {
    const entries = condenseWire([
      story({ type: "PLAYER_MORALE" }),
      story({ type: "PLAYER_MORALE" }),
      story({ type: "PLAYER_MORALE" }),
      story({ type: "PLAYER_MORALE" }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("digest");
  });

  it("loses nothing it collapses", () => {
    const rows = Array.from({ length: 5 }, () => story({ type: "PLAYER_MORALE" }));
    const entries = condenseWire(rows);
    const held = entries.flatMap((e) => (e.kind === "digest" ? e.stories : [e.story]));
    expect(held.map((s) => s.id)).toEqual(rows.map((s) => s.id));
  });

  it("leaves a short run alone - a digest would cost more than it saves", () => {
    const entries = condenseWire([
      story({ type: "PLAYER_MORALE" }),
      story({ type: "PLAYER_MORALE" }),
    ]);
    expect(entries.every((e) => e.kind === "story")).toBe(true);
  });

  it("never condenses real news", () => {
    const entries = condenseWire([
      story({ type: "TRADE" }),
      story({ type: "TRADE" }),
      story({ type: "TRADE" }),
      story({ type: "TRADE" }),
    ]);
    expect(entries).toHaveLength(4);
  });

  it("does not reorder to group - chronology wins over tidiness", () => {
    const entries = condenseWire([
      story({ id: "m1", type: "PLAYER_MORALE" }),
      story({ id: "trade", type: "TRADE" }),
      story({ id: "m2", type: "PLAYER_MORALE" }),
    ]);
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.kind === "story")).toBe(true);
  });

  it("keeps a breaking story out of a digest even when its type is routine", () => {
    const entries = condenseWire([
      story({ type: "GAME_RESULT" }),
      story({ id: "huge", type: "GAME_RESULT", importance: "BREAKING" }),
      story({ type: "GAME_RESULT" }),
      story({ type: "GAME_RESULT" }),
    ]);
    const standalone = entries.filter((e) => e.kind === "story");
    expect(standalone.some((e) => e.kind === "story" && e.story.id === "huge")).toBe(true);
  });

  it("preserves order and count across a mixed feed", () => {
    const rows = [
      story({ type: "TRADE" }),
      story({ type: "PLAYER_MORALE" }),
      story({ type: "PLAYER_MORALE" }),
      story({ type: "PLAYER_MORALE" }),
      story({ type: "INJURY" }),
    ];
    const held = condenseWire(rows).flatMap((e) => (e.kind === "digest" ? e.stories : [e.story]));
    expect(held.map((s) => s.id)).toEqual(rows.map((s) => s.id));
  });
});
