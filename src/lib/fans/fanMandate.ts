import type { MarketSize } from "@/generated/prisma/client";
import type { SeasonOutcome } from "@/lib/fans/fanCulture";

/**
 * "What the City Wants"
 * (docs/FANS_PAGE_REDESIGN.md Part 3.2). What the FANBASE currently wants,
 * derived from real state - deliberately distinct from ExpectationLevel
 * (ownership's payroll-driven bar, src/lib/gm/expectationLevel.ts). The
 * tension between the two is the point: an owner wanting payroll cut while
 * fans refuse to let you trade their icon is real, emergent gameplay.
 *
 * `primary` is one of 5 mutually-exclusive trajectory mandates - checked in
 * priority order below, first match wins. `keepOurGuy` is a separate
 * boolean overlay (confirmed explicitly, not a 6th trajectory option): a
 * genuine franchise icon on the roster is its own standing expectation that
 * coexists with whatever the primary trajectory is.
 *
 * Pure and Prisma-free; the caller (src/lib/actions/fanMandate.ts) derives
 * every input from already-persisted history, reusing fanCulture.ts's
 * SeasonOutcome shape rather than a second playoff-depth representation.
 */

export type FanMandateKind =
  | "BE_PATIENT_WITH_THE_KIDS"
  | "SHOW_ME_PROGRESS"
  | "WIN_NOW"
  | "CHAMPIONSHIP_OR_BUST"
  | "GIVE_US_A_REASON_TO_CARE";

export const FAN_MANDATE_LABEL: Record<FanMandateKind, string> = {
  BE_PATIENT_WITH_THE_KIDS: "Be Patient With the Kids",
  SHOW_ME_PROGRESS: "Show Me Progress",
  WIN_NOW: "Win Now",
  CHAMPIONSHIP_OR_BUST: "Championship or Bust",
  GIVE_US_A_REASON_TO_CARE: "Give Us a Reason to Care",
};

export const FAN_MANDATE_DESCRIPTION: Record<FanMandateKind, string> = {
  BE_PATIENT_WITH_THE_KIDS:
    "This city has accepted the rebuild. Develop the young talent - they'll wait.",
  SHOW_ME_PROGRESS:
    "The rebuild has dragged on long enough. This city wants to see it's actually working.",
  WIN_NOW: "The roster is built to win today. This city expects the front office to go for it.",
  CHAMPIONSHIP_OR_BUST: "Anything short of a championship reads as a disappointment right now.",
  GIVE_US_A_REASON_TO_CARE:
    "This city has stopped paying close attention. Give them something to believe in.",
};

// Same threshold expectationLevel.ts's own "elite roster" read uses - a
// title-favorite roster on the same 0-99 rating scale team strength is
// already computed on.
const TITLE_FAVORITE_STRENGTH_THRESHOLD = 80;
const RECENT_FINALS_WINDOW_SEASONS = 3;
const RECENT_FINALS_MIN_DEPTH = 5; // lost in the Finals or won it

const RECENT_PLAYOFF_WINDOW_SEASONS = 2;
const RECENT_PLAYOFF_MIN_DEPTH = 2; // made the playoffs (beyond just the play-in)
const VETERAN_CORE_AGE_THRESHOLD = 28;

const REBUILD_BAND_MAX_DEPTH = 1; // missed the playoffs or lost in the play-in
const REBUILD_STREAK_FOR_SHOW_ME_PROGRESS = 2;
const PATIENCE_SPENT_THRESHOLD = 35;
const PATIENCE_INTACT_THRESHOLD = 50;

const LOTTERY_PICK_MAX = 14;
const RECENT_LOTTERY_WINDOW_SEASONS = 3;
const YOUNG_ROSTER_AGE_THRESHOLD = 25;

const IRRELEVANCE_WINDOW_SEASONS = 5;
const IRRELEVANCE_POPULARITY_THRESHOLD = 40;

export interface FanMandateInputs {
  marketSize: MarketSize;
  /** Most recent lookback-window seasons' playoff depth (same shape/window fanCulture.ts uses), any order. */
  seasonOutcomes: SeasonOutcome[];
  /** This team's current roster strength (computeTeamStrength's own 0-99-ish scale). */
  teamStrength: number;
  /** Minutes-weighted or simple average age of the current rotation. */
  averageRosterAge: number;
  /** Count of the team's own lottery picks (overallPickNumber <= 14) used within the recent window. */
  recentLotteryPicks: number;
  /** Current franchise popularity (0-100, computeFranchisePopularity's own scale). */
  franchisePopularity: number;
  /** This team's FanCulture, already computed this same pass. */
  patience: number;
  expectationCeiling: number;
}

