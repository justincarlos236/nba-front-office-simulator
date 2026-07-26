import { describe, expect, it } from "vitest";
import {
  getLotteryOverview,
  detectHeadlineProspect,
  computeMovement,
  detectNotableMovement,
} from "./lotteryPresentation";
import { LOTTERY_ODDS } from "./draftLottery";

describe("getLotteryOverview", () => {
  it("zips every seeded team with its real published odds", () => {
    const overview = getLotteryOverview([
      { leagueTeamId: "a", seed: 1 },
      { leagueTeamId: "b", seed: 14 },
    ]);
    expect(overview[0].oddsForNumberOnePickPct).toBe(LOTTERY_ODDS[1]);
    expect(overview[1].oddsForNumberOnePickPct).toBe(LOTTERY_ODDS[14]);
  });
});

describe("detectHeadlineProspect", () => {
  it("returns null for an empty class", () => {
    expect(detectHeadlineProspect([])).toBeNull();
  });

  it("returns null when the class's best prospect doesn't clear the real threshold", () => {
    const prospects = [
      { fullName: "A", position: "PG", potentialRating: 88 },
      { fullName: "B", position: "SF", potentialRating: 90 },
    ];
    expect(detectHeadlineProspect(prospects)).toBeNull();
  });

  it("surfaces the single highest-potential prospect once it clears the threshold", () => {
    const prospects = [
      { fullName: "A", position: "PG", potentialRating: 88 },
      { fullName: "Generational", position: "SF", potentialRating: 97 },
      { fullName: "C", position: "C", potentialRating: 91 },
    ];
    expect(detectHeadlineProspect(prospects)?.fullName).toBe("Generational");
  });
});

describe("computeMovement", () => {
  it("is positive for a team that jumped up and negative for a team that fell", () => {
    expect(computeMovement({ projectedSeed: 8, resultPickNumber: 3 })).toBe(5);
    expect(computeMovement({ projectedSeed: 2, resultPickNumber: 6 })).toBe(-4);
    expect(computeMovement({ projectedSeed: 5, resultPickNumber: 5 })).toBe(0);
  });
});

describe("detectNotableMovement", () => {
  it("returns null for both when nothing clears the threshold", () => {
    const results = [
      { projectedSeed: 1, resultPickNumber: 1 },
      { projectedSeed: 2, resultPickNumber: 3 },
    ];
    const { biggestJump, biggestFall } = detectNotableMovement(results);
    expect(biggestJump).toBeNull();
    expect(biggestFall).toBeNull();
  });

  it("finds the single biggest real jump and biggest real fall", () => {
    const results = [
      { projectedSeed: 10, resultPickNumber: 2, id: "jumper" }, // +8
      { projectedSeed: 3, resultPickNumber: 4, id: "small-move" }, // -1, below threshold
      { projectedSeed: 1, resultPickNumber: 9, id: "faller" }, // -8
      { projectedSeed: 5, resultPickNumber: 1, id: "small-jump" }, // +4, at threshold
    ];
    const { biggestJump, biggestFall } = detectNotableMovement(results);
    expect(biggestJump?.team.id).toBe("jumper");
    expect(biggestJump?.movement).toBe(8);
    expect(biggestFall?.team.id).toBe("faller");
    expect(biggestFall?.movement).toBe(-8);
  });
});
