import type { LeaguePhase } from "@/lib/league/leaguePhase";

/**
 * THE WIRE - phase-aware environmental light. See DESIGN.md, Phase D.
 *
 * The one thing a front office genuinely sees change across a season is the
 * light outside the window. February is grey and endless; June is late and
 * warm; the draft is the middle of a bright summer afternoon.
 *
 * Keyed to `LeaguePhase`, the phase the app already derives and already gates
 * six systems on - not a new notion of time. If the light says something
 * different from `PhaseIndicator`, the light is wrong.
 *
 * THE SKY IS DERIVED FROM THE TEAM ACCENT, NOT INDEPENDENT OF IT.
 *
 * The first version defined absolute sky colours per phase. That produced a
 * genuine defect: Brooklyn resolves to the monochrome slate #748799, the
 * offseason sky was warm amber, and the two met at a hard edge - reading as a
 * broken image tile rather than a view. Any independent colour has this
 * failure mode for *some* franchise, because the accent varies per save and
 * the sky did not.
 *
 * So phase now supplies a *hue shift and a lightness*, applied to the
 * franchise's own accent hue. Every sky is therefore in the same colour family
 * as the header it sits in, for all 30 teams, and the phase difference still
 * reads because hue rotation and lightness are what the eye actually tracks.
 */

export interface PhaseLight {
  /**
   * Degrees to rotate the accent hue for this phase. Negative is cooler
   * (toward blue), positive is warmer (toward amber).
   */
  hueShift: number;
  /** Sky lightness in OKLCH at the top of the frame, and at the horizon. */
  lightnessTop: number;
  lightnessHorizon: number;
  /** How much of the accent's chroma the sky keeps. Low: this is weather. */
  chroma: number;
  /** How present the skyline silhouette is against that sky. */
  skylineOpacity: number;
  /** Plain-language note, for DESIGN.md and for anyone reading this later. */
  readonly description: string;
}

export const PHASE_LIGHT: Record<LeaguePhase, PhaseLight> = {
  // The long middle of the year. Cold, flat - the least dramatic light in the
  // set, because this is where a save spends most of its time and the baseline
  // must not be the loud one.
  "regular-season": {
    hueShift: -25,
    lightnessTop: 0.34,
    lightnessHorizon: 0.24,
    chroma: 0.03,
    skylineOpacity: 0.62,
    description: "Overcast winter afternoon. Cooled toward blue, low contrast.",
  },

  // Playoffs. Evening light, warmer and higher-contrast: games are at night
  // now, and the silhouette sharpens against a lit sky.
  "playoffs-incomplete": {
    hueShift: 18,
    lightnessTop: 0.38,
    lightnessHorizon: 0.25,
    chroma: 0.05,
    skylineOpacity: 0.74,
    description: "Late playoff evening. Warm horizon, sharper silhouette.",
  },

  // Champion crowned, lottery not yet run. The quietest moment in the calendar
  // - the season is over and the next one has not started. Dim and still.
  "pre-draft": {
    hueShift: -8,
    lightnessTop: 0.29,
    lightnessHorizon: 0.21,
    chroma: 0.025,
    skylineOpacity: 0.55,
    description: "Dusk after the season ends. Dim, still, waiting.",
  },

  // Draft night. The one genuinely bright moment: a summer afternoon, the
  // brightest sky and the most present skyline in the set.
  "draft-incomplete": {
    hueShift: -14,
    lightnessTop: 0.42,
    lightnessHorizon: 0.29,
    chroma: 0.045,
    skylineOpacity: 0.8,
    description: "Bright summer afternoon. The brightest phase; draft night.",
  },

  // Offseason proper - the draft is done, the roster is yours to rebuild.
  // Warm, open, optimistic without being loud.
  ready: {
    hueShift: 10,
    lightnessTop: 0.36,
    lightnessHorizon: 0.25,
    chroma: 0.04,
    skylineOpacity: 0.68,
    description: "Open summer light. Warm, unhurried, the building year.",
  },
};

export function phaseLight(phase: LeaguePhase): PhaseLight {
  return PHASE_LIGHT[phase];
}

/**
 * Builds the two sky stops for a franchise in a phase.
 *
 * `accentHue` is the OKLCH hue of the team's resolved accent. A monochrome
 * accent (Brooklyn, San Antonio) has no meaningful hue, so it is given the
 * system's own neutral blue - which is what the interface ground already is,
 * so those franchises get a sky in the family of the *product* rather than a
 * random one.
 */
export function skyStops(
  phase: LeaguePhase,
  accentHue: number | null,
): { from: string; to: string } {
  const light = phaseLight(phase);
  const base = accentHue ?? 245;
  const hue = (base + light.hueShift + 360) % 360;
  return {
    from: `oklch(${light.lightnessTop} ${light.chroma} ${hue})`,
    to: `oklch(${light.lightnessHorizon} ${light.chroma} ${hue})`,
  };
}
