import { describe, expect, it } from "vitest";
import { computeReSigningMaxOfferCents } from "./reSigningRights";

describe("computeReSigningMaxOfferCents", () => {
  it("gives a higher ceiling to a better player", () => {
    const superstar = computeReSigningMaxOfferCents(85, 2025);
    const rotationPlayer = computeReSigningMaxOfferCents(45, 2025);
    expect(superstar).toBeGreaterThan(rotationPlayer);
  });

  it("scales with the season's salary cap", () => {
    const earlier = computeReSigningMaxOfferCents(70, 2023);
    const later = computeReSigningMaxOfferCents(70, 2025);
    expect(later).toBeGreaterThan(earlier);
  });

  it("never returns a negative or zero ceiling for a real rating", () => {
    expect(computeReSigningMaxOfferCents(50, 2025)).toBeGreaterThan(0n);
  });
});
