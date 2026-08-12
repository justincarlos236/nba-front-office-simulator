import { computePlayerTradeValue } from "./playerTradeValue";
import { GM_PERSONALITY_WEIGHTS, type GmPersonality } from "./gmPersonality";
import type { TeamIdentity } from "./teamIdentity";
import type { TeamNeed } from "./teamNeeds";
import {
  YOUNG_AGE_THRESHOLD,
  VETERAN_AGE_THRESHOLD,
  CONTENDER_VETERAN_BONUS,
  REBUILDING_YOUTH_PICK_BONUS,
  NEED_FIT_BONUS_MULTIPLIER,
  playerFillsNeed,
} from "../trade/evaluateTradeOffer";

export interface ReSigningDecisionInput {
  team: {
    identity: TeamIdentity;
    needs: TeamNeed[];
    personality: GmPersonality;
    /** Sure roster size plus any re-signings already decided this offseason - used for the soft roster-size ceiling. */
    rosterSizeBeforeThisDecision: number;
  };
  currentSeason: number;
  player: {
    position: "PG" | "SG" | "SF" | "PF" | "C";
    overallRating: number;
    potentialRating: number;
    age: number;
    careerGamesMissedToInjury: number;
    /** Player Morale & Personality System - an active, unresolved trade request makes a team much less eager to bring him back. */
    hasStandingTradeRequest?: boolean;
  };
  /** Always the player's own Re-Signing Rights ceiling - see computeReSigningMaxOfferCents. */
  offerSalaryCents: bigint;
  /** Franchise Finances (Phase C) - a >1 multiplier makes a cash-strapped team
   *  pickier about adding salary (financialSpendingResistance). Omitted/1 keeps
   *  behavior exactly as before this parameter existed. Because the score is
   *  salary-normalized, this only ever cuts expensive marginal retentions - a
   *  bargain still clears - so it nudges without crippling. */
  financialThresholdMultiplier?: number;
}

export type ReSigningReasonCode = "FILLS_A_NEED" | "GOOD_VALUE" | "BAD_VALUE" | "ROSTER_FULL";

export interface ReSigningDecisionResult {
  decision: "RESIGN" | "LET_WALK";
  score: number;
  reasons: ReSigningReasonCode[];
}

// A player's Re-Signing ceiling (computeReSigningMaxOfferCents) and
// computePlayerTradeValue's internal surplus check both apply the age curve,
// so a score of 1.0 means "fairly priced for his age" rather than "at peak".
// Calibrated low (verified empirically, not by hand) so a genuinely good
// past-peak veteran still clears the bar for at least some personalities,
// while a clearly declined/redundant one doesn't clear it for any.
//
// **Deliberately unchanged when the ceiling gained its age discount**
// (docs/CONTRACT_AUDIT.md C-P1-3). Cheaper veterans do score higher, and two
// fixtures moved as a result - but measured across all 537 seeded players x 5
// team identities x 7 personalities, league-wide retention moved 84.1% -> 84.7%
// and the 33-and-over band stayed at 0%. The concern that CPU clubs would begin
// hoarding players they should let walk is not borne out, and re-deriving this
// constant to restore two fixture outcomes would have cut retention across
// every age band to fix a problem that does not exist.
const RESIGN_THRESHOLD = 0.35;

// A standard NBA active roster - once a CPU team already has this many
// players secured, only a clearly value-positive retention still clears
// the (now higher) bar, so re-signing can't unboundedly bloat a roster
// over many simulated seasons.
const SOFT_ROSTER_CEILING = 15;
const OVER_CEILING_THRESHOLD_MULTIPLIER = 1.4;

// Player Morale & Personality System - a player who has already asked out
// needs to look like a clear bargain, not just decent value, to be worth
// the awkwardness of running it back.
const TRADE_REQUEST_THRESHOLD_MULTIPLIER = 2.5;

function scaleCents(cents: bigint, multiplier: number): bigint {
  return BigInt(Math.round(Number(cents) * multiplier));
}

