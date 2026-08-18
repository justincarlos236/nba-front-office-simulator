import { ageAdjustedMarketValueCents } from "../valuation/playerValue";
import { ageValueMultiplier } from "../valuation/ageCurve";
import { talentScore, tradeValueCents } from "../valuation/tradeValueCurve";

/**
 * A single comparable trade-value figure for a player, expressed in cents
 * (same unit as salary) so it can be summed directly against draft-pick
 * values and compared side-by-side in a trade. Combines current
 * production, age (timeline fit), untapped potential (upside), contract
 * quality (bargain vs. overpay), and injury risk - the five player-level
 * factors from the design brief. Team-direction weighting (how much a
 * given team's identity/personality *cares* about upside vs. proven
 * production) happens one layer up in `evaluateTradeOffer`, not here -
 * this is an objective baseline, same separation `draftPickTradeValue.ts`
 * uses for picks.
 */
export interface PlayerTradeValueInput {
  season: number;
  overallRating: number;
  potentialRating: number;
  age: number;
  currentSalaryCents: bigint;
  /**
   * Salaries for the seasons *after* this one, in order. Empty or omitted
   * means an expiring deal.
   *
   * **Contract length used to be invisible here**, and that made a five-year
   * albatross and a one-year expiring deal at the same salary price
   * identically - so the entire expiring-contract dimension of real trades
   * could not be expressed, and "take on two bad years to get a pick" was not a
   * decision the game could represent. See docs/TRADE_AUDIT.md.
   *
   * Optional so callers that genuinely only know this season's number (a
   * hypothetical offer being priced, a projected rookie) keep the old
   * single-year behaviour rather than silently assuming a length.
   */
  futureSalaryCents?: bigint[];
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

// A future year of a contract is worth less than this one, for the same reason
// a future draft pick is: the further out it sits, the less certain it is that
// the player is still worth what the model says today. Deliberately the same
// 0.85 `draftPickTradeValue.ts` applies per year away - one notion of "the
// future is uncertain" across the trade model, not two.
const FUTURE_YEAR_DISCOUNT = 0.85;

/**
 * Trade value split into the two things a GM actually reasons about
 * separately: how good the player is, and what his contract does to that.
 *
 * They are exposed apart because `evaluateTradeOffer` needs to treat them
 * differently by direction. A team's philosophy (loves youth, wants
 * veterans, needs a centre) reweights *talent* symmetrically - it must
 * value the same player the same whether he is arriving or leaving, or the
 * model is arbitrageable. Aversion to bad money is genuinely one-sided:
 * `badContractSensitivityMultiplier` is about what you are willing to take
 * ON, and applies to incoming salary only.
 */
export interface PlayerTradeValueParts {
  /** Age-, injury- and potential-adjusted value of the player himself, always >= 0. */
  talentValueCents: bigint;
  /** Positive when he is underpaid, negative when he is an overpay. */
  contractSurplusCents: bigint;
}

export function computePlayerTradeValueParts(input: PlayerTradeValueInput): PlayerTradeValueParts {
  const score = talentScore(input.overallRating, input.potentialRating, UPSIDE_WEIGHT);

  // Age discounts the MONEY, never the score. Multiplying it into the score
  // and then pushing that through a logistic compounds the two: a documented
  // 35% discount for a 37-year-old became a 96% one, and Curry, Durant,
  // LeBron, Kawhi, Harden, Butler, Lillard, George, Gobert and DeRozan were
  // all worth exactly zero in trade. See docs/TRADE_AUDIT.md, T-P0-1, and the
  // same correction already made for salaries in `playerValue.ts`.
  const grossValueCents = tradeValueCents(score, input.season) * ageValueMultiplier(input.age);

  const careerInjuryDiscount = Math.min(
    MAX_CAREER_INJURY_DISCOUNT,
    input.careerGamesMissedToInjury * CAREER_INJURY_DISCOUNT_PER_GAME,
  );
  // Injury risk discounts the *asset*, not the contract - applying it to the
  // combined figure would make an injured albatross a smaller liability than
  // a healthy one.
  const riskMultiplier = INJURY_STATUS_MULTIPLIER[input.injuryStatus] * (1 - careerInjuryDiscount);

  // What the market would actually pay him today: current production only, no
  // upside credit. `ageAdjustedMarketValueCents` is the salary-scale model and
  // the right comparison for a salary - the trade curve is a different scale
  // entirely and would read every star as massively underpaid.
  const fairSalaryCents = ageAdjustedMarketValueCents({
    score: input.overallRating,
    age: input.age,
    season: input.season,
  });

  // Every remaining year is its own bargain or its own liability, so the deal
  // is worth the sum of them rather than this season alone. Each future year is
  // priced at the age the player will actually be, which is what makes a long
  // deal for a 33-year-old read differently from the same deal for a 25-year-old.
  let surplusCents = fairSalaryCents - input.currentSalaryCents;
  const future = input.futureSalaryCents ?? [];
  for (let i = 0; i < future.length; i++) {
    const fairThatYear = ageAdjustedMarketValueCents({
      score: input.overallRating,
      age: input.age + 1 + i,
      season: input.season + 1 + i,
    });
    const discount = FUTURE_YEAR_DISCOUNT ** (i + 1);
    surplusCents += BigInt(Math.round(Number(fairThatYear - future[i]) * discount));
  }

  return {
    talentValueCents: BigInt(Math.round(grossValueCents * riskMultiplier)),
    contractSurplusCents: surplusCents,
  };
}

/**
 * The player's total objective trade value.
 *
 * **This can be negative, and that is the point.** It used to be clamped at
 * zero, which meant a bad contract was never a liability: a $100M albatross
 * and a $150M albatross priced identically, and every CPU team - including
 * the Salary-Conscious one - would absorb a 70-rated 33-year-old on $50M for
 * nothing. That voided the cap as a constraint on the user, since any
 * difficult contract could be handed away for free in unlimited quantity.
 *
 * The downside is bounded without a magic number: talent value is never
 * negative and surplus is never worse than the full salary, so the floor is
 * -0.5x the player's salary. Shifting a genuine albatross costs real assets,
 * which is what it should cost.
 */
export function computePlayerTradeValue(input: PlayerTradeValueInput): bigint {
  const { talentValueCents, contractSurplusCents } = computePlayerTradeValueParts(input);
  return (
    talentValueCents + BigInt(Math.round(Number(contractSurplusCents) * CONTRACT_SURPLUS_WEIGHT))
  );
}

export { CONTRACT_SURPLUS_WEIGHT };
