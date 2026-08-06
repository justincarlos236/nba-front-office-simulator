import { describe, expect, it } from "vitest";
import { DID_YOU_KNOW_TIPS, pickDidYouKnowTip } from "./didYouKnow";

describe("pickDidYouKnowTip", () => {
  it("always returns one of the registered tips", () => {
    const tip = pickDidYouKnowTip("league-1", new Date("2026-08-06T12:00:00Z"));
    expect(DID_YOU_KNOW_TIPS.map((t) => t.id)).toContain(tip.id);
  });

  it("is stable within the same calendar day for the same league", () => {
    const first = pickDidYouKnowTip("league-1", new Date("2026-08-06T01:00:00Z"));
    const second = pickDidYouKnowTip("league-1", new Date("2026-08-06T23:00:00Z"));
    expect(first.id).toBe(second.id);
  });

  it("can differ across leagues on the same day", () => {
    const seen = new Set(
      ["league-a", "league-b", "league-c", "league-d", "league-e", "league-f"].map(
        (id) => pickDidYouKnowTip(id, new Date("2026-08-06T12:00:00Z")).id,
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("rotates across enough days to cover the whole pool at least once", () => {
    const seen = new Set<string>();
    for (let d = 0; d < DID_YOU_KNOW_TIPS.length * 3; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d, 12));
      seen.add(pickDidYouKnowTip("league-1", date).id);
    }
    expect(seen.size).toBe(DID_YOU_KNOW_TIPS.length);
  });
});
