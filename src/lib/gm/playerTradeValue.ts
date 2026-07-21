import { getSeasonCapRules } from "../cap/constants";
import { scoreToCapFraction } from "../valuation/playerValue";
import { ageValueMultiplier } from "../valuation/ageCurve";

/**
 * A single comparable trade-value figure for a player, expressed in cents
 * (same unit as salary) so it can be summed directly against draft-pick
 * values and compared side-by-side in a trade. Combines current
 * production, age (timeline fit), untapped potential (upside), contract
 * quality (bargain vs. overpay), and injury risk - the five player-level
 * factors from the design brief. Team-direction weighting (how much a
 * given team's identity/personality *cares* about upside vs. proven
 * production) happens one layer up in `evaluateTradeOffer` (Phase 11c),
 * not here - this is an objective baseline, same separation
 * `draftPickTradeValue.ts` uses for picks.
 */
export interface PlayerTradeValueInput {
  season: number;
  overallRating: number;
  potentialRating: number;
  age: number;
  currentSalaryCents: bigint;
  injuryStatus: "HEALTHY" | "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
  /** Career total, not current-injury duration - see `LeaguePlayer.careerGamesMissedToInjury`. */
  careerGamesMissedToInjury: number;
}

// Untapped potential matters, but proven current production matters more -
// a player who's already reached a given rating is a known quantity, while
// the same potential in an unproven player carries real bust risk. Exported
// for reuse by `draftPickTradeValue.ts`, which values a not-yet-drafted
// pick's projected upside the same way.
export const UPSIDE_WEIGHT = 0.4;

// A genuine bargain or a real overpay should meaningfully swing trade
// value, but shouldn't completely override how good the player actually
// is - a superstar on a slight overpay is still enormously valuable.
const CONTRACT_SURPLUS_WEIGHT = 0.5;

const INJURY_STATUS_MULTIPLIER: Record<PlayerTradeValueInput["injuryStatus"], number> = {
  HEALTHY: 1,
  DAY_TO_DAY: 0.97,
  OUT: 0.85,
  SEASON_ENDING: 0.6,
};

// Each career game missed to injury nudges value down slightly - an
// injury-prone player is a real (if modest) ongoing risk even while
// currently healthy. Capped so a long injury history can't zero out an
// otherwise great player's value entirely.
const CAREER_INJURY_DISCOUNT_PER_GAME = 0.002;
const MAX_CAREER_INJURY_DISCOUNT = 0.3;

export function computePlayerTradeValue(input: PlayerTradeValueInput): bigint {
  const rules = getSeasonCapRules(input.season);

  const ageAdjustedScore = Math.min(100, input.overallRating * ageValueMultiplier(input.age));
  const upsideGap = Math.max(0, input.potentialRating - input.overallRating);
  const grossScore = Math.min(100, ageAdjustedScore + upsideGap * UPSIDE_WEIGHT);
  const grossValueCents = BigInt(
    Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(grossScore)),
  );

  // Fair value for the player's *current* production only (no upside
  // bonus) - what the market would actually pay them today, the baseline
  // "is this contract a bargain" comparison needs.
  const fairValueTodayCents = BigInt(
    Math.round(Number(rules.salaryCapCents) * scoreToCapFraction(ageAdjustedScore)),
  );
  const surplusCents = fairValueTodayCents - input.currentSalaryCents;

  const totalValueCents =
    grossValueCents + BigInt(Math.round(Number(surplusCents) * CONTRACT_SURPLUS_WEIGHT));

  const careerInjuryDiscount = Math.min(
    MAX_CAREER_INJURY_DISCOUNT,
    input.careerGamesMissedToInjury * CAREER_INJURY_DISCOUNT_PER_GAME,
  );
  const totalMultiplier = INJURY_STATUS_MULTIPLIER[input.injuryStatus] * (1 - careerInjuryDiscount);

  const finalValueCents = BigInt(Math.round(Number(totalValueCents) * totalMultiplier));
  return finalValueCents > 0n ? finalValueCents : 0n;
}
