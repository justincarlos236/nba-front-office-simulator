/**
 * Fans Page Redesign, Section 1 - "The Mood." Converts raw Fan
 * Happiness + its recent trajectory into a plain-language label. The design
 * point (docs/FANS_PAGE_REDESIGN.md Part 3.1): a fanbase at 55 and climbing
 * is a completely different room than one at 55 and falling, and one static
 * number can't say that - so the label is a function of level AND direction,
 * never level alone.
 *
 * Pure and Prisma-free; the page supplies the two comparison points
 * (recent-trend delta, season-over-season delta) it already has on hand
 * from the sentiment ledger and FanHappinessSnapshot history.
 */

export type MoodLabel =
  "EUPHORIC" | "BOUGHT_IN" | "CONTENT" | "RESTLESS" | "PATIENT" | "TURNING_ON_YOU" | "HOSTILE";

export const MOOD_LABEL_TEXT: Record<MoodLabel, string> = {
  EUPHORIC: "Euphoric",
  BOUGHT_IN: "Bought In",
  CONTENT: "Content",
  RESTLESS: "Restless",
  PATIENT: "Patient",
  TURNING_ON_YOU: "Turning On You",
  HOSTILE: "Hostile",
};

export const MOOD_LABEL_DESCRIPTION: Record<MoodLabel, string> = {
  EUPHORIC: "The fanbase is riding as high as it gets right now.",
  BOUGHT_IN: "Happy, and getting happier - the city likes where this is headed.",
  CONTENT: "Satisfied, holding steady - no real complaints, no real excitement either.",
  RESTLESS: "Comfortable but drifting down - nothing's broken yet, but the mood is cooling.",
  PATIENT: "Not thrilled right now, but willing to wait and see.",
  TURNING_ON_YOU: "Souring, and it's accelerating - this is the moment to change something.",
  HOSTILE: "About as low as it gets. The city has run out of patience.",
};

const RECENT_TREND_SIGNIFICANT = 3;
const SEASON_TREND_SIGNIFICANT = 5;

export interface MoodInputs {
  fanHappiness: number;
  /** Change over the recent stretch reconstructed from the sentiment ledger (e.g. last ~10 in-season days). */
  recentTrendDelta: number;
  /** Change since the same point last season (FanHappinessSnapshot-to-snapshot), null if there's no prior season yet. */
  seasonOverSeasonDelta: number | null;
}

/**
 * Level sets the broad band; recent direction (weighted over the slower
 * season-long direction, since it's the more immediate signal) breaks ties
 * within a band. A team at high happiness but falling reads as cooling
 * (BOUGHT_IN, not EUPHORIC); a team at low happiness but recovering reads as
 * hopeful (PATIENT, not HOSTILE) - direction changes the verdict, not just
 * the color of the number.
 */
export function computeMoodLabel(inputs: MoodInputs): MoodLabel {
  const { fanHappiness, recentTrendDelta } = inputs;
  const risingRecently = recentTrendDelta >= RECENT_TREND_SIGNIFICANT;
  const fallingRecently = recentTrendDelta <= -RECENT_TREND_SIGNIFICANT;
  const fallingOverSeason =
    inputs.seasonOverSeasonDelta !== null &&
    inputs.seasonOverSeasonDelta <= -SEASON_TREND_SIGNIFICANT;

  if (fanHappiness >= 85) {
    return risingRecently ? "EUPHORIC" : fallingRecently ? "BOUGHT_IN" : "EUPHORIC";
  }
  if (fanHappiness >= 65) {
    if (fallingRecently && fallingOverSeason) return "RESTLESS";
    return risingRecently ? "BOUGHT_IN" : "CONTENT";
  }
  if (fanHappiness >= 40) {
    if (fallingRecently) return "TURNING_ON_YOU";
    return risingRecently ? "PATIENT" : "RESTLESS";
  }
  // Below 40 - genuinely low.
  return fallingRecently || fallingOverSeason ? "HOSTILE" : "PATIENT";
}

export type TrendDirection = "UP" | "DOWN" | "FLAT";

const FLAT_THRESHOLD = 1;

export function trendDirection(delta: number): TrendDirection {
  if (delta >= FLAT_THRESHOLD) return "UP";
  if (delta <= -FLAT_THRESHOLD) return "DOWN";
  return "FLAT";
}
