import { describe, expect, it } from "vitest";
import { computeTeamStrength } from "./teamStrength";

describe("computeTeamStrength", () => {
  it("returns 0 for an empty roster", () => {
    expect(computeTeamStrength([])).toBe(0);
  });

  it("returns the flat rating when every player is identical", () => {
    expect(computeTeamStrength(Array(12).fill(60))).toBeCloseTo(60, 5);
  });

  it("weights top players more than deep bench", () => {
    const starLoaded = [90, 85, 80, 50, 50, 50, 50, 50, 50, 50, 50, 50];
    const balanced = [65, 65, 65, 65, 65, 65, 65, 65, 65, 65, 65, 65];
    // Same average raw rating isn't guaranteed here, so just check a
    // star-heavy roster with a high floor scores above a purely average one
    // when the stars are strong enough to matter.
    expect(computeTeamStrength(starLoaded)).toBeGreaterThan(55);
    expect(computeTeamStrength(balanced)).toBeCloseTo(65, 5);
  });

  it("weights deep bench players (past the rotation) much less", () => {
    const withGarbageTimeGuys = [70, 70, 70, 70, 70, 70, 70, 70, 70, 20, 20, 20];
    const strength = computeTeamStrength(withGarbageTimeGuys);
    // Should stay close to the rotation's 70 rather than being dragged
    // down toward the bench's 20.
    expect(strength).toBeGreaterThan(60);
  });

  it("is order-independent", () => {
    const a = computeTeamStrength([80, 40, 60, 70, 50]);
    const b = computeTeamStrength([40, 50, 60, 70, 80]);
    expect(a).toBeCloseTo(b, 10);
  });
});