function recentOutcomes(
  outcomes: SeasonOutcome[],
  windowSeasons: number,
  latestSeason: number,
): SeasonOutcome[] {
  return outcomes.filter((o) => o.season > latestSeason - windowSeasons);
}

function isRebuildSeason(o: SeasonOutcome): boolean {
  return o.playoffDepth <= REBUILD_BAND_MAX_DEPTH;
}

/**
 * The primary trajectory mandate - exactly one, checked in priority order.
 * `latestSeason` is the most recent season in `seasonOutcomes` (or the
 * caller's current season if there's no history yet), the reference point
 * every "recent" window below is measured back from.
 */
export function computeFanMandate(inputs: FanMandateInputs, latestSeason: number): FanMandateKind {
  const outcomes = [...inputs.seasonOutcomes].sort((a, b) => a.season - b.season);

  // 1. CHAMPIONSHIP_OR_BUST - a title-favorite roster right now, or a real
  // Finals run in recent memory. Either signal alone is enough - a team
  // doesn't need both a loaded roster AND recent Finals pedigree for a
  // title to be the expectation.
  const recentFinals = recentOutcomes(outcomes, RECENT_FINALS_WINDOW_SEASONS, latestSeason).some(
    (o) => o.playoffDepth >= RECENT_FINALS_MIN_DEPTH,
  );
  if (inputs.teamStrength >= TITLE_FAVORITE_STRENGTH_THRESHOLD || recentFinals) {
    return "CHAMPIONSHIP_OR_BUST";
  }

  // 2. WIN_NOW - a veteran core with recent playoff pedigree. Both signals
  // required - an old roster that's still bad isn't "win now," it's just old.
  const recentPlayoffs = recentOutcomes(outcomes, RECENT_PLAYOFF_WINDOW_SEASONS, latestSeason).some(
    (o) => o.playoffDepth >= RECENT_PLAYOFF_MIN_DEPTH,
  );
  if (inputs.averageRosterAge >= VETERAN_CORE_AGE_THRESHOLD && recentPlayoffs) {
    return "WIN_NOW";
  }

  // 3/4. The rebuild branch - the same young-roster-plus-recent-struggle
  // state resolves to SHOW_ME_PROGRESS or BE_PATIENT_WITH_THE_KIDS based
  // entirely on Patience (the design's core "culture gates the mandate"
  // mechanism, Part 3.1a/3.2). A long-dragging rebuild with Patience spent
  // demands progress; the identical roster in a patient city still earns
  // the benefit of the doubt.
  let rebuildStreak = 0;
  for (let i = outcomes.length - 1; i >= 0; i--) {
    if (isRebuildSeason(outcomes[i])) rebuildStreak += 1;
    else break;
  }
  const youngRoster = inputs.averageRosterAge <= YOUNG_ROSTER_AGE_THRESHOLD;
  const recentLottery =
    inputs.recentLotteryPicks > 0 || outcomes.length === 0; /* a fresh franchise starts here */
  if ((youngRoster || rebuildStreak >= 1) && recentLottery) {
    if (
      rebuildStreak >= REBUILD_STREAK_FOR_SHOW_ME_PROGRESS &&
      inputs.patience <= PATIENCE_SPENT_THRESHOLD
    ) {
      return "SHOW_ME_PROGRESS";
    }
    if (
      inputs.patience >= PATIENCE_INTACT_THRESHOLD ||
      rebuildStreak < REBUILD_STREAK_FOR_SHOW_ME_PROGRESS
    ) {
      return "BE_PATIENT_WITH_THE_KIDS";
    }
    // Patience is in the ambiguous middle band - default to the more
    // demanding read once the rebuild has gone on a while, matching the
    // "you can run out of the ability to rebuild" design intent.
    return "SHOW_ME_PROGRESS";
  }

  // 5. GIVE_US_A_REASON_TO_CARE - sustained irrelevance, the true fallback:
  // no playoffs, no stars, low popularity, and nothing else above matched.
  const irrelevantStretch = recentOutcomes(
    outcomes,
    IRRELEVANCE_WINDOW_SEASONS,
    latestSeason,
  ).every(isRebuildSeason);
  if (
    outcomes.length >= IRRELEVANCE_WINDOW_SEASONS &&
    irrelevantStretch &&
    inputs.franchisePopularity < IRRELEVANCE_POPULARITY_THRESHOLD
  ) {
    return "GIVE_US_A_REASON_TO_CARE";
  }

  // No mandate condition clearly fired (a middling, unremarkable team) -
  // the honest default is the most common real state in a league: modest
  // hope without demanding a title or accepting a teardown.
  return "BE_PATIENT_WITH_THE_KIDS";
}

