import { describe, expect, it } from "vitest";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { generateDraftClass, CLASS_SIZE } from "./generateDraftClass";
import { applyGuestProspects, GUEST_PROSPECT_NAMES, GUEST_PROSPECT_SEASON } from "./guestProspects";

/**
 * The five guest names are a joke for the people this was shared with, and the
 * only thing that must be true of them is that they cost the draft nothing.
 * They replace generated prospects rather than joining them, and they inherit
 * their slot's numbers, so no distribution the draft audits measure can move.
 */

const classOf = (seed: string) => generateDraftClass(createSeededRandom(seed)).prospects;

describe("guest prospects", () => {
  it("appear in their own class", () => {
    const names = applyGuestProspects(classOf("a"), GUEST_PROSPECT_SEASON).map((p) => p.fullName);
    for (const guest of GUEST_PROSPECT_NAMES) expect(names).toContain(guest);
  });

  it("appear in no other class", () => {
    for (const season of [GUEST_PROSPECT_SEASON - 1, GUEST_PROSPECT_SEASON + 1]) {
      const names = applyGuestProspects(classOf("a"), season).map((p) => p.fullName);
      for (const guest of GUEST_PROSPECT_NAMES) expect(names).not.toContain(guest);
    }
  });

  it("replaces prospects rather than adding them", () => {
    const before = classOf("b");
    const after = applyGuestProspects(before, GUEST_PROSPECT_SEASON);
    expect(after).toHaveLength(CLASS_SIZE);
    expect(before).toHaveLength(CLASS_SIZE);
  });

  it("changes nothing but the name", () => {
    // The whole point: they are average because they inherit an average slot,
    // not because a rating was chosen for them.
    const before = classOf("c");
    const after = applyGuestProspects(before, GUEST_PROSPECT_SEASON);
    const strip = (p: { fullName: string }) => ({ ...p, fullName: "" });
    expect(after.map(strip)).toEqual(before.map(strip));
  });

  it("leaves them genuinely ordinary", () => {
    // Not a hidden lottery pick. Every guest sits inside the middle of the
    // board's rating range rather than at either end.
    const after = applyGuestProspects(classOf("d"), GUEST_PROSPECT_SEASON);
    const ratings = after.map((p) => p.overallRating).sort((a, b) => a - b);
    const low = ratings[Math.floor(ratings.length * 0.15)];
    const high = ratings[Math.floor(ratings.length * 0.85)];

    for (const guest of GUEST_PROSPECT_NAMES) {
      const p = after.find((x) => x.fullName === guest);
      expect(p, `${guest} missing`).toBeDefined();
      expect(p!.overallRating).toBeGreaterThanOrEqual(low);
      expect(p!.overallRating).toBeLessThanOrEqual(high);
    }
  });

  it("keeps every name in the class unique", () => {
    const names = applyGuestProspects(classOf("e"), GUEST_PROSPECT_SEASON).map((p) => p.fullName);
    expect(new Set(names).size).toBe(names.length);
  });
});
