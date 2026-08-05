import { describe, it, expect } from "vitest";
import {
  fanSentimentTheme,
  summarizeByTheme,
  topContributors,
  buildInSeasonTrend,
  recentTrendDelta,
  type LedgerEvent,
} from "./sentimentLedger";

function event(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    id: "e1",
    season: 2025,
    dayIndex: 0,
    kind: "TRADE",
    delta: 0,
    description: "test event",
    leaguePlayerId: null,
    ...overrides,
  };
}

describe("fanSentimentTheme", () => {
  it("groups trades and roster moves under FRONT_OFFICE", () => {
    expect(fanSentimentTheme("TRADE")).toBe("FRONT_OFFICE");
    expect(fanSentimentTheme("SIGNING")).toBe("FRONT_OFFICE");
    expect(fanSentimentTheme("ICON_DEPARTURE")).toBe("FRONT_OFFICE");
  });

  it("groups on-court results under ON_THE_COURT", () => {
    expect(fanSentimentTheme("WIN_STREAK")).toBe("ON_THE_COURT");
    expect(fanSentimentTheme("AWARD")).toBe("ON_THE_COURT");
    expect(fanSentimentTheme("SEASON_RESULT")).toBe("ON_THE_COURT");
  });

  it("groups pricing/financing under THE_BUSINESS", () => {
    expect(fanSentimentTheme("BUSINESS_DECISION")).toBe("THE_BUSINESS");
    expect(fanSentimentTheme("DISTRESSED_FINANCING")).toBe("THE_BUSINESS");
  });
});

describe("summarizeByTheme", () => {
  it("always returns all three themes, even with no events", () => {
    const summary = summarizeByTheme([]);
    expect(summary.map((s) => s.theme)).toEqual(["ON_THE_COURT", "FRONT_OFFICE", "THE_BUSINESS"]);
    for (const s of summary) {
      expect(s.netDelta).toBe(0);
      expect(s.eventCount).toBe(0);
    }
  });

  it("sums positive and negative deltas separately within a theme", () => {
    const events = [
      event({ id: "1", kind: "TRADE", delta: 5 }),
      event({ id: "2", kind: "SIGNING", delta: -3 }),
      event({ id: "3", kind: "WIN_STREAK", delta: 4 }),
    ];
    const summary = summarizeByTheme(events);
    const frontOffice = summary.find((s) => s.theme === "FRONT_OFFICE")!;
    expect(frontOffice.netDelta).toBe(2);
    expect(frontOffice.positiveDelta).toBe(5);
    expect(frontOffice.negativeDelta).toBe(-3);
    expect(frontOffice.eventCount).toBe(2);

    const onCourt = summary.find((s) => s.theme === "ON_THE_COURT")!;
    expect(onCourt.netDelta).toBe(4);
    expect(onCourt.eventCount).toBe(1);
  });
});

describe("topContributors", () => {
  it("sorts by absolute magnitude, not raw value", () => {
    const events = [
      event({ id: "small-positive", delta: 2 }),
      event({ id: "big-negative", delta: -9 }),
      event({ id: "medium-positive", delta: 5 }),
    ];
    const { positive, negative } = topContributors(events, 5);
    expect(positive.map((e) => e.id)).toEqual(["medium-positive", "small-positive"]);
    expect(negative.map((e) => e.id)).toEqual(["big-negative"]);
  });

  it("excludes zero-delta events entirely", () => {
    const events = [event({ id: "zero", delta: 0 }), event({ id: "real", delta: 3 })];
    const { positive, negative } = topContributors(events, 5);
    expect(positive.map((e) => e.id)).toEqual(["real"]);
    expect(negative).toEqual([]);
  });

  it("respects the limit", () => {
    const events = Array.from({ length: 10 }, (_, i) => event({ id: `p${i}`, delta: i + 1 }));
    const { positive } = topContributors(events, 3);
    expect(positive.length).toBe(3);
  });
});

describe("buildInSeasonTrend", () => {
  it("returns empty for no events", () => {
    expect(buildInSeasonTrend([], 65)).toEqual([]);
  });

  it("reconstructs a plausible path ending at the current value", () => {
    const events = [
      event({ id: "1", dayIndex: 10, delta: 5 }),
      event({ id: "2", dayIndex: 30, delta: -3 }),
    ];
    const points = buildInSeasonTrend(events, 67);
    expect(points[points.length - 1].fanHappiness).toBe(67);
    // Starting point should be 67 - 5 - (-3) = 65, before any event applied.
    expect(points[0].fanHappiness).toBe(65);
  });

  it("sorts out-of-order events by dayIndex before walking", () => {
    const events = [
      event({ id: "later", dayIndex: 50, delta: -2 }),
      event({ id: "earlier", dayIndex: 5, delta: 4 }),
    ];
    const points = buildInSeasonTrend(events, 67);
    // First point should reflect the earliest day's pre-event state.
    expect(points[0].dayIndex).toBe(5);
  });

  it("clamps intermediate values to 0-100", () => {
    const events = [
      event({ id: "1", dayIndex: 1, delta: -50 }),
      event({ id: "2", dayIndex: 2, delta: 60 }),
    ];
    const points = buildInSeasonTrend(events, 20);
    for (const p of points) {
      expect(p.fanHappiness).toBeGreaterThanOrEqual(0);
      expect(p.fanHappiness).toBeLessThanOrEqual(100);
    }
  });
});

describe("recentTrendDelta", () => {
  it("returns 0 for no events", () => {
    expect(recentTrendDelta([], 10)).toBe(0);
  });

  it("only sums events within the window, measured from the latest event's day", () => {
    const events = [
      event({ id: "old", dayIndex: 0, delta: 100 }),
      event({ id: "recent", dayIndex: 95, delta: 3 }),
      event({ id: "latest", dayIndex: 100, delta: 2 }),
    ];
    // Window of 10 days back from day 100 excludes day 0 entirely.
    expect(recentTrendDelta(events, 10)).toBe(5);
  });

  it("includes everything when the window covers the whole event history", () => {
    const events = [
      event({ id: "1", dayIndex: 0, delta: 3 }),
      event({ id: "2", dayIndex: 5, delta: -1 }),
    ];
    expect(recentTrendDelta(events, 100)).toBe(2);
  });
});
