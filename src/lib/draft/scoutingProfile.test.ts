import { describe, expect, it } from "vitest";
import {
  deriveScoutingProfile,
  computeScoutingConfidence,
  generateScoutingReport,
} from "./scoutingProfile";

describe("deriveScoutingProfile", () => {
  it("keeps every attribute within [25, 99]", () => {
    const profile = deriveScoutingProfile({ id: "p1", overallRating: 90, position: "C" });
    for (const value of [
      profile.scoring,
      profile.playmaking,
      profile.defense,
      profile.rebounding,
      profile.athleticism,
    ]) {
      expect(value).toBeGreaterThanOrEqual(25);
      expect(value).toBeLessThanOrEqual(99);
    }
  });

  it("returns exactly 2 strengths and 2 weaknesses, non-overlapping", () => {
    const profile = deriveScoutingProfile({ id: "p2", overallRating: 70, position: "SF" });
    expect(profile.strengths).toHaveLength(2);
    expect(profile.weaknesses).toHaveLength(2);
    for (const s of profile.strengths) {
      expect(profile.weaknesses).not.toContain(s);
    }
  });

  it("skews centers toward rebounding/defense over playmaking", () => {
    const center = deriveScoutingProfile({ id: "center-1", overallRating: 70, position: "C" });
    expect(center.rebounding).toBeGreaterThan(center.playmaking);
  });

  it("skews point guards toward playmaking over rebounding", () => {
    const pg = deriveScoutingProfile({ id: "pg-1", overallRating: 70, position: "PG" });
    expect(pg.playmaking).toBeGreaterThan(pg.rebounding);
  });

  it("is deterministic for the same prospect id", () => {
    const a = deriveScoutingProfile({ id: "same-id", overallRating: 65, position: "SG" });
    const b = deriveScoutingProfile({ id: "same-id", overallRating: 65, position: "SG" });
    expect(a).toEqual(b);
  });

  it("gives different prospects different profiles", () => {
    const a = deriveScoutingProfile({ id: "id-a", overallRating: 65, position: "SG" });
    const b = deriveScoutingProfile({ id: "id-b", overallRating: 65, position: "SG" });
    expect(a).not.toEqual(b);
  });
});

describe("computeScoutingConfidence", () => {
  it("gives one-and-done-age prospects low confidence", () => {
    expect(computeScoutingConfidence(19)).toBe("LOW");
  });

  it("gives typical draft-age prospects medium confidence", () => {
    expect(computeScoutingConfidence(20)).toBe("MEDIUM");
    expect(computeScoutingConfidence(21)).toBe("MEDIUM");
  });

  it("gives older, more-tested prospects high confidence", () => {
    expect(computeScoutingConfidence(22)).toBe("HIGH");
  });
});

