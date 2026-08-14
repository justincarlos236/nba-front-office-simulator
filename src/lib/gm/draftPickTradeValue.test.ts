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

/**
 * docs/DRAFT_AUDIT.md D-P1-1. The projection used to hand the worst team pick
 * 1 outright, a certainty the post-2019 lottery removed, overvaluing its
 * future first by 47% - an asset a user could sell at that price, with tanking
 * as the way to acquire one.
 */
describe("future first-rounders are priced through the lottery", () => {
  const futureFirst = (percentile: number) =>
    computeDraftPickTradeValue({
      currentSeason: 2026,
      pickSeason: 2026,
      round: 1,
      overallPickNumber: null,
      originalTeamCompetitivenessPercentile: percentile,
    });

  const knownSlot = (pick: number) =>
    computeDraftPickTradeValue({
      currentSeason: 2026,
      pickSeason: 2026,
      round: 1,
      overallPickNumber: pick,
      originalTeamCompetitivenessPercentile: 0.5,
    });

  it("does not price the worst team's future first as pick 1", () => {
    expect(Number(futureFirst(0))).toBeLessThan(Number(knownSlot(1)) * 0.85);
  });

  it("still makes a bad team's pick worth more than a good team's", () => {
    expect(Number(futureFirst(0))).toBeGreaterThan(Number(futureFirst(0.5)));
    expect(Number(futureFirst(0.5))).toBeGreaterThan(Number(futureFirst(1)));
  });

  it("leaves a known slot untouched by the lottery path", () => {
    // Once the draft has run, there is no distribution left to average over.
    expect(knownSlot(1)).toBe(
      computeDraftPickTradeValue({
        currentSeason: 2026,
        pickSeason: 2026,
        round: 1,
        overallPickNumber: 1,
        originalTeamCompetitivenessPercentile: 0,
      }),
    );
  });

  it("leaves second-rounders on the deterministic path", () => {
    // The lottery does not touch round two.
    const worst = computeDraftPickTradeValue({
      currentSeason: 2026,
      pickSeason: 2026,
      round: 2,
      overallPickNumber: null,
      originalTeamCompetitivenessPercentile: 0,
    });
    expect(Number(worst)).toBeGreaterThan(0);
  });
});
