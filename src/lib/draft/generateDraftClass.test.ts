import { describe, expect, it } from "vitest";
import { generateDraftClass } from "./generateDraftClass";

function fixedRng(value: number): () => number {
  return () => value;
}

describe("generateDraftClass", () => {
  it("generates exactly 60 prospects", () => {
    expect(generateDraftClass(Math.random).prospects).toHaveLength(60);
  });

  it("returns a class character alongside the prospects", () => {
    const { character } = generateDraftClass(Math.random);
    expect([
      "BALANCED",
      "TOP_HEAVY",
      "DEEP_BUT_FLAT",
      "INTERNATIONAL_HEAVY",
      "INJURY_RIDDLED",
      "WEAK_CLASS",
    ]).toContain(character);
  });

  it("keeps every rating within [25, 99]", () => {
    const { prospects } = generateDraftClass(Math.random);
    for (const p of prospects) {
      expect(p.overallRating).toBeGreaterThanOrEqual(25);
      expect(p.overallRating).toBeLessThanOrEqual(99);
      expect(p.potentialRating).toBeGreaterThanOrEqual(25);
      expect(p.potentialRating).toBeLessThanOrEqual(99);
    }
  });

  it("never gives a prospect potential below their own overall rating", () => {
    const { prospects } = generateDraftClass(Math.random);
    for (const p of prospects) {
      expect(p.potentialRating).toBeGreaterThanOrEqual(p.overallRating);
    }
  });

  it("never generates two prospects with the same full name in one class", () => {
    // Regression: 30 first names x 30 last names (900 combinations) drawn
    // 60 times reliably collided before generateUniqueProspectName. Run
    // several real-random classes since a single run could pass by luck
    // even with the bug present.
    for (let i = 0; i < 20; i++) {
      const { prospects } = generateDraftClass(Math.random);
      const names = prospects.map((p) => p.fullName);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("keeps ages within the real draft-eligible range", () => {
    const { prospects } = generateDraftClass(Math.random);
    for (const p of prospects) {
      expect(p.age).toBeGreaterThanOrEqual(19);
      expect(p.age).toBeLessThanOrEqual(22);
    }
  });

  it("trends early picks higher than late picks on average, across every class character", () => {
    // Since the very first rng() draw now picks the class character (Class-
    // Character Variance, Phase 4), a single fixed rng value picks one
    // specific character deterministically - sweep enough distinct values to
    // hit every character at least once, and confirm the pick-position trend
    // holds regardless (every character's modifiers still leave pick 1
    // above pick 60, by design - see classCharacter.ts's test suite for the
    // per-character deltas themselves).
    for (const seed of [0.05, 0.4, 0.55, 0.7, 0.85, 0.95]) {
      const { prospects } = generateDraftClass(fixedRng(seed));
      const pick1 = prospects[0];
      const pick60 = prospects[59];
      expect(pick1.overallRating).toBeGreaterThan(pick60.overallRating);
      expect(pick1.potentialRating).toBeGreaterThan(pick60.potentialRating);
    }
  });

  it("is deterministic for a fixed rng sequence", () => {
    // Two genuinely independent counters - a single shared `i` closed over
    // by both rngA and rngB would let the first generateDraftClass() call
    // (which now consumes a variable number of rng() draws depending on
    // which class character it rolls first) leave `i` in a different state
    // than a fresh start, silently breaking this test's own premise.
    const values = [0.1, 0.5, 0.9, 0.3, 0.7];
    function makeRng() {
      let i = 0;
      return () => values[i++ % values.length];
    }
    expect(generateDraftClass(makeRng())).toEqual(generateDraftClass(makeRng()));
  });

  it("populates the richer scouting profile fields within realistic bounds", () => {
    const { prospects } = generateDraftClass(Math.random);
    for (const p of prospects) {
      expect(p.heightInches).toBeGreaterThanOrEqual(72);
      expect(p.heightInches).toBeLessThanOrEqual(87);
      expect(p.weightLbs).toBeGreaterThanOrEqual(175);
      expect(p.weightLbs).toBeLessThanOrEqual(270);
      expect(p.collegeOrTeam.length).toBeGreaterThan(0);
      expect(typeof p.isInternational).toBe("boolean");
      expect(p.nationality.length).toBeGreaterThan(0);
      expect(p.comparisonPlayerName.length).toBeGreaterThan(0);
    }
  });

  it("never assigns nationality other than USA to a domestic (non-international) prospect", () => {
    const { prospects } = generateDraftClass(Math.random);
    for (const p of prospects) {
      if (!p.isInternational) expect(p.nationality).toBe("USA");
    }
  });

  it("every prospect in the same class shares the same pathway pool bias but can differ individually", () => {
    const { prospects } = generateDraftClass(Math.random);
    const pathways = new Set(prospects.map((p) => p.pathway));
    // Not every pathway is guaranteed in a single 60-man class, but more
    // than one should appear under normal generation.
    expect(pathways.size).toBeGreaterThan(1);
  });
});
