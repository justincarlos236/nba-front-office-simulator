import type { LeaguePhase } from "@/lib/league/leaguePhase";

/**
 * THE WIRE - phase-aware environmental light. See DESIGN.md, Phase D.
 *
 * The one thing a front office genuinely sees change across a season is the
 * light outside the window. February is grey and endless; June is late and
 * warm; the draft is the middle of a bright summer afternoon.
 *
 * This is deliberately keyed to `LeaguePhase`, the phase the app already
 * derives and already gates six systems on - not a new notion of time. If the
 * light says something different from `PhaseIndicator`, the light is wrong.
 *
 * CONSTRAINT (the reason these values are so low): this tints the sky behind a
 * skyline, at most. It must never tint content, never shift a semantic colour,
 * and never touch a Workbench or Ledger surface. Different parts of the season
 * should feel different at a glance across weeks of play - not be legible as a
 * colour change within one session.
 */

export interface PhaseLight {
  /** Sky wash behind the skyline. Two stops, top to horizon. */
  skyFrom: string;
  skyTo: string;
  /** How present the skyline silhouette is against that sky. */
  skylineOpacity: number;
  /** Plain-language note, for DESIGN.md and for anyone reading this later. */
  readonly description: string;
}

/**
 * All colours are given in `oklch` with very low chroma. The hue moves; the
 * lightness barely does. That is what keeps this reading as weather rather
 * than as a theme change.
 */
export const PHASE_LIGHT: Record<LeaguePhase, PhaseLight> = {
  // The long middle of the year. Cold, flat, blue-grey - the least dramatic
  // light in the set, because this is where a save spends most of its time and
  // the baseline must not be the loud one.
  "regular-season": {
    skyFrom: "oklch(0.30 0.022 245)",
    skyTo: "oklch(0.22 0.016 240)",
    skylineOpacity: 0.5,
    description: "Overcast winter afternoon. Cold blue-grey, low contrast.",
  },

  // Playoffs. Evening light, warmer and higher-contrast: games are at night
  // now, and the silhouette sharpens against a lit sky.
  "playoffs-incomplete": {
    skyFrom: "oklch(0.34 0.045 55)",
    skyTo: "oklch(0.23 0.030 30)",
    skylineOpacity: 0.66,
    description: "Late playoff evening. Warm horizon, sharper silhouette.",
  },

  // Champion crowned, lottery not yet run. The quietest moment in the calendar
  // - the season is over and the next one has not started. Dim and still.
  "pre-draft": {
    skyFrom: "oklch(0.26 0.018 265)",
    skyTo: "oklch(0.19 0.014 260)",
    skylineOpacity: 0.42,
    description: "Dusk after the season ends. Dim, still, waiting.",
  },

  // Draft night. The one genuinely bright moment: a summer afternoon, the
  // brightest sky and the most present skyline in the set.
  "draft-incomplete": {
    skyFrom: "oklch(0.38 0.038 230)",
    skyTo: "oklch(0.26 0.026 225)",
    skylineOpacity: 0.72,
    description: "Bright summer afternoon. The brightest phase; draft night.",
  },

  // Offseason proper - the draft is done, the roster is yours to rebuild.
  // Warm, open, optimistic without being loud.
  ready: {
    skyFrom: "oklch(0.33 0.032 85)",
    skyTo: "oklch(0.23 0.022 70)",
    skylineOpacity: 0.58,
    description: "Open summer light. Warm, unhurried, the building year.",
  },
};

export function phaseLight(phase: LeaguePhase): PhaseLight {
  return PHASE_LIGHT[phase];
}