describe("generateScoutingReport", () => {
  const prospect = { id: "p-report-1", overallRating: 72, potentialRating: 88, age: 20 };

  it("never touches overallRating/potentialRating - only the report changes across depths", () => {
    generateScoutingReport(prospect, 0);
    generateScoutingReport(prospect, 3);
    expect(prospect.overallRating).toBe(72);
    expect(prospect.potentialRating).toBe(88);
  });

  it("Known (depth 3) narrows the ceiling range to a single exact number matching potentialRating", () => {
    const report = generateScoutingReport(prospect, 3);
    expect(report.ceilingRangeLabel).toBe("88");
  });

  it("Unknown (depth 0) gives a wide ceiling range around the true potential", () => {
    const report = generateScoutingReport(prospect, 0);
    expect(report.ceilingRangeLabel).toContain("-");
    const [low, high] = report.ceilingRangeLabel.split("-").map(Number);
    expect(low).toBeLessThan(88);
    expect(high).toBeGreaterThan(88);
  });

  it("confidence label matches Scouting Depth", () => {
    expect(generateScoutingReport(prospect, 0).confidence).toBe("SPECULATIVE");
    expect(generateScoutingReport(prospect, 3).confidence).toBe("DEFINITIVE");
  });

  it("Known (depth 3) never returns UNCERTAIN on any axis", () => {
    for (let i = 0; i < 30; i++) {
      const report = generateScoutingReport({ ...prospect, id: `known-${i}` }, 3);
      expect(report.bustRisk).not.toBe("UNCERTAIN");
      expect(report.trajectory).not.toBe("UNCERTAIN");
      expect(report.workEthic).not.toBe("UNCERTAIN");
      expect(report.readiness).not.toBe("UNCERTAIN");
      expect(report.injuryOutlook).not.toBe("UNCERTAIN");
    }
  });

  it("Unknown (depth 0) produces at least some UNCERTAIN or wrong reads across many prospects", () => {
    let sawUncertain = false;
    for (let i = 0; i < 30; i++) {
      const report = generateScoutingReport(
        { id: `unknown-${i}`, overallRating: 72, potentialRating: 88, age: 20 },
        0,
      );
      if (
        report.bustRisk === "UNCERTAIN" ||
        report.trajectory === "UNCERTAIN" ||
        report.workEthic === "UNCERTAIN" ||
        report.readiness === "UNCERTAIN" ||
        report.injuryOutlook === "UNCERTAIN"
      ) {
        sawUncertain = true;
      }
    }
    expect(sawUncertain).toBe(true);
  });

  it("is deterministic for the same prospect id and depth", () => {
    const a = generateScoutingReport(prospect, 2);
    const b = generateScoutingReport(prospect, 2);
    expect(a).toEqual(b);
  });

  it("a young prospect with a huge rating/potential gap reads high bust risk at full depth", () => {
    const boomOrBust = { id: "boom-bust", overallRating: 62, potentialRating: 95, age: 19 };
    const report = generateScoutingReport(boomOrBust, 3);
    expect(report.bustRisk).toBe("HIGH");
  });

  it("a veteran-aged, high-rated prospect reads NBA-ready now at full depth", () => {
    const readyNow = { id: "ready-now", overallRating: 78, potentialRating: 80, age: 22 };
    const report = generateScoutingReport(readyNow, 3);
    expect(report.readiness).toBe("READY_NOW");
  });

  it("clamps an out-of-range depth rather than throwing or indexing undefined", () => {
    expect(() => generateScoutingReport(prospect, -5)).not.toThrow();
    expect(() => generateScoutingReport(prospect, 99)).not.toThrow();
    expect(generateScoutingReport(prospect, 99).confidence).toBe("DEFINITIVE");
    expect(generateScoutingReport(prospect, -5).confidence).toBe("SPECULATIVE");
  });

  describe("resolvedAxes (Private Workout)", () => {
    it("a resolved axis is never UNCERTAIN even at Unknown depth (0), across many prospects", () => {
      for (let i = 0; i < 30; i++) {
        const p = { id: `resolved-work-${i}`, overallRating: 70, potentialRating: 85, age: 20 };
        const report = generateScoutingReport(p, 0, ["WORK_ETHIC"]);
        expect(report.workEthic).not.toBe("UNCERTAIN");
      }
      for (let i = 0; i < 30; i++) {
        const p = { id: `resolved-injury-${i}`, overallRating: 70, potentialRating: 85, age: 20 };
        const report = generateScoutingReport(p, 0, ["INJURY_OUTLOOK"]);
        expect(report.injuryOutlook).not.toBe("UNCERTAIN");
      }
    });

    it("a resolved axis returns the same value regardless of Depth", () => {
      const p = { id: "stable-across-depth", overallRating: 70, potentialRating: 85, age: 20 };
      const atZero = generateScoutingReport(p, 0, ["WORK_ETHIC", "INJURY_OUTLOOK"]);
      const atMax = generateScoutingReport(p, 3, ["WORK_ETHIC", "INJURY_OUTLOOK"]);
      expect(atZero.workEthic).toBe(atMax.workEthic);
      expect(atZero.injuryOutlook).toBe(atMax.injuryOutlook);
    });

    it("resolving one axis doesn't change the other resolved axis's value", () => {
      const p = { id: "both-axes-consistent", overallRating: 70, potentialRating: 85, age: 20 };
      const workOnly = generateScoutingReport(p, 1, ["WORK_ETHIC"]);
      const both = generateScoutingReport(p, 1, ["WORK_ETHIC", "INJURY_OUTLOOK"]);
      expect(workOnly.workEthic).toBe(both.workEthic);
    });

    it("leaving resolvedAxes empty (or omitted) behaves exactly as before this feature", () => {
      const withDefault = generateScoutingReport(prospect, 1);
      const withEmptyArray = generateScoutingReport(prospect, 1, []);
      expect(withDefault).toEqual(withEmptyArray);
    });

    it("never touches overallRating/potentialRating even when resolving hidden axes", () => {
      const p = {
        id: "resolved-never-touches-ratings",
        overallRating: 70,
        potentialRating: 85,
        age: 20,
      };
      generateScoutingReport(p, 0, ["WORK_ETHIC", "INJURY_OUTLOOK"]);
      expect(p.overallRating).toBe(70);
      expect(p.potentialRating).toBe(85);
    });
  });
});
