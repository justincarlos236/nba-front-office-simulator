/**
 * Whether a free agent would accept the user's offer.
 *
 * **This is the check that did not exist.** `signFreeAgentAction` validated
 * that an offer was legal under the cap and then wrote the contract, and a
 * minimum-salary offer is unconditionally legal - correct CBA modelling, since
 * the minimum genuinely is the one exception no apron restricts. So any free
 * agent in the game signed for the veteran minimum, from a second-apron team
 * with zero cap space, at up to a 35x discount to market. See
 * docs/FREE_AGENCY_AUDIT.md, FA-P0-1.
 *
 * Deliberately separate from `validateSigning`. That function answers a cap
 * question and answers it well; this is a different question and belongs
 * beside the roster-size limit in the action, which was added there for the
 * same reason.
 *
 * The asymmetry this closes (FA-P1-1): rival clubs are bound by cap space, a
 * spend ceiling and their GM's judgement, while the user was bound by none of
 * it. The more faithfully the CPU market respected the cap, the more talent it
 * left sitting for a user who did not have to.
 *
 * Pure. The caller supplies the asking price and the suitor count.
 */
import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";

/**
 * What a player with no other offers will settle for, as a fraction of his
 * asking price.
 *
 * Not 1.0, because a market with no buyers genuinely does move a player's
 * price - a free agent nobody wants takes what he can get, and a system where
 * every player holds out for full value regardless of demand is as unrealistic
 * as one where everyone signs for the minimum. Not lower, because 60% of
 * market is already a substantial bargain and the point is to remove a 35x
 * discount, not to replace it with a 2x one.
 */
const NO_DEMAND_FLOOR = 0.6;

/**
 * How many rival suitors it takes before a player insists on his full asking
 * price. Three is where `computeRivalInterest` starts describing interest as
 * strong, so the two agree about what a crowded market looks like.
 */
const SUITORS_FOR_FULL_PRICE = 3;

/**
 * Tiers that will sign for the minimum when nobody else is bidding.
 *
 * Real teams fill out rosters with minimum deals and this must keep working -
 * it is the legitimate use of the mechanism, and blocking it would make a
 * 13-man roster requirement unmeetable. The line sits below STARTER, so the
 * players available this way are the ones who really are available this way.
 */
const MINIMUM_DEAL_TIERS: readonly PlayerValueTier[] = ["MINIMUM", "ROTATION"];

export interface FreeAgentOfferInput {
  /**
   * What this player commands, already adjusted for demand - the same figure
   * `demandAdjustedPriceCents` charges a rival club, so the user and the CPU
   * are quoted the same market.
   */
  askingPriceCents: bigint;
  offerSalaryCents: bigint;
  /** Rival clubs with both the room and the motivation to sign him. */
  rivalSuitors: number;
  valueTier: PlayerValueTier;
  /** The league minimum for this season; no player can require less. */
  minimumSalaryCents: bigint;
}

export interface FreeAgentOfferDecision {
  accepted: boolean;
  /** The lowest offer this player would have taken. */
  requiredSalaryCents: bigint;
}

export function evaluateFreeAgentOffer(input: FreeAgentOfferInput): FreeAgentOfferDecision {
  const { askingPriceCents, offerSalaryCents, rivalSuitors, valueTier, minimumSalaryCents } = input;

  const demandFraction =
    NO_DEMAND_FLOOR +
    (1 - NO_DEMAND_FLOOR) * Math.min(1, Math.max(0, rivalSuitors) / SUITORS_FOR_FULL_PRICE);

  let requiredCents = BigInt(Math.round(Number(askingPriceCents) * demandFraction));

  // A fringe player with nobody else bidding signs for the minimum. Without
  // this, filling the back of a roster becomes impossible.
  if (rivalSuitors === 0 && MINIMUM_DEAL_TIERS.includes(valueTier)) {
    requiredCents = minimumSalaryCents;
  }

  // Nobody holds out for less than the league minimum.
  if (requiredCents < minimumSalaryCents) requiredCents = minimumSalaryCents;

  return {
    accepted: offerSalaryCents >= requiredCents,
    requiredSalaryCents: requiredCents,
  };
}
