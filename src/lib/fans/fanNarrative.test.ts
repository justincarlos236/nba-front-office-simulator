import { describe, it, expect } from "vitest";
import {
  buildIconDepartureFalloutOpening,
  shouldCloseIconDepartureFallout,
  buildIconDepartureFalloutResolution,
  trajectoryNarrativeConditionHolds,
  buildRebuildProgressWatchOpening,
  buildRebuildProgressWatchResolution,
  buildChampionshipWindowWatchOpening,
  buildChampionshipWindowWatchResolution,
} from "./fanNarrative";

describe("ICON_DEPARTURE_FALLOUT", () => {
  it("names the real player and distinguishes a trade from a free-agency loss", () => {
    const traded = buildIconDepartureFalloutOpening("Marcus Reed", true);
    const walked = buildIconDepartureFalloutOpening("Marcus Reed", false);
    expect(traded.headline).toContain("Marcus Reed");
    expect(traded.headline).toContain("Trade");
    expect(walked.headline).toContain("Departure");
  });

  it("stays open while happiness hasn't recovered and the max duration hasn't elapsed", () => {
    expect(shouldCloseIconDepartureFallout({ seasonsOpen: 1, happinessRecoveryDelta: -10 })).toBe(
      false,
    );
  });

  it("closes once happiness has meaningfully recovered", () => {
    expect(shouldCloseIconDepartureFallout({ seasonsOpen: 1, happinessRecoveryDelta: 0 })).toBe(
      true,
    );
  });

  it("closes after the max duration regardless of recovery", () => {
    expect(shouldCloseIconDepartureFallout({ seasonsOpen: 3, happinessRecoveryDelta: -20 })).toBe(
      true,
    );
  });

  it("resolution text differs based on whether happiness actually recovered", () => {
    const recovered = buildIconDepartureFalloutResolution("Marcus Reed", {
      seasonsOpen: 1,
      happinessRecoveryDelta: 0,
    });
    const notRecovered = buildIconDepartureFalloutResolution("Marcus Reed", {
      seasonsOpen: 3,
      happinessRecoveryDelta: -15,
    });
    expect(recovered).not.toBe(notRecovered);
    expect(recovered).toContain("Marcus Reed");
    expect(notRecovered).toContain("Marcus Reed");
  });
});

describe("trajectoryNarrativeConditionHolds", () => {
  it("REBUILD_PROGRESS_WATCH holds only while SHOW_ME_PROGRESS is the active mandate", () => {
    expect(trajectoryNarrativeConditionHolds("REBUILD_PROGRESS_WATCH", "SHOW_ME_PROGRESS")).toBe(
      true,
    );
    expect(
      trajectoryNarrativeConditionHolds("REBUILD_PROGRESS_WATCH", "BE_PATIENT_WITH_THE_KIDS"),
    ).toBe(false);
  });

  it("CHAMPIONSHIP_WINDOW_WATCH holds only while CHAMPIONSHIP_OR_BUST is the active mandate", () => {
    expect(
      trajectoryNarrativeConditionHolds("CHAMPIONSHIP_WINDOW_WATCH", "CHAMPIONSHIP_OR_BUST"),
    ).toBe(true);
    expect(trajectoryNarrativeConditionHolds("CHAMPIONSHIP_WINDOW_WATCH", "WIN_NOW")).toBe(false);
  });
});

describe("trajectory narrative resolution text", () => {
  it("rebuild resolution differs based on whether the mandate resolved favorably", () => {
    const succeeded = buildRebuildProgressWatchResolution(true);
    const failed = buildRebuildProgressWatchResolution(false);
    expect(succeeded).not.toBe(failed);
  });

  it("championship-window resolution differs based on whether a title was won", () => {
    const won = buildChampionshipWindowWatchResolution(true);
    const lost = buildChampionshipWindowWatchResolution(false);
    expect(won).not.toBe(lost);
  });

  it("openings produce non-empty headline and body", () => {
    const rebuild = buildRebuildProgressWatchOpening();
    const championship = buildChampionshipWindowWatchOpening();
    expect(rebuild.headline.length).toBeGreaterThan(0);
    expect(rebuild.body.length).toBeGreaterThan(0);
    expect(championship.headline.length).toBeGreaterThan(0);
    expect(championship.body.length).toBeGreaterThan(0);
  });
});
