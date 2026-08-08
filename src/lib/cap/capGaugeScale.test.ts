import { describe, expect, it } from "vitest";
import { getSeasonCapRules } from "./constants";

/**
 * Locks the cap gauge's scale window.
 *
 * The first version anchored the track at $0, which was arithmetically
 * correct and visually useless: every threshold that governs a rule lives
 * between roughly 80% and 100% of the second apron, so two thirds of the
 * track was empty space and the four lines that matter were crushed into a
 * sliver. A team at $175.8M - past the tax AND the first apron - rendered
 * with its marker near the left end.
 *
 * These assertions encode the requirement the visual has to meet, so the
 * window cannot silently regress to something unreadable again.
 */

const SEASON = 2023;

function scale(season: number) {
  const rules = getSeasonCapRules(season);
  const floor = (rules.salaryCapCents * 88n) / 100n;
  const ceiling = (rules.secondApronCents * 106n) / 100n;
  const span = ceiling - floor;
  const pct = (value: bigint) => {
    if (value <= floor) return 0;
    if (value >= ceiling) return 100;
    return Number(((value - floor) * 10000n) / span) / 100;
  };
  return { rules, pct };
}

describe("cap gauge scale window", () => {
  it("spreads the four governing thresholds across most of the track", () => {
    const { rules, pct } = scale(SEASON);
    const cap = pct(rules.salaryCapCents);
    const apron2 = pct(rules.secondApronCents);
    // The whole point: the meaningful range must occupy the majority of the
    // width, not a sliver at one end.
    expect(apron2 - cap).toBeGreaterThan(50);
  });

  it("keeps every threshold visible rather than pinned to an edge", () => {
    const { rules, pct } = scale(SEASON);
    for (const value of [
      rules.salaryCapCents,
      rules.luxuryTaxCents,
      rules.firstApronCents,
      rules.secondApronCents,
    ]) {
      const p = pct(value);
      expect(p).toBeGreaterThan(5);
      expect(p).toBeLessThan(95);
    }
  });

  it("orders the thresholds left to right, as the CBA does", () => {
    const { rules, pct } = scale(SEASON);
    expect(pct(rules.salaryCapCents)).toBeLessThan(pct(rules.luxuryTaxCents));
    expect(pct(rules.luxuryTaxCents)).toBeLessThan(pct(rules.firstApronCents));
    expect(pct(rules.firstApronCents)).toBeLessThan(pct(rules.secondApronCents));
  });

  it("places a team over the first apron in the right-hand half", () => {
    const { rules, pct } = scale(SEASON);
    // The exact case from the screenshot that exposed the bug: $175.8M is
    // past the tax and past the first apron, so it must not read as "low".
    const overFirstApron = rules.firstApronCents + 3_000_000_00n;
    expect(pct(overFirstApron)).toBeGreaterThan(50);
  });

  it("clamps rather than overflowing for an extreme payroll", () => {
    const { rules, pct } = scale(SEASON);
    expect(pct(rules.secondApronCents * 3n)).toBe(100);
    expect(pct(0n)).toBe(0);
  });
});
