import { describe, expect, it } from "vitest";
import { scoreProspectForTeam, pickBestProspectForTeam, type DraftAiTeamContext } from "./draftAi";

function zeroNoiseRng(): () => number {
  // 0.5 zeroes out the (rng() - 0.5) noise term exactly.
  return () => 0.5;
}

function team(overrides: Partial<DraftAiTeamContext> = {}): DraftAiTeamContext {
  return { identity: "PLAYOFF_TEAM", needs: [], personality: "BALANCED", ...overrides };
}

const safeProspect = {
  id: "safe",
  position: "SF" as const,
  overallRating: 80,
  potentialRating: 82,
};
const upsideProspect = {
  id: "upside",
  position: "SF" as const,
  overallRating: 68,
  potentialRating: 95,
};

describe("scoreProspectForTeam", () => {
  it("weights a rebuilding team toward the higher-potential prospect over the safer one", () => {
    const rebuilding = team({ identity: "REBUILDING" });
    const safeScore = scoreProspectForTeam(safeProspect, rebuilding, zeroNoiseRng());
    const upsideScore = scoreProspectForTeam(upsideProspect, rebuilding, zeroNoiseRng());
    expect(upsideScore).toBeGreaterThan(safeScore);
  });

  it("weights a contending team toward the safer, higher-floor prospect over the raw upside one", () => {
    const contender = team({ identity: "CONTENDER" });
    const safeScore = scoreProspectForTeam(safeProspect, contender, zeroNoiseRng());
    const upsideScore = scoreProspectForTeam(upsideProspect, contender, zeroNoiseRng());
    expect(safeScore).toBeGreaterThan(upsideScore);
  });

  it("scores a need-filling prospect above a similarly-rated non-fitting one", () => {
    const pgNeed = team({ needs: ["POINT_GUARD"] });
    const noNeed = team({ needs: [] });
    const pointGuard = {
      id: "pg",
      position: "PG" as const,
      overallRating: 75,
      potentialRating: 78,
    };
    const withNeed = scoreProspectForTeam(pointGuard, pgNeed, zeroNoiseRng());
    const withoutNeed = scoreProspectForTeam(pointGuard, noNeed, zeroNoiseRng());
    expect(withNeed).toBeGreaterThan(withoutNeed);
  });

  it("PROSPECT_LOVER weights potential more than BALANCED for identical inputs", () => {
    const lover = team({ personality: "PROSPECT_LOVER" });
    const balanced = team({ personality: "BALANCED" });
    const loverScore = scoreProspectForTeam(upsideProspect, lover, zeroNoiseRng());
    const balancedScore = scoreProspectForTeam(upsideProspect, balanced, zeroNoiseRng());
    expect(loverScore).toBeGreaterThan(balancedScore);
  });

  it("never lets noise flip an overwhelming talent gap", () => {
    const elite = { id: "elite", position: "SF" as const, overallRating: 95, potentialRating: 97 };
    const weak = { id: "weak", position: "SF" as const, overallRating: 60, potentialRating: 62 };
    const t = team();
    // Sweep the full noise range for both prospects - even the most
    // favorable/unfavorable draw for each side should never flip this.
    for (const rngValue of [0, 0.25, 0.5, 0.75, 1]) {
      const eliteScore = scoreProspectForTeam(elite, t, () => rngValue);
      const weakScore = scoreProspectForTeam(weak, t, () => 1 - rngValue);
      expect(eliteScore).toBeGreaterThan(weakScore);
    }
  });
});

describe("pickBestProspectForTeam", () => {
  it("picks the strict argmax of scoreProspectForTeam", () => {
    const board = [safeProspect, upsideProspect];
    const rebuilding = team({ identity: "REBUILDING" });
    expect(pickBestProspectForTeam(board, rebuilding, zeroNoiseRng()).id).toBe("upside");
  });

  it("throws on an empty board rather than silently returning undefined", () => {
    expect(() => pickBestProspectForTeam([], team(), zeroNoiseRng())).toThrow();
  });
});
