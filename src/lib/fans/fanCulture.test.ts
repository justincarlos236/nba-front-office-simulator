import { describe, it, expect } from "vitest";
import {
  computeFanCulturePatience,
  computeFanCultureExpectationCeiling,
  computeFanCultureLoyalty,
  computeFanCulture,
  explainFanCulture,
  scaleSentimentByPatience,
  scaleSentimentByLoyalty,
  happinessFloorForLoyalty,
  type FanCultureHistoryInputs,
} from "./fanCulture";

function baseInputs(overrides: Partial<FanCultureHistoryInputs> = {}): FanCultureHistoryInputs {
  return {
    marketSize: "MID",
    seasonOutcomes: [],
    happinessHistory: [],
    iconDeparturesInWindow: 0,
    currentIconScore: 0,
    hasRelocated: false,
    ticketPostureFanDelta: 0,
    ...overrides,
  };
}

describe("computeFanCulturePatience", () => {
  it("rewards a rebuild that visibly paid off", () => {
    const paidOff = computeFanCulturePatience(
      baseInputs({
        seasonOutcomes: [
          { season: 1, playoffDepth: 0 },
          { season: 2, playoffDepth: 1 },
          { season: 3, playoffDepth: 4 },
        ],
      }),
    );
    const neutral = computeFanCulturePatience(baseInputs());
    expect(paidOff).toBeGreaterThan(neutral);
  });

  it("punishes a rebuild that resolved into a real season but still missed the playoffs", () => {
    const brokenPromise = computeFanCulturePatience(
      baseInputs({
        seasonOutcomes: [
          { season: 1, playoffDepth: 0 },
          { season: 2, playoffDepth: 1 },
          { season: 3, playoffDepth: 2 }, // a real season (not a rebuild year), but still an early exit
        ],
      }),
    );
    const neutral = computeFanCulturePatience(baseInputs());
    expect(brokenPromise).toBeLessThan(neutral);
  });

  it("punishes a rebuild that never ends at least as hard as one that resolved and failed", () => {
    const neverEnds = computeFanCulturePatience(
      baseInputs({
        seasonOutcomes: [
          { season: 1, playoffDepth: 0 },
          { season: 2, playoffDepth: 1 },
          { season: 3, playoffDepth: 0 },
          { season: 4, playoffDepth: 1 },
        ],
      }),
    );
    const neutral = computeFanCulturePatience(baseInputs());
    expect(neverEnds).toBeLessThan(neutral);
  });

  it("small markets start more patient than large markets, all else equal", () => {
    const small = computeFanCulturePatience(baseInputs({ marketSize: "SMALL" }));
    const large = computeFanCulturePatience(baseInputs({ marketSize: "LARGE" }));
    expect(small).toBeGreaterThan(large);
  });

  it("stays within 0-100 under extreme repeated failure", () => {
    const outcomes = Array.from({ length: 15 }, (_, i) => ({ season: i, playoffDepth: 0 }));
    const value = computeFanCulturePatience(baseInputs({ seasonOutcomes: outcomes }));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
  });
});

describe("computeFanCultureExpectationCeiling", () => {
  it("rises with championships and deep runs", () => {
    const champion = computeFanCultureExpectationCeiling(
      baseInputs({ seasonOutcomes: [{ season: 1, playoffDepth: 6 }] }),
    );
    const neutral = computeFanCultureExpectationCeiling(baseInputs());
    expect(champion).toBeGreaterThan(neutral);
  });

  it("falls only slowly with sustained irrelevance, not sharply", () => {
    const oneIrrelevantSeason = computeFanCultureExpectationCeiling(
      baseInputs({ seasonOutcomes: [{ season: 1, playoffDepth: 0 }] }),
    );
    const neutral = computeFanCultureExpectationCeiling(baseInputs());
    // A single bad season barely moves it - "slowly," not a cliff.
    expect(neutral - oneIrrelevantSeason).toBeLessThan(10);
  });

  it("large markets start with a higher ceiling than small markets", () => {
    const large = computeFanCultureExpectationCeiling(baseInputs({ marketSize: "LARGE" }));
    const small = computeFanCultureExpectationCeiling(baseInputs({ marketSize: "SMALL" }));
    expect(large).toBeGreaterThan(small);
  });

  it("current star power raises the ceiling even without playoff history", () => {
    const withIcon = computeFanCultureExpectationCeiling(
      baseInputs({ seasonOutcomes: [{ season: 1, playoffDepth: 2 }], currentIconScore: 90 }),
    );
    const withoutIcon = computeFanCultureExpectationCeiling(
      baseInputs({ seasonOutcomes: [{ season: 1, playoffDepth: 2 }], currentIconScore: 0 }),
    );
    expect(withIcon).toBeGreaterThan(withoutIcon);
  });
});

