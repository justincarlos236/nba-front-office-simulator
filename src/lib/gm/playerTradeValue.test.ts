import { describe, expect, it } from "vitest";
import { computePlayerTradeValue, type PlayerTradeValueInput } from "./playerTradeValue";

const BASE: PlayerTradeValueInput = {
  season: 2023,
  overallRating: 70,
  potentialRating: 70,
  age: 27,
  currentSalaryCents: 20_000_000_00n,
  injuryStatus: "HEALTHY",
  careerGamesMissedToInjury: 0,
};

describe("computePlayerTradeValue", () => {
  it("values a higher-rated player more", () => {
    const low = computePlayerTradeValue({ ...BASE, overallRating: 50 });
    const high = computePlayerTradeValue({ ...BASE, overallRating: 80 });
    expect(high).toBeGreaterThan(low);
  });

  it("values untapped potential as upside", () => {
    const noUpside = computePlayerTradeValue({ ...BASE, potentialRating: 70 });
    const highUpside = computePlayerTradeValue({ ...BASE, potentialRating: 90 });
    expect(highUpside).toBeGreaterThan(noUpside);
  });

  it("values a bargain contract more than the same player on a max deal", () => {
    const bargain = computePlayerTradeValue({ ...BASE, currentSalaryCents: 2_000_000_00n });
    const overpay = computePlayerTradeValue({ ...BASE, currentSalaryCents: 45_000_000_00n });
    expect(bargain).toBeGreaterThan(overpay);
  });

  it("discounts value for a current injury", () => {
    const healthy = computePlayerTradeValue({ ...BASE, injuryStatus: "HEALTHY" });
    const seasonEnding = computePlayerTradeValue({ ...BASE, injuryStatus: "SEASON_ENDING" });
    expect(seasonEnding).toBeLessThan(healthy);
  });

  it("discounts value for career injury history, capped so it never zeroes out", () => {
    const noHistory = computePlayerTradeValue({ ...BASE, careerGamesMissedToInjury: 0 });
    const injuryProne = computePlayerTradeValue({ ...BASE, careerGamesMissedToInjury: 400 });
    expect(injuryProne).toBeLessThan(noHistory);
    expect(injuryProne).toBeGreaterThan(0n);
  });

  it("never returns a negative value", () => {
    const value = computePlayerTradeValue({
      ...BASE,
      overallRating: 30,
      potentialRating: 30,
      currentSalaryCents: 50_000_000_00n,
      injuryStatus: "SEASON_ENDING",
      careerGamesMissedToInjury: 1000,
    });
    expect(value).toBeGreaterThanOrEqual(0n);
  });
});
