import { describe, expect, it } from "vitest";
import { skylinePathFor } from "./Skyline";
import { TEAM_SEEDS } from "../../../prisma/data/teams";

/**
 * The skylines are authored by hand, which means the failure mode is a typo in
 * a path string rather than a logic bug. These tests check the grammar the
 * whole set is supposed to share.
 */
describe("franchise skylines", () => {
  it("gives every one of the 30 franchises its own skyline", () => {
    const paths = new Set<string>();
    for (const team of TEAM_SEEDS) {
      const path = skylinePathFor(team.abbreviation);
      expect(path, `${team.abbreviation} has no skyline`).toBeTruthy();
      paths.add(path);
    }
    // No two franchises share a silhouette, and none fell through to GENERIC.
    expect(paths.size).toBe(TEAM_SEEDS.length);
  });

  it("draws every skyline as a closed path on the same baseline", () => {
    for (const team of TEAM_SEEDS) {
      const path = skylinePathFor(team.abbreviation);
      // Starts at the bottom-left of the 400x100 viewBox...
      expect(path.startsWith("M0 100"), `${team.abbreviation} does not start at the baseline`).toBe(
        true,
      );
      // ...and closes, so it fills as a solid silhouette rather than a stroke.
      expect(path.trim().endsWith("Z"), `${team.abbreviation} is not closed`).toBe(true);
    }
  });

  it("keeps every skyline inside the viewBox", () => {
    for (const team of TEAM_SEEDS) {
      const path = skylinePathFor(team.abbreviation);
      const numbers = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
      expect(numbers.length).toBeGreaterThan(0);
      for (const n of numbers) {
        expect(
          n,
          `${team.abbreviation} has an out-of-range coordinate: ${n}`,
        ).toBeGreaterThanOrEqual(0);
        expect(n, `${team.abbreviation} has an out-of-range coordinate: ${n}`).toBeLessThanOrEqual(
          400,
        );
      }
    }
  });

  it("resolves a relocated franchise to its new city", () => {
    // Seattle, Las Vegas and Louisville are the three real destinations in
    // RELOCATION_DESTINATIONS.
    for (const city of ["Seattle", "Las Vegas", "Louisville"]) {
      const relocated = skylinePathFor("OKC", city);
      expect(relocated).not.toBe(skylinePathFor("OKC"));
    }
  });

  it("falls back rather than throwing on an unknown team", () => {
    const fallback = skylinePathFor("ZZZ");
    expect(fallback.startsWith("M0 100")).toBe(true);
    expect(fallback.endsWith("Z")).toBe(true);
  });

  it("ignores a relocation city it has no skyline for", () => {
    // A destination added to the game but not yet drawn must fall back to the
    // franchise's original city rather than to the generic silhouette.
    expect(skylinePathFor("BOS", "Nowhere City")).toBe(skylinePathFor("BOS"));
  });
});
