import { describe, it, expect } from "vitest";
import {
  computeJobSituation,
  computeJobOffer,
  computeStrengthPercentiles,
  computeStrengthByTeam,
} from "./jobMarket";

describe("computeJobSituation", () => {
  it("buckets by strength percentile", () => {
    expect(computeJobSituation(1.0)).toBe("CONTENDER");
    expect(computeJobSituation(0.85)).toBe("CONTENDER");
    expect(computeJobSituation(0.7)).toBe("PLAYOFF_CONTENDER");
    expect(computeJobSituation(0.5)).toBe("RETOOLING");
    expect(computeJobSituation(0.25)).toBe("REBUILD");
    expect(computeJobSituation(0.0)).toBe("BOTTOMING_OUT");
  });
});

describe("computeJobOffer", () => {
  it("locks a contender job for a neutral-reputation GM but opens it for a proven one", () => {
    const rookieGm = computeJobOffer(0.95, 50);
    const provenGm = computeJobOffer(0.95, 80);
    expect(rookieGm.situation).toBe("CONTENDER");
    expect(rookieGm.available).toBe(false);
    expect(provenGm.available).toBe(true);
  });

  it("offers a rebuild to anyone, even a battered reputation", () => {
    const offer = computeJobOffer(0.1, 10);
    expect(offer.situation).toBe("BOTTOMING_OUT");
    expect(offer.available).toBe(true);
  });

  it("a neutral GM can take a playoff-caliber job but not a contender", () => {
    expect(computeJobOffer(0.7, 50).available).toBe(true); // PLAYOFF_CONTENDER, req 50
    expect(computeJobOffer(0.9, 50).available).toBe(false); // CONTENDER, req 70
  });

  it("gives a contender a shorter leash (lower starting confidence) than a rebuild", () => {
    const contender = computeJobOffer(0.95, 90);
    const rebuild = computeJobOffer(0.25, 90);
    expect(contender.startingOwnerConfidence).toBeLessThan(rebuild.startingOwnerConfidence);
  });
});

describe("computeStrengthByTeam + computeStrengthPercentiles", () => {
  it("weights the roster and ranks the strongest team at percentile 1", () => {
    const strengths = computeStrengthByTeam([
      { teamId: "strong", overallRating: 90 },
      { teamId: "strong", overallRating: 88 },
      { teamId: "weak", overallRating: 66 },
      { teamId: "weak", overallRating: 64 },
      { teamId: "mid", overallRating: 76 },
      { teamId: null, overallRating: 99 }, // free agent - ignored
    ]);
    expect(strengths.get("strong")!).toBeGreaterThan(strengths.get("mid")!);
    expect(strengths.get("mid")!).toBeGreaterThan(strengths.get("weak")!);

    const pct = computeStrengthPercentiles(strengths);
    expect(pct.get("strong")).toBe(1);
    expect(pct.get("weak")).toBe(0);
    expect(pct.get("mid")).toBeCloseTo(0.5, 5);
  });
});
