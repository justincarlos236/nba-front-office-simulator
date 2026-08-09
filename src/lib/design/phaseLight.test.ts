import { describe, expect, it } from "vitest";
import { PHASE_LIGHT, phaseLight, skyStops } from "./phaseLight";
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
    // The window is a hole in a dark room, not a lightbox. Anything at or
    // above 0.45 OKLCH lightness would read as a bright panel.
    for (const phase of PHASES) {
      const l = phaseLight(phase);
      expect(l.lightnessTop).toBeGreaterThan(0);
      expect(l.lightnessTop).toBeLessThan(0.45);
      expect(l.lightnessHorizon).toBeGreaterThan(0);
      expect(l.lightnessHorizon).toBeLessThan(0.45);
    }
  });

  it("keeps the phases visually distinguishable from one another", () => {
    // If two phases look the same, the layer is decoration rather than
    // information. Hue shift plus lightness is what carries the difference.
    const signatures = PHASES.map((p) => {
      const l = phaseLight(p);
      return `${l.hueShift}:${l.lightnessTop}`;
    });
    expect(new Set(signatures).size).toBe(PHASES.length);
  });

  it("gradients always run darker toward the horizon", () => {
    // One Lamp: light comes from above. A sky that brightens downward reads as
    // an inverted, artificial gradient.
    for (const phase of PHASES) {
      const l = phaseLight(phase);
      expect(l.lightnessTop).toBeGreaterThan(l.lightnessHorizon);
    }
  });

  it("keeps the sky a weather effect rather than a colour statement", () => {
    // Low chroma is what stops this competing with the team accent it sits
    // inside. Above ~0.08 the sky starts reading as a second brand colour.
    for (const phase of PHASES) {
      expect(phaseLight(phase).chroma).toBeLessThanOrEqual(0.08);
    }
  });
});

describe("the sky is derived from the franchise, not fixed per phase", () => {
  /**
   * REGRESSION GUARD. The first implementation used absolute per-phase sky
   * colours. That produced a real defect: Brooklyn resolves to the monochrome
   * slate #748799, the offseason sky was warm amber, and the two met at a hard
   * edge - reading as a broken image tile rather than a view.
   *
   * Any independent colour has this failure for *some* franchise, because the
   * accent varies per save and the sky did not. These tests assert the sky now
   * tracks the accent.
   */
  it("puts the sky in the same hue family as the team accent", () => {
    for (const phase of PHASES) {
      // A warm franchise (amber, hue ~75) must not get a cold sky, and a cool
      // one (blue, hue ~250) must not get a warm one.
      for (const hue of [75, 250]) {
        const { from } = skyStops(phase, hue);
        const skyHue = Number(from.match(/([\d.]+)\)$/)?.[1]);
        const shift = phaseLight(phase).hueShift;
        expect(skyHue).toBeCloseTo((hue + shift + 360) % 360, 5);
      }
    }
  });

  it("falls back to the system neutral for a monochrome franchise", () => {
    // Brooklyn and San Antonio have no meaningful accent hue. Reading one off
    // a near-neutral yields an arbitrary angle, so they take the product's own
    // blue instead of a random tint.
    for (const phase of PHASES) {
      const { from } = skyStops(phase, null);
      const skyHue = Number(from.match(/([\d.]+)\)$/)?.[1]);
      expect(skyHue).toBeCloseTo((245 + phaseLight(phase).hueShift + 360) % 360, 5);
    }
  });

  it("emits valid oklch for every phase and every hue on the wheel", () => {
    for (const phase of PHASES) {
      for (let hue = 0; hue < 360; hue += 15) {
        for (const stop of Object.values(skyStops(phase, hue))) {
          expect(stop).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
          const h = Number(stop.match(/([\d.]+)\)$/)?.[1]);
          // Hue must stay on the wheel after the shift wraps.
          expect(h).toBeGreaterThanOrEqual(0);
          expect(h).toBeLessThan(360);
        }
      }
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