describe("computeFanCultureLoyalty", () => {
  it("rewards keeping a real franchise icon", () => {
    const withIcon = computeFanCultureLoyalty(baseInputs({ currentIconScore: 90 }));
    const withoutIcon = computeFanCultureLoyalty(baseInputs({ currentIconScore: 0 }));
    expect(withIcon).toBeGreaterThan(withoutIcon);
  });

  it("punishes icon departures", () => {
    const departures = computeFanCultureLoyalty(baseInputs({ iconDeparturesInWindow: 2 }));
    const neutral = computeFanCultureLoyalty(baseInputs());
    expect(departures).toBeLessThan(neutral);
  });

  it("relocation is a severe, standalone penalty", () => {
    const relocated = computeFanCultureLoyalty(baseInputs({ hasRelocated: true }));
    const neutral = computeFanCultureLoyalty(baseInputs());
    expect(neutral - relocated).toBeGreaterThanOrEqual(25);
  });

  it("gouging on ticket prices lowers loyalty; fan-friendly pricing raises it", () => {
    const gouging = computeFanCultureLoyalty(baseInputs({ ticketPostureFanDelta: -3 }));
    const friendly = computeFanCultureLoyalty(baseInputs({ ticketPostureFanDelta: 2 }));
    expect(friendly).toBeGreaterThan(gouging);
  });

  it("small markets start more loyal than mid markets, all else equal", () => {
    const small = computeFanCultureLoyalty(baseInputs({ marketSize: "SMALL" }));
    const mid = computeFanCultureLoyalty(baseInputs({ marketSize: "MID" }));
    expect(small).toBeGreaterThan(mid);
  });
});

describe("computeFanCulture", () => {
  it("returns all three traits", () => {
    const result = computeFanCulture(baseInputs());
    expect(result).toHaveProperty("patience");
    expect(result).toHaveProperty("expectationCeiling");
    expect(result).toHaveProperty("loyalty");
  });
});

describe("scaleSentimentByPatience", () => {
  it("leaves positive deltas untouched", () => {
    expect(scaleSentimentByPatience(5, 0)).toBe(5);
    expect(scaleSentimentByPatience(5, 100)).toBe(5);
  });

  it("dampens negative deltas for a highly patient fanbase", () => {
    const patient = scaleSentimentByPatience(-10, 100);
    const impatient = scaleSentimentByPatience(-10, 0);
    expect(Math.abs(patient)).toBeLessThan(Math.abs(impatient));
  });
});

describe("scaleSentimentByLoyalty", () => {
  it("dampens swings in both directions for a highly loyal fanbase", () => {
    const loyalPositive = scaleSentimentByLoyalty(10, 100);
    const fickle_positive = scaleSentimentByLoyalty(10, 0);
    expect(loyalPositive).toBeLessThan(fickle_positive);

    const loyalNegative = scaleSentimentByLoyalty(-10, 100);
    const fickleNegative = scaleSentimentByLoyalty(-10, 0);
    expect(Math.abs(loyalNegative)).toBeLessThan(Math.abs(fickleNegative));
  });
});

describe("happinessFloorForLoyalty", () => {
  it("is monotonic - more loyalty never means a lower floor", () => {
    const low = happinessFloorForLoyalty(0);
    const mid = happinessFloorForLoyalty(50);
    const high = happinessFloorForLoyalty(100);
    expect(low).toBeLessThanOrEqual(mid);
    expect(mid).toBeLessThanOrEqual(high);
  });
});

describe("explainFanCulture", () => {
  it("always returns all three trait fact arrays", () => {
    const facts = explainFanCulture(baseInputs());
    expect(facts).toHaveProperty("patience");
    expect(facts).toHaveProperty("expectationCeiling");
    expect(facts).toHaveProperty("loyalty");
  });

  it("cites a real championship when one exists", () => {
    const facts = explainFanCulture(
      baseInputs({ seasonOutcomes: [{ season: 1, playoffDepth: 6 }] }),
    );
    expect(facts.expectationCeiling.some((f) => f.toLowerCase().includes("championship"))).toBe(
      true,
    );
  });

  it("cites relocation when it happened", () => {
    const facts = explainFanCulture(baseInputs({ hasRelocated: true }));
    expect(facts.loyalty.some((f) => f.toLowerCase().includes("relocat"))).toBe(true);
  });

  it("cites icon departures when they happened", () => {
    const facts = explainFanCulture(baseInputs({ iconDeparturesInWindow: 2 }));
    expect(facts.loyalty.some((f) => f.includes("2 franchise icons"))).toBe(true);
  });

  it("never throws with no history at all", () => {
    expect(() => explainFanCulture(baseInputs())).not.toThrow();
  });
});
