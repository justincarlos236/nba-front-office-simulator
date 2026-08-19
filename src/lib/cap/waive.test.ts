import { describe, expect, it } from "vitest";
import { computeWaiveCost } from "./waive";
import { computeCapSheet } from "./capSheet";

const M = (millions: number) => BigInt(Math.round(millions * 1_000_000 * 100));

describe("computeWaiveCost", () => {
  const deal = [
    { season: 2026, guaranteedCents: M(20) },
    { season: 2027, guaranteedCents: M(21) },
    { season: 2028, guaranteedCents: M(22) },
  ];

  it("charges every season still owed, earliest first", () => {
    const cost = computeWaiveCost({ years: deal, fromSeason: 2026 });
    expect(cost.years.map((y) => y.season)).toEqual([2026, 2027, 2028]);
    expect(cost.totalCents).toBe(M(63));
  });

  it("does not charge seasons already played", () => {
    // Releasing in the final year costs that year alone. A club has already
    // paid the earlier ones and they are behind it.
    const cost = computeWaiveCost({ years: deal, fromSeason: 2028 });
    expect(cost.totalCents).toBe(M(22));
    expect(cost.futureSeasons).toBe(0);
  });

  it("separates this season's hit from the tail", () => {
    // The two numbers a user decides on: what it does to me now, and how long
    // I carry it.
    const cost = computeWaiveCost({ years: deal, fromSeason: 2026 });
    expect(cost.currentSeasonCents).toBe(M(20));
    expect(cost.futureSeasons).toBe(2);
  });

  it("costs nothing for a player with no guaranteed money left", () => {
    const cost = computeWaiveCost({
      years: [{ season: 2026, guaranteedCents: 0n }],
      fromSeason: 2026,
    });
    expect(cost.totalCents).toBe(0n);
    expect(cost.years).toEqual([]);
  });

  it("costs nothing when there is no contract at all", () => {
    expect(computeWaiveCost({ years: [], fromSeason: 2026 }).totalCents).toBe(0n);
  });
});

describe("a release does not create cap room", () => {
  it("moves the salary onto the cap sheet rather than deleting it", () => {
    // The point of the whole mechanic. Waiving moves the money off the roster
    // and onto the sheet as dead money; it does not remove it. If the released
    // salary ever left the total, releasing would be a way to erase a contract.
    const season = 2026;
    const salary = M(20);
    const others = [
      { playerId: "b", salaryCents: M(10) },
      { playerId: "c", salaryCents: M(10) },
    ];

    const before = computeCapSheet({
      season,
      contracts: [{ playerId: "a", salaryCents: salary }, ...others],
      deadMoneyCents: 0n,
    });

    const cost = computeWaiveCost({
      years: [{ season, guaranteedCents: salary }],
      fromSeason: season,
    });
    const after = computeCapSheet({
      season,
      contracts: others,
      deadMoneyCents: cost.totalCents,
    });

    expect(after.deadMoneyCents).toBe(salary);
    expect(after.committedSalaryCents).toBe(before.committedSalaryCents - salary);
    // Every cent that left the roster is still charged somewhere.
    expect(after.committedSalaryCents + after.deadMoneyCents).toBe(before.committedSalaryCents);
    expect(after.capSpaceCents).toBeLessThanOrEqual(before.capSpaceCents);
  });

  it("adds an incomplete-roster charge for the spot the release opened", () => {
    // Not a rounding artefact and not a bug: a club below the roster floor is
    // charged for each empty spot, so releasing without replacing costs
    // slightly *more* than the contract did. Releasing to create room is worse
    // than it looks, which is the right lesson for the sheet to teach.
    const season = 2026;
    const salary = M(20);
    const before = computeCapSheet({
      season,
      contracts: [{ playerId: "a", salaryCents: salary }],
      deadMoneyCents: 0n,
    });
    const after = computeCapSheet({ season, contracts: [], deadMoneyCents: salary });

    expect(after.totalSalaryCents).toBeGreaterThan(before.totalSalaryCents);
  });
});
