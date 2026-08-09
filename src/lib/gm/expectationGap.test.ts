import { describe, expect, it } from "vitest";
import {
  computeExpectationGap,
  EXPECTATION_GAP_NOTE,
  EXPECTATION_GAP_TONE,
} from "./expectationGap";
import { EXPECTATION_LEVEL_ORDER } from "./expectationLevel";
import type { TeamIdentity } from "./teamIdentity";

const IDENTITIES: TeamIdentity[] = [
  "CONTENDER",
  "PLAYOFF_TEAM",
  "PLAY_IN_TEAM",
  "REBUILDING",
  "TANKING",
];

describe("expectation gap", () => {
  it("names the case that looked like a bug on the dashboard", () => {
    // The reported screenshot: a 33-49 Brooklyn side on $202M payroll, so
    // ownership asks for a deep playoff run while the team reads as Tanking.
    // Both facts are correct; the interface just never said they conflicted.
    expect(computeExpectationGap("DEEP_PLAYOFF_RUN", "TANKING")).toBe("crisis");
    expect(EXPECTATION_GAP_NOTE.crisis).not.toBeNull();
  });

  it("stays quiet when the team is what ownership asked for", () => {
    expect(computeExpectationGap("CHAMPIONSHIP_CONTENTION", "CONTENDER")).toBe("aligned");
    expect(computeExpectationGap("MAKE_PLAYOFFS", "PLAYOFF_TEAM")).toBe("aligned");
    expect(computeExpectationGap("DEVELOP_YOUNG_PLAYERS", "TANKING")).toBe("aligned");
    // A team exceeding its mandate is also aligned - there is no tension to name.
    expect(computeExpectationGap("DEVELOP_YOUNG_PLAYERS", "CONTENDER")).toBe("aligned");
    expect(EXPECTATION_GAP_NOTE.aligned).toBeNull();
  });

  it("treats a one-level shortfall as a stretch rather than a crisis", () => {
    // Asking a Play-In team to win a series is a demanding but ordinary season.
    expect(computeExpectationGap("WIN_PLAYOFF_SERIES", "PLAYOFF_TEAM")).toBe("stretch");
  });

  it("escalates as the gap widens", () => {
    const order = ["aligned", "stretch", "mismatch", "crisis"];
    // Holding the identity fixed at the bottom, a higher ask must never
    // produce a *less* severe gap.
    let lastIndex = 0;
    for (const level of EXPECTATION_LEVEL_ORDER) {
      const idx = order.indexOf(computeExpectationGap(level, "TANKING"));
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
  });

  it("covers every expectation and identity pairing", () => {
    for (const level of EXPECTATION_LEVEL_ORDER) {
      for (const identity of IDENTITIES) {
        const gap = computeExpectationGap(level, identity);
        expect(EXPECTATION_GAP_TONE[gap]).toBeDefined();
        // `note` is null only for aligned, and non-empty otherwise.
        if (gap !== "aligned") expect(EXPECTATION_GAP_NOTE[gap]?.length).toBeGreaterThan(0);
      }
    }
  });

  it("treats rebuilding and tanking as the same distance from a mandate", () => {
    // They differ by roster age, not by how far they are from contending, so a
    // mandate lands on them identically.
    for (const level of EXPECTATION_LEVEL_ORDER) {
      expect(computeExpectationGap(level, "REBUILDING")).toBe(
        computeExpectationGap(level, "TANKING"),
      );
    }
  });
});
