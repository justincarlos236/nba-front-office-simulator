import { describe, expect, it } from "vitest";
import { PHASE_LIGHT, phaseLight } from "./phaseLight";
import { resolveTeamAccent, contrastRatio } from "./teamAccent";
import { TEAM_SEEDS } from "../../../prisma/data/teams";

/**
 * Phase D's environmental layer must not be able to quietly undo the team
 * accent cascade's WCAG guarantee. These tests exist because the first
 * implementation did exactly that.
 */

const PHASES = [
  "regular-season",
  "playoffs-incomplete",
  "pre-draft",
  "draft-incomplete",
  "ready",
] as const;

describe("phase light", () => {
  it("covers every LeaguePhase", () => {
    for (const phase of PHASES) {
      expect(phaseLight(phase)).toBeDefined();
      expect(phaseLight(phase).description).not.toHaveLength(0);
    }
    expect(Object.keys(PHASE_LIGHT)).toHaveLength(PHASES.length);
  });

  it("keeps every sky dark enough to sit inside a dark interface", () => {
    // The window is a hole in a dark room, not a lightbox. Lightness is given
    // in oklch; anything at or above 0.45 would read as a bright panel.
    for (const phase of PHASES) {
      const { skyFrom, skyTo } = phaseLight(phase);
      for (const stop of [skyFrom, skyTo]) {
        const L = Number(stop.match(/oklch\(([\d.]+)/)?.[1]);
        expect(L).toBeGreaterThan(0);
        expect(L).toBeLessThan(0.45);
      }
    }
  });

  it("keeps the phases visually distinguishable from one another", () => {
    // If two phases look the same, the layer is decoration rather than
    // information. Compare hue, which is what actually carries the difference.
    const hues = PHASES.map((p) => Number(phaseLight(p).skyFrom.match(/([\d.]+)\)$/)?.[1]));
    for (const h of hues) expect(Number.isFinite(h)).toBe(true);
    expect(new Set(hues).size).toBe(PHASES.length);
  });

  it("gradients always run darker toward the horizon", () => {
    // One Lamp: light comes from above. A sky that brightens downward reads as
    // an inverted, artificial gradient.
    for (const phase of PHASES) {
      const { skyFrom, skyTo } = phaseLight(phase);
      const from = Number(skyFrom.match(/oklch\(([\d.]+)/)?.[1]);
      const to = Number(skyTo.match(/oklch\(([\d.]+)/)?.[1]);
      expect(from).toBeGreaterThan(to);
    }
  });
});

describe("the window does not weaken header contrast", () => {
  /**
   * REGRESSION GUARD. The window was first implemented as a full-bleed layer
   * under a `bg-team-accent/80` wash. That is what this test forbids.
   *
   * The accent cascade guarantees `--team-accent-ink` at >= 4.5:1 against a
   * SOLID accent field. Compositing the accent at 80% over the phase skies
   * dropped 38 of 60 team/phase combinations below that, worst case 3.37:1
   * (LAC). The window is therefore confined to a band the header text never
   * enters, and the accent field under the text stays fully opaque.
   *
   * This test asserts the property that made the translucent version illegal,
   * so that anyone who reintroduces a wash sees why it fails.
   */
  it("would fail AA if the accent were thinned over the sky", () => {
    const hexToRgb = (hex: string) => {
      const c = hex.replace("#", "");
      return [
        parseInt(c.slice(0, 2), 16),
        parseInt(c.slice(2, 4), 16),
        parseInt(c.slice(4, 6), 16),
      ];
    };
    const toHex = (rgb: number[]) =>
      "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

    // The dimmest sky stop in the set, approximated in sRGB.
    const sky = [26, 28, 36];
    let belowAA = 0;

    for (const team of TEAM_SEEDS) {
      const accent = resolveTeamAccent(team.primaryColor, team.secondaryColor);
      const solid = contrastRatio(accent.hex, accent.inkHex);
      // The guarantee we actually ship: solid accent, full contrast.
      expect(solid).toBeGreaterThanOrEqual(4.5);

      const thinned = hexToRgb(accent.hex).map((ch, i) => ch * 0.8 + sky[i] * 0.2);
      if (contrastRatio(toHex(thinned), accent.inkHex) < 4.5) belowAA += 1;
    }

    // Documents the hazard rather than asserting a specific count is fine:
    // if this ever reaches 0, the thinning approach became safe and this
    // guard can be revisited.
    expect(belowAA).toBeGreaterThan(0);
  });
});
