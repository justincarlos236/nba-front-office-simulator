import { describe, expect, it } from "vitest";
import { LOTTERY_ODDS, runLottery, type LotteryTeam, expectedLotterySlotForSeed } from "./draftLottery";

function teams(): LotteryTeam[] {
  return Array.from({ length: 14 }, (_, i) => ({
    leagueTeamId: `team-${i + 1}`,
    seed: i + 1,
  }));
}

describe("LOTTERY_ODDS", () => {
  it("sums to 100%", () => {
    const total = Object.values(LOTTERY_ODDS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 5);
  });

  it("gives the top 3 seeds identical odds (the 2019 reform's flattening)", () => {
    expect(LOTTERY_ODDS[1]).toBe(LOTTERY_ODDS[2]);
    expect(LOTTERY_ODDS[2]).toBe(LOTTERY_ODDS[3]);
  });

  it("strictly decreases from seed 4 onward", () => {
    for (let seed = 4; seed < 14; seed++) {
      expect(LOTTERY_ODDS[seed]).toBeGreaterThan(LOTTERY_ODDS[seed + 1]);
    }
  });
});

describe("runLottery", () => {
  it("returns every team exactly once", () => {
    const order = runLottery(teams(), Math.random);
    expect(order).toHaveLength(14);
    expect(new Set(order).size).toBe(14);
  });

  it("picks 5-14 are in strict reverse-seed order among non-winners", () => {
    const order = runLottery(teams(), Math.random);
    const restOrder = order.slice(4);
    const restSeeds = restOrder.map((id) => Number(id.split("-")[1]));
    const sorted = [...restSeeds].sort((a, b) => a - b);
    expect(restSeeds).toEqual(sorted);
  });

  it("the worst-record team wins the top pick under a favorable draw", () => {
    // rng() always returns near 0, so weightedDraw always picks the first
    // team in the (seed-ascending) remaining list each time.
    const order = runLottery(teams(), () => 0.0001);
    expect(order[0]).toBe("team-1");
  });

  it("is deterministic for a fixed rng", () => {
    const rng = () => 0.5;
    expect(runLottery(teams(), rng)).toEqual(runLottery(teams(), rng));
  });

  it("handles fewer than 14 teams without crashing", () => {
    const fewTeams = teams().slice(0, 5);
    const order = runLottery(fewTeams, Math.random);
    expect(order).toHaveLength(5);
    expect(new Set(order).size).toBe(5);
  });
});

describe("expectedLotterySlotForSeed", () => {
  /**
   * The regression this exists for. docs/DRAFT_AUDIT.md D-P1-1: the pick
   * projection assumed the worst team receives pick 1, a certainty the
   * post-2019 lottery explicitly removed, overvaluing a bottom team's future
   * first by 47%.
   */
  it("does not hand the worst team pick 1", () => {
    expect(expectedLotterySlotForSeed(1)).toBeGreaterThan(3);
  });

  it("agrees with a simulation of the same lottery", () => {
    const teams: LotteryTeam[] = Array.from({ length: 14 }, (_, i) => ({
      leagueTeamId: `S${i + 1}`,
      seed: i + 1,
    }));
    let s = 12345;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const totals = new Array(14).fill(0);
    const TRIALS = 40_000;
    for (let t = 0; t < TRIALS; t++) {
      const order = runLottery(teams, rng);
      order.forEach((id, slot) => {
        totals[Number(id.slice(1)) - 1] += slot + 1;
      });
    }
    for (let seed = 1; seed <= 14; seed++) {
      expect(totals[seed - 1] / TRIALS).toBeCloseTo(expectedLotterySlotForSeed(seed), 0);
    }
  });

  /**
   * The three worst records share a flat 14% of winning, but NOT the same
   * expected slot: if none of them wins a top-four pick they fall to picks 5,
   * 6 and 7 in record order. So the reward for being worse is real but small -
   * a fraction of a pick - which is precisely the anti-tanking design. An
   * earlier version of this test asserted the three were identical, which was
   * wrong about the lottery rather than about the code.
   */
  it("separates the three flat-odds seeds by well under one pick", () => {
    const gap = expectedLotterySlotForSeed(3) - expectedLotterySlotForSeed(1);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(1);
  });

  it("never improves a team's expectation by having a better record", () => {
    for (let seed = 2; seed <= 14; seed++) {
      expect(expectedLotterySlotForSeed(seed)).toBeGreaterThan(expectedLotterySlotForSeed(seed - 1));
    }
  });

  it("clamps out-of-range seeds rather than returning undefined", () => {
    expect(expectedLotterySlotForSeed(0)).toBe(expectedLotterySlotForSeed(1));
    expect(expectedLotterySlotForSeed(99)).toBe(expectedLotterySlotForSeed(14));
  });
});
