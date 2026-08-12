import { ageValueMultiplier } from "../valuation/ageCurve";
import { talentScore, tradeValueCents } from "../valuation/tradeValueCurve";
import {
  CLASS_SIZE,
  expectedRatingForPick,
  expectedPotentialForPick,
  OVERALL_AT_PICK_1,
  OVERALL_AT_PICK_60,
  POTENTIAL_AT_PICK_1,
  POTENTIAL_AT_PICK_60,
} from "../draft/generateDraftClass";
import { UPSIDE_WEIGHT } from "./playerTradeValue";

export interface DraftPickTradeValueInput {
  /** The season this trade is happening in - future picks are discounted relative to this. */
  currentSeason: number;
  /** Which draft class this pick belongs to. */
  pickSeason: number;
  round: 1 | 2;
  /** Known once that season's own draft has actually started - see `runDraftLotteryAction`. */
  overallPickNumber: number | null;
  /**
   * The pick's *original* team's current competitiveness percentile
   * (0 = league's worst, 1 = league's best) - used to project a likely
   * slot for a pick that hasn't been drafted yet. Deliberately the
   * original team, not whoever currently owns the pick via an earlier
   * trade - the pick's value depends on how that team's season goes, not
   * who's holding the pick today.
   */
  originalTeamCompetitivenessPercentile: number;
}

// Rookies enter the league young regardless of pick slot (see
// `generateDraftClass.ts`'s age range) - a fixed assumed age keeps this
// projection simple, since draft classes aren't generated far enough in
// advance to know an actual prospect's age for a future pick.
export const DRAFT_ROOKIE_ASSUMED_AGE = 20;
const ASSUMED_ROOKIE_AGE = DRAFT_ROOKIE_ASSUMED_AGE;

// Real 2nd-round picks are worth much less than their "expected talent"
// alone would suggest - non-guaranteed rookie contracts and much easier
// roster churn mean teams simply don't value them as highly as the talent
// curve implies.
const ROUND_2_VALUE_MULTIPLIER = 0.4;

// Compounding per-year discount for how far away a pick is - real trades
// discount future capital for uncertainty (team quality changes, the
// receiving team's own timeline shifts), not just because money-today
// beats money-later.
const YEARS_AWAY_DISCOUNT_PER_YEAR = 0.85;

/**
 * Projects which slot a not-yet-drafted pick will likely land in, from its
 * original team's current competitiveness (0 = league's worst, which
 * projects to pick 1 - the earliest, most valuable slot; 1 = league's
 * best, which projects to the last pick in the round). A simplification
 * of the real lottery (no weighted randomness modeled here, just a linear
 * projection) - reasonable for a relative value estimate, not a claim
 * about the actual future draft order.
 */
function projectedPickNumber(round: 1 | 2, competitivenessPercentile: number): number {
  const roundSize = CLASS_SIZE / 2;
  return round === 1
    ? Math.round(1 + competitivenessPercentile * (roundSize - 1))
    : Math.round(roundSize + 1 + competitivenessPercentile * (roundSize - 1));
}

/**
 * A comparable trade-value figure for a draft pick, in the same cents unit
 * `computePlayerTradeValue` uses, so picks and players can be summed and
 * compared directly in a trade. Team-direction weighting (rebuilders
 * valuing picks more than contenders do) happens one layer up in
 * `evaluateTradeOffer` (Phase 11c) - this is an objective baseline value.
 */
export function computeDraftPickTradeValue(input: DraftPickTradeValueInput): bigint {
  const pickNumber =
    input.overallPickNumber ??
    projectedPickNumber(input.round, input.originalTeamCompetitivenessPercentile);

  const expectedOverall = expectedRatingForPick(pickNumber, OVERALL_AT_PICK_1, OVERALL_AT_PICK_60);
  // Potential falls convexly across a class - see POTENTIAL_FALLOFF_EXPONENT.
  // Projecting it linearly here would value late picks well above what the
  // draft actually produces.
  const expectedPotential = expectedPotentialForPick(
    pickNumber,
    POTENTIAL_AT_PICK_1,
    POTENTIAL_AT_PICK_60,
  );

  // Same shape as a player: talent (current + discounted upside) prices the
  // asset, and age applies to the resulting money rather than to the score.
  // Feeding an age-scaled score into the curve compounds the two - see
  // `tradeValueCurve.ts` and docs/TRADE_AUDIT.md, T-P0-1.
  const score = talentScore(expectedOverall, expectedPotential, UPSIDE_WEIGHT);
  let valueCents = BigInt(
    Math.round(
      tradeValueCents(score, input.pickSeason) * ageValueMultiplier(ASSUMED_ROOKIE_AGE),
    ),
  );

  if (input.round === 2) {
    valueCents = BigInt(Math.round(Number(valueCents) * ROUND_2_VALUE_MULTIPLIER));
  }

  const yearsAway = Math.max(0, input.pickSeason - input.currentSeason);
  const yearsAwayMultiplier = YEARS_AWAY_DISCOUNT_PER_YEAR ** yearsAway;
  valueCents = BigInt(Math.round(Number(valueCents) * yearsAwayMultiplier));

  return valueCents > 0n ? valueCents : 0n;
}
