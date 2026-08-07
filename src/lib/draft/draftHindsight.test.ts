import { describe, expect, it } from "vitest";
import { classifyDraftHindsight, describeDraftHindsight } from "./draftHindsight";

describe("classifyDraftHindsight", () => {
  it("returns null for a well-scouted prospect (Depth 2+), regardless of team", () => {
    expect(classifyDraftHindsight({ scoutingDepthAtDraft: 2, isOnUserTeam: false })).toBeNull();
    expect(classifyDraftHindsight({ scoutingDepthAtDraft: 3, isOnUserTeam: true })).toBeNull();
  });

  it("classifies an under-scouted (Depth 0) prospect on another team as GOT_AWAY", () => {
    expect(classifyDraftHindsight({ scoutingDepthAtDraft: 0, isOnUserTeam: false })).toBe(
      "GOT_AWAY",
    );
  });

  it("classifies an under-scouted (Depth 1) prospect on another team as GOT_AWAY", () => {
    expect(classifyDraftHindsight({ scoutingDepthAtDraft: 1, isOnUserTeam: false })).toBe(
      "GOT_AWAY",
    );
  });

  it("classifies an under-scouted prospect on the user's own team as GAMBLE_PAID_OFF", () => {
    expect(classifyDraftHindsight({ scoutingDepthAtDraft: 0, isOnUserTeam: true })).toBe(
      "GAMBLE_PAID_OFF",
    );
    expect(classifyDraftHindsight({ scoutingDepthAtDraft: 1, isOnUserTeam: true })).toBe(
      "GAMBLE_PAID_OFF",
    );
  });

  it("never returns GAMBLE_PAID_OFF for someone not on the user's team, or GOT_AWAY for someone on it", () => {
    for (let depth = 0; depth <= 1; depth++) {
      expect(classifyDraftHindsight({ scoutingDepthAtDraft: depth, isOnUserTeam: false })).not.toBe(
        "GAMBLE_PAID_OFF",
      );
      expect(classifyDraftHindsight({ scoutingDepthAtDraft: depth, isOnUserTeam: true })).not.toBe(
        "GOT_AWAY",
      );
    }
  });
});

describe("describeDraftHindsight", () => {
  it("frames GOT_AWAY as regret, mentioning the current team", () => {
    const desc = describeDraftHindsight("GOT_AWAY", "Marcus Webb", 0, "Miami Heat");
    expect(desc).toContain("Marcus Webb");
    expect(desc).toContain("Miami Heat");
    expect(desc).toContain("Unknown");
  });

  it("frames GAMBLE_PAID_OFF as vindication, not luck - never says 'lucky'", () => {
    const desc = describeDraftHindsight("GAMBLE_PAID_OFF", "Marcus Webb", 1, "Miami Heat");
    expect(desc.toLowerCase()).not.toContain("lucky");
    expect(desc).toContain("gamble");
  });

  it("includes the correct depth label for each depth level", () => {
    expect(describeDraftHindsight("GOT_AWAY", "X", 0, "Team")).toContain("Unknown");
    expect(describeDraftHindsight("GOT_AWAY", "X", 1, "Team")).toContain("Seen");
  });
});