/**
 * Decides whether a CPU team re-signs its own expiring player at their
 * Re-Signing Rights ceiling, or lets them walk to free agency. Reuses every
 * valuation primitive `evaluateTradeOffer` uses (same personality weights,
 * same identity/age/need-fit bonus constants) rather than inventing a
 * second scoring system. It can't just call `evaluateTradeOffer` itself:
 * a retention decision has no real "outgoing" asset, which breaks that
 * function's score formula.
 *
 * No cap-legality check here: Re-Signing Rights already permit any offer up
 * to this exact ceiling regardless of apron status (see `validateSigning`),
 * and this function is always called with that ceiling as the offer - so
 * legality is guaranteed by construction.
 */
export function evaluateReSigningDecision(input: ReSigningDecisionInput): ReSigningDecisionResult {
  const { identity, needs, personality, rosterSizeBeforeThisDecision } = input.team;
  const { player, offerSalaryCents, currentSeason } = input;
  const financialThresholdMultiplier = input.financialThresholdMultiplier ?? 1;
  const weights = GM_PERSONALITY_WEIGHTS[personality];
  const isWinNowIdentity = identity === "CONTENDER" || identity === "PLAYOFF_TEAM";
  const isRebuildingIdentity = identity === "REBUILDING" || identity === "TANKING";

  const reasons = new Set<ReSigningReasonCode>();

  // The player's raw-rating Re-Signing ceiling vs. their age-adjusted "true"
  // fair value (computed internally by computePlayerTradeValue) is exactly
  // what lets an aging veteran look like real value on paper but a genuine
  // overpay once the age curve is applied - no separate age-based override
  // needed here, it falls out of a function that already exists.
  let value = computePlayerTradeValue({
    season: currentSeason,
    overallRating: player.overallRating,
    potentialRating: player.potentialRating,
    age: player.age,
    currentSalaryCents: offerSalaryCents,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: player.careerGamesMissedToInjury,
  });

  if (player.age <= YOUNG_AGE_THRESHOLD) {
    value = scaleCents(value, weights.youthValueMultiplier);
    if (isRebuildingIdentity) value = scaleCents(value, REBUILDING_YOUTH_PICK_BONUS);
  }
  if (player.age >= VETERAN_AGE_THRESHOLD) {
    value = scaleCents(value, weights.veteranValueMultiplier);
    if (isWinNowIdentity) value = scaleCents(value, CONTENDER_VETERAN_BONUS);
  }
  const tradeAssetShape = {
    type: "PLAYER" as const,
    position: player.position,
    overallRating: player.overallRating,
    potentialRating: player.potentialRating,
    age: player.age,
    currentSalaryCents: offerSalaryCents,
    injuryStatus: "HEALTHY" as const,
    careerGamesMissedToInjury: player.careerGamesMissedToInjury,
  };
  if (needs.some((need) => playerFillsNeed(tradeAssetShape, need))) {
    value = scaleCents(value, NEED_FIT_BONUS_MULTIPLIER);
    reasons.add("FILLS_A_NEED");
  }

  const score = offerSalaryCents > 0n ? Number(value) / Number(offerSalaryCents) : 0;

  const atOrOverRosterCeiling = rosterSizeBeforeThisDecision >= SOFT_ROSTER_CEILING;
  const effectiveThreshold =
    RESIGN_THRESHOLD *
    weights.acceptanceThresholdMultiplier *
    weights.badContractSensitivityMultiplier *
    (atOrOverRosterCeiling ? OVER_CEILING_THRESHOLD_MULTIPLIER : 1) *
    (player.hasStandingTradeRequest ? TRADE_REQUEST_THRESHOLD_MULTIPLIER : 1) *
    financialThresholdMultiplier;

  const decision = score >= effectiveThreshold ? "RESIGN" : "LET_WALK";
  reasons.add(decision === "RESIGN" ? "GOOD_VALUE" : "BAD_VALUE");
  if (decision === "LET_WALK" && atOrOverRosterCeiling) reasons.add("ROSTER_FULL");

  return { decision, score, reasons: [...reasons] };
}
