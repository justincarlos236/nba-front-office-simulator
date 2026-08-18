import type { FanSentimentKind } from "@/generated/prisma/client";

/**
 * the presentation layer over the
 * FanSentimentEvent ledger. Pure and Prisma-free (the model type import is
 * type-only): this module decides how persisted sentiment events are
 * labeled, grouped, and aggregated into "why the fanbase feels this way,"
 * while src/lib/actions/** stays the thin DB shell that writes them.
 *
 * Deliberately NOT a second sentiment model: every delta here was already
 * computed by src/lib/fans/sentimentEvents.ts at the moment the event
 * happened. This module never recomputes or re-judges a delta, it only
 * organizes what was recorded - the same "consume, don't duplicate"
 * relationship the rest of the codebase already follows.
 */

/**
 * The three themes the Fans page groups contributors under. Chosen so a
 * player reads the section as a narrative ("the on-court stuff is carrying
 * us, the front office moves are the problem") rather than a flat ranked
 * list of deltas.
 */
export type FanSentimentTheme = "ON_THE_COURT" | "FRONT_OFFICE" | "THE_BUSINESS";

export const FAN_SENTIMENT_THEME_LABEL: Record<FanSentimentTheme, string> = {
  ON_THE_COURT: "On the court",
  FRONT_OFFICE: "Front office moves",
  THE_BUSINESS: "The business side",
};

export const FAN_SENTIMENT_THEME_DESCRIPTION: Record<FanSentimentTheme, string> = {
  ON_THE_COURT: "Results, streaks, injuries, and individual honours.",
  FRONT_OFFICE: "Trades, signings, coaching, and roster decisions.",
  THE_BUSINESS: "Pricing, financing, and the commercial side of the franchise.",
};

/**
 * Which theme each kind rolls up under. A trade is a front-office decision
 * even though it changes the on-court product; the split is by *what the
 * fanbase blames or credits you for*, not by which system produced it.
 */
const THEME_BY_KIND: Record<FanSentimentKind, FanSentimentTheme> = {
  TRADE: "FRONT_OFFICE",
  SIGNING: "FRONT_OFFICE",
  STAFF_CHANGE: "FRONT_OFFICE",
  ROTATION_CHANGE: "FRONT_OFFICE",
  ICON_DEPARTURE: "FRONT_OFFICE",
  DRAFT_LOTTERY: "FRONT_OFFICE",
  WIN_STREAK: "ON_THE_COURT",
  LOSS_STREAK: "ON_THE_COURT",
  INJURY: "ON_THE_COURT",
  INJURY_RECOVERY: "ON_THE_COURT",
  AWARD: "ON_THE_COURT",
  ALL_STAR_SELECTION: "ON_THE_COURT",
  ALL_STAR_SNUB: "ON_THE_COURT",
  ALL_STAR_RESULT: "ON_THE_COURT",
  SEASON_RESULT: "ON_THE_COURT",
  BUSINESS_DECISION: "THE_BUSINESS",
  DISTRESSED_FINANCING: "THE_BUSINESS",
};

export function fanSentimentTheme(kind: FanSentimentKind): FanSentimentTheme {
  return THEME_BY_KIND[kind];
}

/** Short label for a single event's kind - the chip shown next to its description. */
export const FAN_SENTIMENT_KIND_LABEL: Record<FanSentimentKind, string> = {
  TRADE: "Trade",
  SIGNING: "Signing",
  WIN_STREAK: "Win streak",
  LOSS_STREAK: "Losing streak",
  INJURY: "Injury",
  INJURY_RECOVERY: "Return from injury",
  STAFF_CHANGE: "Coaching",
  ROTATION_CHANGE: "Rotation",
  AWARD: "Award",
  ALL_STAR_SELECTION: "All-Star",
  ALL_STAR_SNUB: "All-Star snub",
  ALL_STAR_RESULT: "All-Star Weekend",
  DRAFT_LOTTERY: "Draft lottery",
  ICON_DEPARTURE: "Franchise icon",
  BUSINESS_DECISION: "Business decision",
  DISTRESSED_FINANCING: "Financing",
  SEASON_RESULT: "Season result",
};

/** The shape the page passes in - a persisted FanSentimentEvent, narrowed to what this module needs. */
export interface LedgerEvent {
  id: string;
  season: number;
  dayIndex: number;
  kind: FanSentimentKind;
  delta: number;
  description: string;
  leaguePlayerId: string | null;
}

export interface ThemeBreakdown {
  theme: FanSentimentTheme;
  /** Net sum of every delta in this theme - the headline number. */
  netDelta: number;
  positiveDelta: number;
  negativeDelta: number;
  eventCount: number;
}

