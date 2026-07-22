import { describe, expect, it } from "vitest";
import { describeGameResult, describeMilestoneGame, describeWinStreak } from "./describeGameEvents";

function ctx(
  overrides: Partial<Record<"points" | "rebounds" | "assists" | "steals" | "blocks", number>>,
) {
  return {
    playerName: "Test Player",
    teamLabel: "Test City Testers",
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    ...overrides,
  };
}

describe("describeMilestoneGame", () => {
  it("returns null for an unremarkable game", () => {
    expect(describeMilestoneGame(ctx({ points: 18, rebounds: 5, assists: 4 }))).toBeNull();
  });

  it("describes a standard 40-point game", () => {
    const event = describeMilestoneGame(ctx({ points: 42, rebounds: 4, assists: 3 }));
    expect(event?.importance).toBe("STANDARD");
    expect(event?.description).toContain("42 points");
  });

  it("escalates a 50-point game to MAJOR", () => {
    expect(describeMilestoneGame(ctx({ points: 51 }))?.importance).toBe("MAJOR");
  });

  it("escalates a 60-point game to BREAKING", () => {
    expect(describeMilestoneGame(ctx({ points: 61 }))?.importance).toBe("BREAKING");
  });

  it("describes a plain triple-double as STANDARD", () => {
    const event = describeMilestoneGame(ctx({ points: 15, rebounds: 11, assists: 10 }));
    expect(event?.importance).toBe("STANDARD");
    expect(event?.description).toContain("triple-double");
  });

  it("escalates a 40+ point triple-double to MAJOR", () => {
    const event = describeMilestoneGame(ctx({ points: 40, rebounds: 12, assists: 11 }));
    expect(event?.importance).toBe("MAJOR");
  });

  it("escalates a 50+ point triple-double to BREAKING", () => {
    expect(describeMilestoneGame(ctx({ points: 52, rebounds: 12, assists: 11 }))?.importance).toBe(
      "BREAKING",
    );
  });
});

describe("describeWinStreak", () => {
  it("fires only on the exact threshold, not every game past it", () => {
    expect(describeWinStreak("Team", 5)).not.toBeNull();
    expect(describeWinStreak("Team", 6)).toBeNull();
    expect(describeWinStreak("Team", 7)).toBeNull();
  });

  it("escalates importance at 10 and every 5 beyond it", () => {
    expect(describeWinStreak("Team", 10)?.importance).toBe("MAJOR");
    expect(describeWinStreak("Team", 12)).toBeNull();
    expect(describeWinStreak("Team", 15)?.importance).toBe("BREAKING");
    expect(describeWinStreak("Team", 20)?.importance).toBe("BREAKING");
  });

  it("also covers losing streaks", () => {
    expect(describeWinStreak("Team", -5)?.importance).toBe("STANDARD");
    expect(describeWinStreak("Team", -10)?.importance).toBe("MAJOR");
    expect(describeWinStreak("Team", -6)).toBeNull();
  });

  it("returns null for a streak that isn't at any threshold", () => {
    expect(describeWinStreak("Team", 3)).toBeNull();
    expect(describeWinStreak("Team", 0)).toBeNull();
  });
});

describe("describeGameResult", () => {
  it("returns null for an unremarkable, evenly-matched game", () => {
    expect(describeGameResult("Winners", "Losers", 0.55, 8)).toBeNull();
  });

  it("describes a standard underdog upset", () => {
    const event = describeGameResult("Underdogs", "Favorites", 0.2, 6);
    expect(event?.importance).toBe("STANDARD");
    expect(event?.description).toContain("upset");
  });

  it("escalates a huge upset to MAJOR", () => {
    expect(describeGameResult("Underdogs", "Favorites", 0.08, 4)?.importance).toBe("MAJOR");
  });

  it("describes a real blowout even without an upset", () => {
    const event = describeGameResult("Winners", "Losers", 0.6, 21);
    expect(event?.importance).toBe("STANDARD");
    expect(event?.description).toContain("blew out");
  });

  it("prioritizes the upset framing when both an upset and a big margin occur together", () => {
    const event = describeGameResult("Underdogs", "Favorites", 0.05, 22);
    expect(event?.description).toContain("upset");
  });
});
