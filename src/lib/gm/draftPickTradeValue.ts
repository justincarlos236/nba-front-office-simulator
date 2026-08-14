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
import {
  lotterySlotDistributionForSeed,
  LOTTERY_SEED_COUNT,
} from "../draft/draftLottery";
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
 * original team's current competitiveness (0 = league's worst, 1 = league's
 * best).
 *
 * **First-round picks belonging to lottery teams go through the lottery.**
 * This used to map competitiveness straight onto a slot, so the worst team
 * projected to pick 1 - a certainty the real rules explicitly removed. Post
 * 2019 reform the three worst records share a flat 14%, and the worst team
 * actually lands at pick 1 about one year in seven; its expected slot is 3.66,
 * not 1. Pricing off the best possible outcome overvalued a bottom team's
 * future first by 47%, which a user could sell at that price with tanking as
 * the way to acquire one. See docs/DRAFT_AUDIT.md, D-P1-1.
 *
 * `expectedLotterySlotForSeed` computes that expectation exactly from the same
 * odds table `runLottery` draws against, so the valuation and the draw cannot
 * disagree.
 *
 * Picks outside the lottery keep the straight reverse-standings map, because
 * that is exactly how those slots are assigned - there is no randomness to
 * model. Second-round picks likewise: the lottery does not touch round two.
 */
function standingsRankFor(competitivenessPercentile: number): number {
  const roundSize = CLASS_SIZE / 2;
  return Math.round(1 + competitivenessPercentile * (roundSize - 1));
}

function projectedPickNumber(round: 1 | 2, competitivenessPercentile: number): number {
  const roundSize = CLASS_SIZE / 2;
  const standingsRank = standingsRankFor(competitivenessPercentile);
  return round === 2 ? roundSize + standingsRank : standingsRank;
}

/**
 * A comparable trade-value figure for a draft pick, in the same cents unit
 * `computePlayerTradeValue` uses, so picks and players can be summed and
 * compared directly in a trade. Team-direction weighting (rebuilders
 * valuing picks more than contenders do) happens one layer up in
 * `evaluateTradeOffer` (Phase 11c) - this is an objective baseline value.
 */
export function computeDraftPickTradeValue(input: DraftPickTradeValueInput): bigint {
  // A first-rounder belonging to a lottery team has no single slot to price -
  // it has a distribution. Pick value is strongly convex in slot (pick 1 is
  // worth about eight times pick 30), so averaging the VALUE across that
  // distribution is not the same as valuing the average SLOT: the latter
  // underprices a lottery pick by about 5%. Everything else - a known slot, a
  // playoff team's pick, any second-rounder - has a single deterministic slot
  // and takes the straight path.
  if (input.overallPickNumber === null && input.round === 1) {
    const standingsRank = standingsRankFor(input.originalTeamCompetitivenessPercentile);
    if (standingsRank <= LOTTERY_SEED_COUNT) {
      const distribution = lotterySlotDistributionForSeed(standingsRank);
      let expectedCents = 0;
      distribution.forEach((probability, i) => {
        if (probability <= 0) return;
        expectedCents += probability * Number(valueForSlot(i + 1, input));
      });
      return BigInt(Math.max(0, Math.round(expectedCents)));
    }
  }

  return valueForSlot(
    input.overallPickNumber ??
      projectedPickNumber(input.round, input.originalTeamCompetitivenessPercentile),
    input,
  );
}

/** The value of this pick if it lands at exactly `pickNumber`. */
function valueForSlot(pickNumber: number, input: DraftPickTradeValueInput): bigint {
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
