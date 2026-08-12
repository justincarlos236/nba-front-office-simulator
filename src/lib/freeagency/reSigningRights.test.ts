import { describe, expect, it } from "vitest";
import { computeReSigningMaxOfferCents } from "./reSigningRights";
import { getSeasonCapRules } from "../cap/constants";
import { maxSalaryFractionForAge } from "../cap/maxSalary";

/** A peak-age veteran, so neither the age curve nor the rookie scale applies. */
const PEAK = { age: 27, experience: 6 };

describe("computeReSigningMaxOfferCents", () => {
  it("gives a higher ceiling to a better player", () => {
    const superstar = computeReSigningMaxOfferCents(85, 2025, PEAK.age, PEAK.experience);
    const rotationPlayer = computeReSigningMaxOfferCents(45, 2025, PEAK.age, PEAK.experience);
    expect(superstar).toBeGreaterThan(rotationPlayer);
  });

  it("scales with the season's salary cap", () => {
    const earlier = computeReSigningMaxOfferCents(70, 2023, PEAK.age, PEAK.experience);
    const later = computeReSigningMaxOfferCents(70, 2025, PEAK.age, PEAK.experience);
    expect(later).toBeGreaterThan(earlier);
  });

  it("never returns a negative or zero ceiling for a real rating", () => {
    expect(computeReSigningMaxOfferCents(50, 2025, PEAK.age, PEAK.experience)).toBeGreaterThan(0n);
  });

  /**
   * The regression test for docs/CONTRACT_AUDIT.md C-P1-3. This function used
   * to have no age term at all, so a 39-year-old re-signed for 82% more than
   * the same man would have cost at bootstrap - age risk was priced on one
   * path and free on three.
   */
  it("discounts an ageing player, the way every other pricing path does", () => {
    const peak = computeReSigningMaxOfferCents(85, 2025, 27, 6);
    const old = computeReSigningMaxOfferCents(85, 2025, 37, 15);
    expect(old).toBeLessThan(peak);
  });

  /** C-P0-3: nothing may exceed the individual maximum. */
  it("never exceeds the individual maximum for the player's age", () => {
    const rules = getSeasonCapRules(2025);
    for (const age of [22, 27, 30, 35]) {
      const ceiling = computeReSigningMaxOfferCents(99, 2025, age, 12);
      const max = BigInt(Math.round(Number(rules.salaryCapCents) * maxSalaryFractionForAge(age)));
      expect(ceiling).toBeLessThanOrEqual(max);
    }
  });
});
