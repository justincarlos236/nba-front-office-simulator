import type { FanMandateKind } from "@/lib/fans/fanMandate";

/**
 * Fans Page Redesign (Phase 5) - "The Conversation," media narratives
 * (docs/FANS_PAGE_REDESIGN.md Part 3.4). Persistent, multi-week storylines,
 * not one-off blurbs - the clearest separation from the News feed: News
 * reports events, this interprets them into an ongoing story.
 *
 * Two deliberately different lifecycles (confirmed with the user):
 *   - EVENT-driven (ICON_DEPARTURE_FALLOUT): opens immediately at the real
 *     event (src/lib/actions/trade.ts), not deferred to season end.
 *   - TRAJECTORY (REBUILD_PROGRESS_WATCH, CHAMPIONSHIP_WINDOW_WATCH): only
 *     ever opened/updated/closed at the season boundary, since both depend
 *     on FanMandate, which itself only updates once a season.
 *
 * Pure and Prisma-free; every function here answers one question (should
 * this open, should this close, what's the resolution beat) from plain
 * inputs the caller (src/lib/actions/fanNarrative.ts) already has.
 */

export type FanNarrativeKind =
  "ICON_DEPARTURE_FALLOUT" | "REBUILD_PROGRESS_WATCH" | "CHAMPIONSHIP_WINDOW_WATCH";

// "A handful of live narratives, not a wall" - Part 3.4's explicit volume
// cap. With only 3 kinds total this is rarely binding, but it's still
// enforced defensively so nothing can ever pile up unbounded.
export const FAN_NARRATIVE_MAX_OPEN_PER_TEAM = 3;

// ---------------------------------------------------------------------------
// ICON_DEPARTURE_FALLOUT - event-driven
// ---------------------------------------------------------------------------

const ICON_FALLOUT_RECOVERY_THRESHOLD_DELTA = -3; // happiness within 3 of its pre-departure level counts as "recovered"
const ICON_FALLOUT_MAX_SEASONS_OPEN = 3;

export function buildIconDepartureFalloutOpening(
  playerName: string,
  isTrade: boolean,
): {
  headline: string;
  body: string;
} {
  return {
    headline: `The ${playerName} ${isTrade ? "Trade" : "Departure"} Fallout`,
    body: `${playerName} is gone, and this fanbase is still processing it. Every move you make right now gets read through that lens.`,
  };
}

export interface IconFalloutCloseCheck {
  seasonsOpen: number;
  /** Current fan happiness minus fan happiness right before the departure. */
  happinessRecoveryDelta: number;
}

export function shouldCloseIconDepartureFallout(check: IconFalloutCloseCheck): boolean {
  return (
    check.seasonsOpen >= ICON_FALLOUT_MAX_SEASONS_OPEN ||
    check.happinessRecoveryDelta >= ICON_FALLOUT_RECOVERY_THRESHOLD_DELTA
  );
}

export function buildIconDepartureFalloutResolution(
  playerName: string,
  check: IconFalloutCloseCheck,
): string {
  if (check.happinessRecoveryDelta >= ICON_FALLOUT_RECOVERY_THRESHOLD_DELTA) {
    return `The city has made peace with life after ${playerName}. The story has moved on.`;
  }
  return `Time has passed since ${playerName} left. The wound hasn't fully healed, but the fanbase has stopped talking about it every day.`;
}

// ---------------------------------------------------------------------------
// REBUILD_PROGRESS_WATCH / CHAMPIONSHIP_WINDOW_WATCH - trajectory,
// season-boundary only
// ---------------------------------------------------------------------------

const TRAJECTORY_TRIGGER_MANDATE: Record<
  "REBUILD_PROGRESS_WATCH" | "CHAMPIONSHIP_WINDOW_WATCH",
  FanMandateKind
> = {
  REBUILD_PROGRESS_WATCH: "SHOW_ME_PROGRESS",
  CHAMPIONSHIP_WINDOW_WATCH: "CHAMPIONSHIP_OR_BUST",
};

/** Whether this trajectory narrative's triggering mandate is the current one - the condition it opens on and stays open while it holds. */
export function trajectoryNarrativeConditionHolds(
  kind: "REBUILD_PROGRESS_WATCH" | "CHAMPIONSHIP_WINDOW_WATCH",
  currentMandate: FanMandateKind,
): boolean {
  return currentMandate === TRAJECTORY_TRIGGER_MANDATE[kind];
}

export function buildRebuildProgressWatchOpening(): { headline: string; body: string } {
  return {
    headline: "Is This Rebuild Working?",
    body: "The kids were supposed to be the plan. This city is done waiting to see results - every move gets judged against one question: is it actually working?",
  };
}

export function buildRebuildProgressWatchResolution(wonMandateBack: boolean): string {
  return wonMandateBack
    ? 'The rebuild found its footing. The question isn\'t "is this working" anymore - it\'s "how far can this go."'
    : "Patience finally ran out. The story isn't about the rebuild working anymore - it's about whether anyone still believes in the plan at all.";
}

export function buildChampionshipWindowWatchOpening(): { headline: string; body: string } {
  return {
    headline: "Championship Window Watch",
    body: "The roster is built to win it all. This city isn't interested in moral victories - every series, every trade deadline gets measured against one outcome.",
  };
}

export function buildChampionshipWindowWatchResolution(wonTitle: boolean): string {
  return wonTitle
    ? "The window paid off. A banner goes up, and this story ends exactly how it was supposed to."
    : "The window has closed without a title. This city will remember what this core almost did - and what it didn't.";
}