/**
 * Rolls a season's events up by theme. Always returns all three themes in a
 * stable order (even empty ones) so the page's layout doesn't reflow as a
 * season fills in - an empty theme renders as "nothing notable yet," which
 * is itself information.
 */
export function summarizeByTheme(events: LedgerEvent[]): ThemeBreakdown[] {
  const themes: FanSentimentTheme[] = ["ON_THE_COURT", "FRONT_OFFICE", "THE_BUSINESS"];
  return themes.map((theme) => {
    const inTheme = events.filter((e) => fanSentimentTheme(e.kind) === theme);
    return {
      theme,
      netDelta: inTheme.reduce((sum, e) => sum + e.delta, 0),
      positiveDelta: inTheme.filter((e) => e.delta > 0).reduce((sum, e) => sum + e.delta, 0),
      negativeDelta: inTheme.filter((e) => e.delta < 0).reduce((sum, e) => sum + e.delta, 0),
      eventCount: inTheme.length,
    };
  });
}

/**
 * The biggest movers in either direction, for the "what actually drove this"
 * headline. Sorted by raw magnitude so a single -9 icon departure outranks
 * three +2 wins, which is how a fanbase actually remembers a season.
 * Zero-delta events are excluded: an event that moved nothing isn't a
 * contributor, and listing it would dilute the signal.
 */
export function topContributors(
  events: LedgerEvent[],
  limit: number,
): { positive: LedgerEvent[]; negative: LedgerEvent[] } {
  const byMagnitude = (a: LedgerEvent, b: LedgerEvent) => Math.abs(b.delta) - Math.abs(a.delta);
  return {
    positive: events
      .filter((e) => e.delta > 0)
      .sort(byMagnitude)
      .slice(0, limit),
    negative: events
      .filter((e) => e.delta < 0)
      .sort(byMagnitude)
      .slice(0, limit),
  };
}

/**
 * Sum of every delta within the last `windowDays` of season-day activity -
 * the "recent trend" input Section 1's mood label needs (see moodLabel.ts).
 * Windowed by dayIndex, not event count, so a quiet stretch genuinely reads
 * as flat rather than reaching back arbitrarily far to find enough events.
 */
export function recentTrendDelta(events: LedgerEvent[], windowDays: number): number {
  if (events.length === 0) return 0;
  const latestDay = Math.max(...events.map((e) => e.dayIndex));
  const cutoff = latestDay - windowDays;
  return events.filter((e) => e.dayIndex > cutoff).reduce((sum, e) => sum + e.delta, 0);
}

export interface SentimentTrendPoint {
  dayIndex: number;
  /** Running fan happiness at this point, reconstructed backward from the current value. */
  fanHappiness: number;
}

/**
 * Reconstructs an in-season fan-happiness trend line from the ledger.
 *
 * FanHappinessSnapshot is written once per season, so it can't show an
 * in-season collapse (docs/FANS_PAGE_REDESIGN.md Part 2.6). Since
 * LeagueTeam.fanHappiness is authoritative *now* and every delta that got it
 * there is recorded, the honest reconstruction is to walk backward from the
 * current value rather than forward from a guessed starting point.
 *
 * Caveat this deliberately accepts: applyFanHappinessDelta clamps to 0-100
 * at write time, so a delta applied while the value was pinned at a bound
 * was partially absorbed. Walking backward can therefore drift slightly from
 * the true historical path in a save that spent time pinned at 0 or 100. The
 * alternative - persisting a before/after pair on every row - would make the
 * ledger a second source of truth for a number LeagueTeam already owns, so
 * the small drift is the better trade. Values are clamped on the way back
 * for the same reason.
 */
export function buildInSeasonTrend(
  events: LedgerEvent[],
  currentFanHappiness: number,
): SentimentTrendPoint[] {
  const ordered = [...events].sort((a, b) => a.dayIndex - b.dayIndex);
  if (ordered.length === 0) return [];

  // Walk backward accumulating deltas to find where the season started.
  const totalDelta = ordered.reduce((sum, e) => sum + e.delta, 0);
  let running = Math.max(0, Math.min(100, currentFanHappiness - totalDelta));

  const points: SentimentTrendPoint[] = [{ dayIndex: ordered[0].dayIndex, fanHappiness: running }];
  for (const event of ordered) {
    running = Math.max(0, Math.min(100, running + event.delta));
    points.push({ dayIndex: event.dayIndex, fanHappiness: running });
  }
  return points;
}
