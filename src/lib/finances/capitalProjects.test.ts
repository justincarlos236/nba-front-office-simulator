import { describe, it, expect } from "vitest";
import {
  capitalProjectCostCents,
  capitalProjectDurationSeasons,
  capitalProjectCompletionSeason,
  sumCompletedProjectEffects,
  computeConstructionAttendancePenalty,
  ARENA_PROJECT_KINDS,
  BUSINESS_EXPANSION_PROJECT_KINDS,
} from "./capitalProjects";

describe("capitalProjectCostCents / capitalProjectDurationSeasons", () => {
  it("every project has a positive cost and duration", () => {
    for (const kind of [...ARENA_PROJECT_KINDS, ...BUSINESS_EXPANSION_PROJECT_KINDS]) {
      expect(capitalProjectCostCents(kind)).toBeGreaterThan(0);
      expect(capitalProjectDurationSeasons(kind)).toBeGreaterThan(0);
    }
  });

  it("a new arena build costs dramatically more than a renovation", () => {
    expect(capitalProjectCostCents("ARENA_NEW_BUILD")).toBeGreaterThan(
      capitalProjectCostCents("ARENA_RENOVATION") * 3,
    );
  });

  it("a new arena build takes longer than a renovation", () => {
    expect(capitalProjectDurationSeasons("ARENA_NEW_BUILD")).toBeGreaterThan(
      capitalProjectDurationSeasons("ARENA_RENOVATION"),
    );
  });
});

describe("capitalProjectCompletionSeason", () => {
  it("adds the duration to the start season", () => {
    expect(capitalProjectCompletionSeason("ARENA_RENOVATION", 2025)).toBe(
      2025 + capitalProjectDurationSeasons("ARENA_RENOVATION"),
    );
  });
});

describe("sumCompletedProjectEffects", () => {
  it("returns all-zero/false for no completed projects", () => {
    const totals = sumCompletedProjectEffects([]);
    expect(totals.arenaQualityBonus).toBe(0);
    expect(totals.resetsArenaAge).toBe(false);
    expect(totals.recurringIncomeCents).toBe(0);
  });

  it("sums player development bonuses across multiple completed projects", () => {
    const totals = sumCompletedProjectEffects(["GLEAGUE_AFFILIATE", "PRACTICE_FACILITY"]);
    expect(totals.playerDevelopmentBonus).toBeGreaterThan(0);
    expect(totals.playerDevelopmentBonus).toBeCloseTo(
      sumCompletedProjectEffects(["GLEAGUE_AFFILIATE"]).playerDevelopmentBonus +
        sumCompletedProjectEffects(["PRACTICE_FACILITY"]).playerDevelopmentBonus,
    );
  });

  it("a completed new arena build resets arena age and extends the lease", () => {
    const totals = sumCompletedProjectEffects(["ARENA_NEW_BUILD"]);
    expect(totals.resetsArenaAge).toBe(true);
    expect(totals.extendsLeaseYears).toBeGreaterThan(0);
  });

  it("a completed real estate/media arm produces recurring income; a G-League affiliate does not", () => {
    expect(sumCompletedProjectEffects(["REAL_ESTATE_MEDIA"]).recurringIncomeCents).toBeGreaterThan(
      0,
    );
    expect(sumCompletedProjectEffects(["GLEAGUE_AFFILIATE"]).recurringIncomeCents).toBe(0);
  });
});

describe("computeConstructionAttendancePenalty", () => {
  it("is zero with no arena project under construction", () => {
    expect(computeConstructionAttendancePenalty([])).toBe(0);
    expect(computeConstructionAttendancePenalty(["GLEAGUE_AFFILIATE"])).toBe(0);
  });

  it("a new-build under construction costs more attendance than a renovation", () => {
    expect(computeConstructionAttendancePenalty(["ARENA_NEW_BUILD"])).toBeGreaterThan(
      computeConstructionAttendancePenalty(["ARENA_RENOVATION"]),
    );
  });
});
