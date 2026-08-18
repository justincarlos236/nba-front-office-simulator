import type { MarketSize } from "@/generated/prisma/client";

/**
 * "Fan Culture" (docs/design/FANS_PAGE_REDESIGN.md
 * Part 3.1a). Mood is weather (LeagueTeam.fanHappiness, swings week to
 * week); this is climate - three slow-moving 0-100 traits describing what
 * a fanbase has *become* after years of being treated a certain way.
 *
 * Pure and Prisma-free: every input here is a plain summary the caller
 * (offseason.ts) derives from real, already-persisted history - permanent
 * PlayoffSeries results, FanHappinessSnapshot history, FanSentimentEvent
 * ICON_DEPARTURE rows, current roster icon tenure, market size, and
 * relocation state. Nothing here is authored or invented (see the design
 * doc's "why three axes" table for how these combine into recognizable fan
 * cultures without enumerating them by hand).
 *
 * Recomputed wholesale from a bounded lookback (see FAN_CULTURE_LOOKBACK_
 * SEASONS) at every season boundary, never incrementally nudged - so a
 * trait can always be explained by pointing at the real facts that produced
 * it, and the computation cost stays fixed regardless of how long a save
 * has run (a true unbounded full-history query would grow forever).
 */

export const FAN_CULTURE_LOOKBACK_SEASONS = 15;

// ---------------------------------------------------------------------------
// Shared season-outcome summary - each trait reads a different projection
// of the same bounded playoff-history window, so the caller builds this once.
// ---------------------------------------------------------------------------

export interface SeasonOutcome {
  season: number;
  /** 0 (missed playoffs) through 6 (won the championship) - same scale as computeActualOutcome, derived directly from PlayoffSeries rows for aggregate/historical purposes rather than a single-season expectation comparison. */
  playoffDepth: number;
}

