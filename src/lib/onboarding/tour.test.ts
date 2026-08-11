import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TOUR_ANCHORS,
  TOUR_STEPS,
  runnableSteps,
  shouldAutoLaunchTour,
  tourProgressLabel,
  type TourStep,
} from "./tour";

describe("shouldAutoLaunchTour", () => {
  it("opens for a brand-new player in their first franchise", () => {
    expect(shouldAutoLaunchTour({ onboardingCompletedAt: null, leagueCount: 1 })).toBe(true);
  });

  it("never opens again once completed or skipped", () => {
    expect(
      shouldAutoLaunchTour({ onboardingCompletedAt: new Date("2026-01-01"), leagueCount: 1 }),
    ).toBe(false);
  });

  /**
   * The difference between onboarding and an interruption. Completion is stored
   * on the user rather than the league precisely so a second save is silent.
   */
  it("does not re-trigger on a second franchise", () => {
    expect(shouldAutoLaunchTour({ onboardingCompletedAt: null, leagueCount: 2 })).toBe(false);
  });
});

describe("tour shape", () => {
  it("stays short - a tour that outgrows six steps has become a course", () => {
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(6);
  });

  it("gives every step a way out, so no step can trap the player", () => {
    for (const step of TOUR_STEPS) {
      expect(step.buttonLabel.length).toBeGreaterThan(0);
    }
  });

  it("keeps copy short enough to read at a glance", () => {
    // The whole design target is that the player spends the tour looking at
    // the simulator, not reading it. 240 characters is roughly two sentences.
    for (const step of TOUR_STEPS) {
      expect(step.body.length, `step "${step.id}" body is too long`).toBeLessThanOrEqual(240);
      expect(step.title.length, `step "${step.id}" title is too long`).toBeLessThanOrEqual(60);
    }
  });

  it("has unique step ids", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
  });

  it("visits at most two screens", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.path)).size).toBeLessThanOrEqual(2);
  });

  it("starts and ends on the dashboard", () => {
    expect(TOUR_STEPS[0].path).toBe("");
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].path).toBe("");
  });
});

/**
 * The anti-rot test, and the reason this tour is defensible at all.
 *
 * `docs/ONBOARDING_DESIGN.md` rejected coach-mark tours partly because they go
 * stale silently: someone renames an element months later and a step quietly
 * starts pointing at nothing. This asserts every anchor the tour needs is
 * really present in the source, so that rename fails in CI instead of in front
 * of a new player.
 */
describe("tour anchors exist in the app", () => {
  const SRC = path.join(__dirname, "..", "..");

  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "generated" || entry.name === "node_modules") continue;
        sourceFiles(full, acc);
      } else if (entry.name.endsWith(".tsx")) {
        acc.push(full);
      }
    }
    return acc;
  }

  const allSource = sourceFiles(SRC)
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");

  for (const anchor of TOUR_ANCHORS) {
    it(`finds data-tour="${anchor}" in a real component`, () => {
      expect(allSource).toContain(`data-tour="${anchor}"`);
    });
  }
});

describe("runnableSteps", () => {
  const steps: TourStep[] = [
    { id: "a", path: "", anchor: null, title: "t", body: "b", buttonLabel: "Next" },
    { id: "b", path: "", anchor: "present", title: "t", body: "b", buttonLabel: "Next" },
    { id: "c", path: "", anchor: "missing", title: "t", body: "b", buttonLabel: "Next" },
    { id: "d", path: "/rotation", anchor: "elsewhere", title: "t", body: "b", buttonLabel: "Next" },
  ];
  const exists = (a: string) => a === "present";

  it("drops a step whose element is gone rather than spotlighting nothing", () => {
    expect(runnableSteps(steps, "", exists).map((s) => s.id)).toEqual(["a", "b", "d"]);
  });

  it("keeps steps belonging to another screen, whose anchors are not loaded yet", () => {
    expect(runnableSteps(steps, "", exists).some((s) => s.id === "d")).toBe(true);
  });

  it("keeps anchorless steps", () => {
    expect(runnableSteps(steps, "", () => false).some((s) => s.id === "a")).toBe(true);
  });
});

describe("tourProgressLabel", () => {
  it("is one-indexed for humans", () => {
    expect(tourProgressLabel(0, 6)).toBe("1 / 6");
    expect(tourProgressLabel(5, 6)).toBe("6 / 6");
  });
});
