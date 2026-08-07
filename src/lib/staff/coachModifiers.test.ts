import { describe, expect, it } from "vitest";
import {
  computeCoachBoxScoreModifier,
  computeCoachWinBonus,
  effectiveStaffQuality,
} from "./coachModifiers";

describe("computeCoachWinBonus", () => {
  it("is zero at the neutral anchor (72)", () => {
    expect(computeCoachWinBonus(72)).toBe(0);
  });

  it("is positive above the anchor, negative below it", () => {
    expect(computeCoachWinBonus(90)).toBeGreaterThan(0);
    expect(computeCoachWinBonus(60)).toBeLessThan(0);
  });

  it("caps the bonus so a great coach never rivals real roster talent", () => {
    expect(computeCoachWinBonus(99)).toBeLessThanOrEqual(4);
    expect(computeCoachWinBonus(60)).toBeGreaterThanOrEqual(-4);
  });

  it("is neutral (zero) when no Head Coach is hired", () => {
    expect(computeCoachWinBonus(null)).toBe(0);
  });
});

describe("computeCoachBoxScoreModifier", () => {
  it("is perfectly neutral when no coach is hired", () => {
    expect(computeCoachBoxScoreModifier(null, null)).toEqual({
      benchTrustDelta: 0,
      threePaMultiplier: 1,
    });
  });

  it("maps style to the expected 3PA multiplier direction", () => {
    expect(computeCoachBoxScoreModifier(72, "PACE_AND_SPACE").threePaMultiplier).toBeGreaterThan(1);
    expect(computeCoachBoxScoreModifier(72, "BALANCED").threePaMultiplier).toBe(1);
    expect(computeCoachBoxScoreModifier(72, "GRIND_IT_OUT").threePaMultiplier).toBeLessThan(1);
  });

  it("gives a higher-quality coach a more positive benchTrustDelta", () => {
    const good = computeCoachBoxScoreModifier(95, "BALANCED");
    const bad = computeCoachBoxScoreModifier(62, "BALANCED");
    expect(good.benchTrustDelta).toBeGreaterThan(bad.benchTrustDelta);
  });

  it("defaults an unspecified style to BALANCED", () => {
    expect(computeCoachBoxScoreModifier(72, null).threePaMultiplier).toBe(1);
  });
});

describe("effectiveStaffQuality", () => {
  it("passes through unchanged (null) when no coach/staff is hired, regardless of department level", () => {
    expect(effectiveStaffQuality(null, "MAXIMUM")).toBeNull();
    expect(effectiveStaffQuality(null, "MINIMAL")).toBeNull();
  });

  it("is unchanged at STANDARD department level", () => {
    expect(effectiveStaffQuality(80, "STANDARD")).toBe(80);
  });

  it("MAXIMUM Coaching Support raises effective quality above the raw value", () => {
    expect(effectiveStaffQuality(80, "MAXIMUM")).toBeGreaterThan(80);
  });

  it("MINIMAL Coaching Support lowers effective quality below the raw value", () => {
    expect(effectiveStaffQuality(80, "MINIMAL")).toBeLessThan(80);
  });

  it("clamps into the 0-99 rating range", () => {
    expect(effectiveStaffQuality(99, "MAXIMUM")).toBeLessThanOrEqual(99);
    expect(effectiveStaffQuality(0, "MINIMAL")).toBeGreaterThanOrEqual(0);
  });
});