export interface FanCultureHistoryInputs {
  marketSize: MarketSize;
  /** Most recent lookback-window seasons' playoff depth, any order. */
  seasonOutcomes: SeasonOutcome[];
  /** FanHappinessSnapshot.fanHappiness values across the same window, any order. */
  happinessHistory: number[];
  /** Count of ICON_DEPARTURE sentiment events in the window - a real, felt betrayal each time. */
  iconDeparturesInWindow: number;
  /** computeFranchiseIconScore of the roster's own longest-tenured real icon, 0 if none. */
  currentIconScore: number;
  /** True if this franchise has ever relocated - permanent, not windowed. */
  hasRelocated: boolean;
  /** Current ticket-pricing posture's fan delta sign - reuses TICKET_POSTURE_FAN_DELTA directly (positive = fan-friendly, negative = gouging). */
  ticketPostureFanDelta: number;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Trait 1: Patience
// ---------------------------------------------------------------------------

const PATIENCE_NEUTRAL = 50;
const PATIENCE_SMALL_MARKET_BONUS = 8;
const PATIENCE_LARGE_MARKET_PENALTY = -5;

/**
 * A "rebuild" season is any season with playoffDepth 0-1 (missed the
 * playoffs or lost in the play-in) - the same rough band low-stakes seasons
 * occupy. Patience rewards a rebuild that visibly resolved into real
 * success within the window (proof the wait was worth it) and punishes a
 * rebuild that dragged on with no payoff, or repeated boom-bust cycles
 * (a promise broken more than once).
 */
export function computeFanCulturePatience(inputs: FanCultureHistoryInputs): number {
  const outcomes = [...inputs.seasonOutcomes].sort((a, b) => a.season - b.season);
  if (outcomes.length === 0) {
    const marketAdjust =
      inputs.marketSize === "SMALL"
        ? PATIENCE_SMALL_MARKET_BONUS
        : inputs.marketSize === "LARGE"
          ? PATIENCE_LARGE_MARKET_PENALTY
          : 0;
    return clamp(PATIENCE_NEUTRAL + marketAdjust);
  }

  let rebuildStreak = 0;
  let rebuildsThatPaidOff = 0;
  let rebuildsCompleted = 0;
  for (const o of outcomes) {
    if (o.playoffDepth <= 1) {
      rebuildStreak += 1;
    } else {
      if (rebuildStreak >= 2) {
        // A real rebuild (2+ down seasons) that resolved into at least a
        // real playoff push (depth >= 3, a series win) reads as "paid off."
        rebuildsCompleted += 1;
        if (o.playoffDepth >= 3) rebuildsThatPaidOff += 1;
      }
      rebuildStreak = 0;
    }
  }
  // A rebuild still going at the end of the window (never transitioned to a
  // real season) is at least as bad as one that resolved and failed - a
  // rebuild that never ends is the worst case, not a lenient one, so it's
  // counted as a completed-and-failed rebuild here rather than skipped.
  if (rebuildStreak >= 2) rebuildsCompleted += 1;

  const payoffBonus = rebuildsThatPaidOff * 10;
  const brokenPromisePenalty = (rebuildsCompleted - rebuildsThatPaidOff) * 12;
  // On top of the broken-promise count above, a rebuild that's dragged on
  // a long time compounds the frustration the longer it goes.
  const draggingPenalty = rebuildStreak >= 4 ? (rebuildStreak - 3) * 4 : 0;

  const marketAdjust =
    inputs.marketSize === "SMALL"
      ? PATIENCE_SMALL_MARKET_BONUS
      : inputs.marketSize === "LARGE"
        ? PATIENCE_LARGE_MARKET_PENALTY
        : 0;

  return clamp(
    PATIENCE_NEUTRAL + payoffBonus - brokenPromisePenalty - draggingPenalty + marketAdjust,
  );
}

// ---------------------------------------------------------------------------
// Trait 2: Expectation Ceiling
// ---------------------------------------------------------------------------

const CEILING_NEUTRAL = 40;
const CEILING_LARGE_MARKET_BONUS = 8;
const CEILING_SMALL_MARKET_PENALTY = -5;
const CEILING_IRRELEVANCE_DECAY_PER_SEASON = 1.5;
const CEILING_IRRELEVANCE_THRESHOLD_DEPTH = 1;

/**
 * Rises with real success in the window (deep runs and titles, weighted
 * heavily since a single championship should move this a lot), plus a
 * standing bump for genuine current star power. Falls only slowly with
 * sustained irrelevance - "a proud fanbase eventually forgets, but slowly"
 * is implemented literally as a small per-season decay, not a sharp drop.
 */
export function computeFanCultureExpectationCeiling(inputs: FanCultureHistoryInputs): number {
  const marketAdjust =
    inputs.marketSize === "LARGE"
      ? CEILING_LARGE_MARKET_BONUS
      : inputs.marketSize === "SMALL"
        ? CEILING_SMALL_MARKET_PENALTY
        : 0;

  if (inputs.seasonOutcomes.length === 0) {
    return clamp(CEILING_NEUTRAL + marketAdjust);
  }

  const bestDepth = Math.max(...inputs.seasonOutcomes.map((o) => o.playoffDepth));
  const championships = inputs.seasonOutcomes.filter((o) => o.playoffDepth === 6).length;
  const deepRuns = inputs.seasonOutcomes.filter((o) => o.playoffDepth >= 4).length;
  const irrelevantSeasons = inputs.seasonOutcomes.filter(
    (o) => o.playoffDepth <= CEILING_IRRELEVANCE_THRESHOLD_DEPTH,
  ).length;

  const successBonus = bestDepth * 4 + championships * 12 + deepRuns * 3;
  const starPowerBonus = Math.round(inputs.currentIconScore / 8); // up to +12 at a max-icon legend
  const irrelevanceDecay = irrelevantSeasons * CEILING_IRRELEVANCE_DECAY_PER_SEASON;

  return clamp(CEILING_NEUTRAL + successBonus + starPowerBonus - irrelevanceDecay + marketAdjust);
}

// ---------------------------------------------------------------------------
// Trait 3: Loyalty
// ---------------------------------------------------------------------------

const LOYALTY_NEUTRAL = 55;
const LOYALTY_SMALL_MARKET_BONUS = 8;
const LOYALTY_ICON_RETENTION_SCALE = 0.25; // up to +25 for keeping a max-icon legend
const LOYALTY_PER_ICON_DEPARTURE_PENALTY = 10;
const LOYALTY_RELOCATION_PENALTY = 30; // permanent, severe, per Part 3.1a
const LOYALTY_TICKET_POSTURE_SCALE = 2;
const LOYALTY_STABILITY_BONUS_THRESHOLD = 60; // average happiness across the window

/**
 * Rewards keeping real homegrown/long-tenured stars and sustained stability;
 * punishes trading beloved players away, gouging on tickets, and (severely,
 * permanently) relocating. This is the trait that dampens happiness
 * volatility and sets its floor, so it deliberately weighs continuity more
 * than any single season's results.
 */
export function computeFanCultureLoyalty(inputs: FanCultureHistoryInputs): number {
  const marketAdjust = inputs.marketSize === "SMALL" ? LOYALTY_SMALL_MARKET_BONUS : 0;
  const iconRetentionBonus = inputs.currentIconScore * LOYALTY_ICON_RETENTION_SCALE;
  const departurePenalty = inputs.iconDeparturesInWindow * LOYALTY_PER_ICON_DEPARTURE_PENALTY;
  const relocationPenalty = inputs.hasRelocated ? LOYALTY_RELOCATION_PENALTY : 0;
  const ticketAdjust = inputs.ticketPostureFanDelta * LOYALTY_TICKET_POSTURE_SCALE;
  const avgHappiness = average(inputs.happinessHistory);
  const stabilityBonus =
    avgHappiness !== null && avgHappiness >= LOYALTY_STABILITY_BONUS_THRESHOLD ? 6 : 0;

  return clamp(
    LOYALTY_NEUTRAL +
      iconRetentionBonus -
      departurePenalty -
      relocationPenalty +
      ticketAdjust +
      stabilityBonus +
      marketAdjust,
  );
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export interface FanCultureTraits {
  patience: number;
  expectationCeiling: number;
  loyalty: number;
}

export function computeFanCulture(inputs: FanCultureHistoryInputs): FanCultureTraits {
  return {
    patience: computeFanCulturePatience(inputs),
    expectationCeiling: computeFanCultureExpectationCeiling(inputs),
    loyalty: computeFanCultureLoyalty(inputs),
  };
}

// ---------------------------------------------------------------------------
// Explaining each trait with real facts (Part 3.1a: "the page can always
// explain each trait with the real facts behind it"). Reads the same inputs
// the numeric derivation above already used - never a second opinion, just
// the human-readable version of what actually moved the number.
// ---------------------------------------------------------------------------

export interface FanCultureFacts {
  patience: string[];
  expectationCeiling: string[];
  loyalty: string[];
}

function ordinalSeasons(count: number): string {
  return `${count} season${count === 1 ? "" : "s"}`;
}

export function explainFanCulture(inputs: FanCultureHistoryInputs): FanCultureFacts {
  const patience: string[] = [];
  const outcomes = [...inputs.seasonOutcomes].sort((a, b) => a.season - b.season);
  if (outcomes.length === 0) {
    patience.push("No playoff history yet to judge this fanbase's patience by.");
  } else {
    let rebuildStreak = 0;
    let rebuildsThatPaidOff = 0;
    let rebuildsCompleted = 0;
    for (const o of outcomes) {
      if (o.playoffDepth <= 1) {
        rebuildStreak += 1;
      } else {
        if (rebuildStreak >= 2) {
          rebuildsCompleted += 1;
          if (o.playoffDepth >= 3) rebuildsThatPaidOff += 1;
        }
        rebuildStreak = 0;
      }
    }
    if (rebuildStreak >= 2) rebuildsCompleted += 1;
    if (rebuildsThatPaidOff > 0) {
      patience.push(
        `A rebuild actually paid off within the last ${FAN_CULTURE_LOOKBACK_SEASONS} seasons.`,
      );
    }
    if (rebuildsCompleted - rebuildsThatPaidOff > 0) {
      patience.push("A rebuild dragged on and delivered nothing - fans remember that.");
    }
    if (rebuildStreak >= 4) {
      patience.push(`Currently in year ${rebuildStreak} of a rebuild with no resolution yet.`);
    }
  }
  if (inputs.marketSize === "SMALL") patience.push("Small-market identity buys extra patience.");
  if (inputs.marketSize === "LARGE") patience.push("Large-market pressure shortens the leash.");

  const ceiling: string[] = [];
  if (outcomes.length === 0) {
    ceiling.push("No playoff history yet to set real expectations by.");
  } else {
    const championships = outcomes.filter((o) => o.playoffDepth === 6).length;
    const deepRuns = outcomes.filter((o) => o.playoffDepth >= 4).length;
    const irrelevantSeasons = outcomes.filter((o) => o.playoffDepth <= 1).length;
    if (championships > 0) {
      ceiling.push(
        `${championships} championship${championships === 1 ? "" : "s"} in the last ${FAN_CULTURE_LOOKBACK_SEASONS} seasons - the bar is real.`,
      );
    }
    if (deepRuns > 0 && championships === 0) {
      ceiling.push(`${deepRuns} deep playoff run${deepRuns === 1 ? "" : "s"} in recent memory.`);
    }
    if (irrelevantSeasons >= 5) {
      ceiling.push(
        `${ordinalSeasons(irrelevantSeasons)} of irrelevance have slowly lowered the bar.`,
      );
    }
  }
  if (inputs.currentIconScore >= 50) {
    ceiling.push("A real star on the roster right now keeps expectations elevated.");
  }
  if (inputs.marketSize === "LARGE") ceiling.push("Large markets simply expect more.");
  if (inputs.marketSize === "SMALL") ceiling.push("Small markets grade on a fairer curve.");

  const loyalty: string[] = [];
  if (inputs.hasRelocated) {
    loyalty.push("This franchise has relocated once already - a wound that doesn't fully heal.");
  }
  if (inputs.iconDeparturesInWindow > 0) {
    loyalty.push(
      `${inputs.iconDeparturesInWindow} franchise icon${inputs.iconDeparturesInWindow === 1 ? "" : "s"} traded away in recent memory.`,
    );
  }
  if (inputs.currentIconScore >= 50) {
    loyalty.push("A real homegrown or long-tenured star is still on the roster.");
  }
  if (inputs.ticketPostureFanDelta < 0) {
    loyalty.push("Current ticket pricing is squeezing fans, not earning goodwill.");
  } else if (inputs.ticketPostureFanDelta > 0) {
    loyalty.push("Fan-friendly pricing is earning real goodwill.");
  }
  const avgHappiness = average(inputs.happinessHistory);
  if (avgHappiness !== null && avgHappiness >= 60) {
    loyalty.push("A sustained run of a genuinely happy fanbase builds real trust.");
  }
  if (inputs.marketSize === "SMALL")
    loyalty.push("Small-market fans tend to stay attached longer.");

  return { patience, expectationCeiling: ceiling, loyalty };
}

// ---------------------------------------------------------------------------
// How culture feeds back into the simulation (Part 3.1a, "not just flavor")
// ---------------------------------------------------------------------------

const PATIENCE_MAGNITUDE_SCALE_MIN = 0.6; // at Patience 100 - a very patient fanbase barely reacts
const PATIENCE_MAGNITUDE_SCALE_MAX = 1.5; // at Patience 0 - an impatient fanbase overreacts

/** Scales a NEGATIVE sentiment delta's magnitude by Patience - the same 60-loss season costs a patient fanbase far less. Positive deltas pass through unscaled (patience is about tolerance for bad news, not dampened joy). */
export function scaleSentimentByPatience(delta: number, patience: number): number {
  if (delta >= 0) return delta;
  const scale =
    PATIENCE_MAGNITUDE_SCALE_MAX -
    (clamp(patience) / 100) * (PATIENCE_MAGNITUDE_SCALE_MAX - PATIENCE_MAGNITUDE_SCALE_MIN);
  return Math.round(delta * scale);
}

const LOYALTY_VOLATILITY_DAMPEN_MIN = 0.7; // at Loyalty 100 - swings are dampened most
const LOYALTY_VOLATILITY_DAMPEN_MAX = 1.3; // at Loyalty 0 - a fickle fanbase swings harder both ways

/** Dampens (high loyalty) or amplifies (low loyalty) a sentiment delta's magnitude in EITHER direction - a loyal fanbase doesn't spike as high or crater as hard. */
export function scaleSentimentByLoyalty(delta: number, loyalty: number): number {
  const scale =
    LOYALTY_VOLATILITY_DAMPEN_MAX -
    (clamp(loyalty) / 100) * (LOYALTY_VOLATILITY_DAMPEN_MAX - LOYALTY_VOLATILITY_DAMPEN_MIN);
  return Math.round(delta * scale);
}

const LOYALTY_FLOOR_MIN = 5; // at Loyalty 0 - a fickle fanbase can bottom out completely
const LOYALTY_FLOOR_MAX = 25; // at Loyalty 100 - a loyal fanbase never gets lower than this

/** The lowest fanHappiness can decay to before culture's own floor kicks in - high loyalty means the fanbase never fully gives up. */
export function happinessFloorForLoyalty(loyalty: number): number {
  return Math.round(
    LOYALTY_FLOOR_MIN + (clamp(loyalty) / 100) * (LOYALTY_FLOOR_MAX - LOYALTY_FLOOR_MIN),
  );
}
