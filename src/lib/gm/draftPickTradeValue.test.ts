import { describe, expect, it } from "vitest";
import { computeDraftPickTradeValue, type DraftPickTradeValueInput } from "./draftPickTradeValue";

const BASE: DraftPickTradeValueInput = {
  currentSeason: 2023,
  pickSeason: 2023,
  round: 1,
  overallPickNumber: 15,
  originalTeamCompetitivenessPercentile: 0.5,
};

describe("computeDraftPickTradeValue", () => {
  it("values a known lottery pick more than a known late first-rounder", () => {
    const lottery = computeDraftPickTradeValue({ ...BASE, overallPickNumber: 1 });
    const late = computeDraftPickTradeValue({ ...BASE, overallPickNumber: 29 });
    expect(lottery).toBeGreaterThan(late);
  });

  it("projects a future pick's value from the original team's competitiveness", () => {
    const badTeamPick = computeDraftPickTradeValue({
      ...BASE,
      overallPickNumber: null,
      originalTeamCompetitivenessPercentile: 0.05,
    });
    const goodTeamPick = computeDraftPickTradeValue({
      ...BASE,
      overallPickNumber: null,
      originalTeamCompetitivenessPercentile: 0.95,
    });
    expect(badTeamPick).toBeGreaterThan(goodTeamPick);
  });

  it("discounts a pick further out in the future", () => {
    const nextYear = computeDraftPickTradeValue({
      ...BASE,
      overallPickNumber: null,
      pickSeason: 2024,
    });
    const fiveYearsOut = computeDraftPickTradeValue({
      ...BASE,
      overallPickNumber: null,
      pickSeason: 2028,
    });
    expect(fiveYearsOut).toBeLessThan(nextYear);
  });

  it("values a 2nd-round pick much less than an equivalent 1st-rounder", () => {
    const firstRound = computeDraftPickTradeValue({ ...BASE, round: 1, overallPickNumber: 15 });
    const secondRound = computeDraftPickTradeValue({ ...BASE, round: 2, overallPickNumber: 45 });
    expect(secondRound).toBeLessThan(firstRound / 2n);
  });

  it("never returns a negative value", () => {
    const value = computeDraftPickTradeValue({
      ...BASE,
      round: 2,
      overallPickNumber: 60,
      pickSeason: 2033,
    });
    expect(value).toBeGreaterThanOrEqual(0n);
  });
});