// Exposed so the DB-shell caller (src/lib/actions/fanMandate.ts) queries
// DraftPick with the exact same "lottery" and "recent" definitions used
// above, rather than a second guess at what counts.
export { LOTTERY_PICK_MAX, RECENT_LOTTERY_WINDOW_SEASONS };

// ---------------------------------------------------------------------------
// Satisfaction - "are you currently serving the mandate?" (Part 3.2's
// "how are expectations changing" answer, feeding the standing forecast).
// ---------------------------------------------------------------------------

export interface MandateSatisfactionInputs {
  mandate: FanMandateKind;
  teamStrength: number;
  latestSeasonOutcome: SeasonOutcome | null;
  recentLotteryPicks: number;
}

const SATISFACTION_NEUTRAL = 50;

/**
 * 0-100 - how well the front office's actual recent behavior matches what
 * this mandate asks for. Deliberately reads the same small set of signals
 * each mandate's own condition already cares about, not a new opinion.
 */
export function computeMandateSatisfaction(inputs: MandateSatisfactionInputs): number {
  const depth = inputs.latestSeasonOutcome?.playoffDepth ?? 0;
  switch (inputs.mandate) {
    case "CHAMPIONSHIP_OR_BUST": {
      // Satisfaction scales directly with how close the actual result came
      // to a title - a first-round exit from a "should contend" roster
      // genuinely disappoints, a Finals loss is close enough to matter.
      return Math.max(0, Math.min(100, Math.round((depth / 6) * 100)));
    }
    case "WIN_NOW": {
      return depth >= RECENT_PLAYOFF_MIN_DEPTH ? 75 : depth >= 1 ? 45 : 15;
    }
    case "BE_PATIENT_WITH_THE_KIDS": {
      // Satisfied by genuinely investing in the kids (real lottery capital
      // used), not by results - that's the whole point of this mandate.
      return inputs.recentLotteryPicks > 0 ? 70 : SATISFACTION_NEUTRAL;
    }
    case "SHOW_ME_PROGRESS": {
      // Satisfied only by real forward movement - any real playoff
      // appearance reads as the progress being asked for.
      return depth >= RECENT_PLAYOFF_MIN_DEPTH ? 80 : depth >= 1 ? 40 : 15;
    }
    case "GIVE_US_A_REASON_TO_CARE": {
      // A low bar by design - any real spark (a playoff push, real lottery
      // investment) is enough to start winning this fanbase back.
      return depth >= 1 || inputs.recentLotteryPicks > 0 ? 60 : 25;
    }
  }
}

// ---------------------------------------------------------------------------
// Explaining the mandate with real facts (Part 3.2: "why it's the mandate -
// 2-3 real contributing facts, and how it's changing"). Reads the same
// inputs the derivation above used - never a second opinion.
// ---------------------------------------------------------------------------

export function explainFanMandate(inputs: FanMandateInputs, mandate: FanMandateKind): string[] {
  const facts: string[] = [];
  switch (mandate) {
    case "CHAMPIONSHIP_OR_BUST":
      if (inputs.teamStrength >= TITLE_FAVORITE_STRENGTH_THRESHOLD) {
        facts.push("This roster is genuinely built to win a title right now.");
      }
      if (inputs.seasonOutcomes.some((o) => o.playoffDepth >= RECENT_FINALS_MIN_DEPTH)) {
        facts.push("A real Finals run in recent memory raised the bar permanently.");
      }
      break;
    case "WIN_NOW":
      facts.push("The roster's core is squarely in its prime win-now years.");
      if (inputs.seasonOutcomes.some((o) => o.playoffDepth >= RECENT_PLAYOFF_MIN_DEPTH)) {
        facts.push("Recent playoff appearances have this city expecting more of the same.");
      }
      break;
    case "BE_PATIENT_WITH_THE_KIDS":
      facts.push("The roster skews young, and this city has bought into developing it.");
      if (inputs.recentLotteryPicks > 0) {
        facts.push("Real lottery capital has gone into the kids - fans see the investment.");
      }
      if (inputs.patience >= PATIENCE_INTACT_THRESHOLD) {
        facts.push("This fanbase's patience is genuinely intact right now.");
      }
      break;
    case "SHOW_ME_PROGRESS":
      facts.push("The rebuild has gone on long enough that patience is running out.");
      if (inputs.patience <= PATIENCE_SPENT_THRESHOLD) {
        facts.push("This fanbase's patience is close to spent - the clock is real.");
      }
      break;
    case "GIVE_US_A_REASON_TO_CARE":
      facts.push("A long stretch of irrelevance has this fanbase checked out.");
      if (inputs.franchisePopularity < IRRELEVANCE_POPULARITY_THRESHOLD) {
        facts.push("Franchise popularity is genuinely low right now.");
      }
      break;
  }
  return facts;
}
