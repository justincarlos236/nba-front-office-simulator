import { describe, it, expect } from "vitest";
import { applyRatingOverride, overrideCount, overrideKeys } from "./ratingOverrides";

describe("ratingOverrides", () => {
  it("applies a curated consensus target and reports it as applied", () => {
    const r = applyRatingOverride("Nikola Jokic", 95);
    expect(r.applied).toBe(true);
    expect(r.rating).toBe(98);
  });

  it("matches regardless of accents, case, or hyphen spelling variants", () => {
    // Accented + odd casing should still hit the same normalized key.
    expect(applyRatingOverride("Nikola Jokić", 90).applied).toBe(true);
    expect(applyRatingOverride("SHAI GILGEOUS-ALEXANDER", 90).rating).toBe(98);
  });

  it("leaves an un-listed player's model rating untouched", () => {
    const r = applyRatingOverride("Some Bench Guy", 71);
    expect(r.applied).toBe(false);
    expect(r.rating).toBe(71);
  });

  it("ignores the JSON _comment field (only numeric entries become overrides)", () => {
    expect(overrideKeys()).not.toContain("_comment");
    expect(overrideCount()).toBeGreaterThan(5);
    expect(overrideCount()).toBeLessThan(40); // stays "minimal"
  });
});
