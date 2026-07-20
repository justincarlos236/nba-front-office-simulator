import { describe, expect, it } from "vitest";
import { LOTTERY_ODDS, runLottery, type LotteryTeam } from "./draftLottery";

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
