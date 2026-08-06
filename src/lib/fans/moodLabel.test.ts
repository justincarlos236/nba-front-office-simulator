import { describe, it, expect } from "vitest";
import { computeMoodLabel, trendDirection } from "./moodLabel";

describe("computeMoodLabel", () => {
  // The core design point (docs/FANS_PAGE_REDESIGN.md Part 3.1): the same
  // level reads differently depending on direction. Verify level alone
  // never determines the label.
  it("reads high happiness that's falling differently than high happiness that's flat", () => {
    const falling = computeMoodLabel({
      fanHappiness: 70,
      recentTrendDelta: -5,
      seasonOverSeasonDelta: -8,
    });
    const flat = computeMoodLabel({
      fanHappiness: 70,
      recentTrendDelta: 0,
      seasonOverSeasonDelta: 0,
    });
    expect(falling).not.toBe(flat);
  });

  it("reads low happiness that's recovering differently than low happiness that's still falling", () => {
    const recovering = computeMoodLabel({
      fanHappiness: 30,
      recentTrendDelta: 5,
      seasonOverSeasonDelta: null,
    });
    const stillFalling = computeMoodLabel({
      fanHappiness: 30,
      recentTrendDelta: -5,
      seasonOverSeasonDelta: null,
    });
    expect(recovering).not.toBe(stillFalling);
    expect(stillFalling).toBe("HOSTILE");
  });

  it("a very high, rising fanbase is EUPHORIC", () => {
    expect(
      computeMoodLabel({ fanHappiness: 90, recentTrendDelta: 5, seasonOverSeasonDelta: 5 }),
    ).toBe("EUPHORIC");
  });

  it("handles a null season-over-season delta (a franchise's first season) without throwing", () => {
    expect(() =>
      computeMoodLabel({ fanHappiness: 50, recentTrendDelta: 0, seasonOverSeasonDelta: null }),
    ).not.toThrow();
  });
});

describe("trendDirection", () => {
  it("classifies up/down/flat correctly", () => {
    expect(trendDirection(5)).toBe("UP");
    expect(trendDirection(-5)).toBe("DOWN");
    expect(trendDirection(0)).toBe("FLAT");
  });
});
