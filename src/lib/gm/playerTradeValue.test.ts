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
    // A genuinely valuable player, i.e. one whose contract is not itself the
    // problem - the cap being tested is on the injury discount, and BASE is a
    // 70-rated on $20M, whose value is now correctly negative on the contract
    // alone.
    const valuable = { ...BASE, overallRating: 85, potentialRating: 85, currentSalaryCents: 0n };
    const noHistory = computePlayerTradeValue({ ...valuable, careerGamesMissedToInjury: 0 });
    const injuryProne = computePlayerTradeValue({ ...valuable, careerGamesMissedToInjury: 400 });
    expect(injuryProne).toBeLessThan(noHistory);
    expect(injuryProne).toBeGreaterThan(0n);
    // MAX_CAREER_INJURY_DISCOUNT is 0.3, so no injury history can take more
    // than 30% however long it is.
    expect(Number(injuryProne) / Number(noHistory)).toBeGreaterThanOrEqual(0.7);
  });

  // The four properties below are the regression net for docs/audits/TRADE_AUDIT.md.
  // Each one fails on the pre-audit model.

  it("prices a genuine albatross as a real liability, bounded by his salary", () => {
    // Was clamped at zero, which meant a bad contract cost nothing to shed:
    // every CPU team absorbed a 70-rated 33-year-old on $50M for free, and the
    // cap stopped constraining the user entirely (T-P1-1).
    const albatross = computePlayerTradeValue({
      ...BASE,
      overallRating: 70,
      potentialRating: 70,
      age: 33,
      currentSalaryCents: 50_000_000_00n,
    });
    expect(albatross).toBeLessThan(0n);
    // Bounded without a magic number: talent is never negative and surplus is
    // never worse than the whole salary, so the floor is -0.5x salary.
    expect(albatross).toBeGreaterThan(-25_000_000_00n);
  });

  it("does not compound the age discount into near-zero value for an ageing star", () => {
    // `ageValueMultiplier` used to scale the score *before* a logistic, turning
    // a documented 35% discount into 96%. Curry, Durant, LeBron, Kawhi, Harden,
    // Butler, Lillard, George, Gobert and DeRozan were all worth exactly zero
    // (T-P0-1).
    const prime = computePlayerTradeValue({
      ...BASE,
      overallRating: 93,
      potentialRating: 93,
      age: 27,
      currentSalaryCents: 0n,
    });
    const old = computePlayerTradeValue({
      ...BASE,
      overallRating: 93,
      potentialRating: 93,
      age: 37,
      currentSalaryCents: 0n,
    });
    // ageValueMultiplier(37) is 0.65, so the value must stay in that
    // neighbourhood rather than collapsing by an order of magnitude.
    const retained = Number(old) / Number(prime);
    expect(retained).toBeGreaterThan(0.5);
    expect(retained).toBeLessThan(0.8);
  });

  it("is strictly increasing in rating at every age", () => {
    for (const age of [21, 25, 27, 31, 34, 37, 40]) {
      for (let rating = 60; rating < 99; rating++) {
        const lower = computePlayerTradeValue({
          ...BASE,
          age,
          overallRating: rating,
          potentialRating: rating,
          currentSalaryCents: 0n,
        });
        const higher = computePlayerTradeValue({
          ...BASE,
          age,
          overallRating: rating + 1,
          potentialRating: rating + 1,
          currentSalaryCents: 0n,
        });
        expect(higher, `rating ${rating + 1} vs ${rating} at age ${age}`).toBeGreaterThan(lower);
      }
    }
  });

  it("prices an expiring deal differently from a long one at the same salary", () => {
    // Contract length was invisible: `playerTradeValue` saw one season's salary
    // and `actions/trade.ts` fetched one row, so a five-year albatross and a
    // one-year expiring deal were the same asset and "take on bad years to get
    // a pick" was not a decision the game could express (T-P0-3 follow-up).
    const albatross = (extraYears: number) =>
      computePlayerTradeValue({
        ...BASE,
        overallRating: 70,
        potentialRating: 70,
        age: 33,
        currentSalaryCents: 50_000_000_00n,
        futureSalaryCents: Array.from({ length: extraYears }, () => 50_000_000_00n),
      });
    // Every extra year of a bad deal costs more to move.
    expect(albatross(4)).toBeLessThan(albatross(2));
    expect(albatross(2)).toBeLessThan(albatross(0));

    // And the reverse: a long team-friendly deal is worth MORE than an
    // expiring one, because the bargain repeats.
    const bargain = (extraYears: number) =>
      computePlayerTradeValue({
        ...BASE,
        overallRating: 85,
        potentialRating: 85,
        age: 27,
        currentSalaryCents: 20_000_000_00n,
        futureSalaryCents: Array.from({ length: extraYears }, () => 20_000_000_00n),
      });
    expect(bargain(4)).toBeGreaterThan(bargain(2));
    expect(bargain(2)).toBeGreaterThan(bargain(0));

    // Omitting the field entirely must behave exactly like an expiring deal,
    // so callers that genuinely only know this season keep the old behaviour.
    expect(
      computePlayerTradeValue({ ...BASE, overallRating: 70, age: 33, futureSalaryCents: [] }),
    ).toBe(computePlayerTradeValue({ ...BASE, overallRating: 70, age: 33 }));
  });

  it("separates an MVP from a good young role player by a real multiple", () => {
    // Reusing the salary curve (capped at 0.35 of the cap because a max
    // contract exists) compressed 70-99 into a 6.2x spread and priced the
    // reigning MVP at 0.94x a 78-rated 21-year-old, so two rotation players
    // bought a superstar (T-P0-3).
    const mvp = computePlayerTradeValue({
      ...BASE,
      overallRating: 98,
      potentialRating: 98,
      age: 27,
      currentSalaryCents: 0n,
    });
    const prospect = computePlayerTradeValue({
      ...BASE,
      overallRating: 78,
      potentialRating: 88,
      age: 21,
      currentSalaryCents: 0n,
    });
    expect(Number(mvp) / Number(prospect)).toBeGreaterThan(1.5);
  });
});
