import { getSeasonCapRules } from "../cap/constants";
import { clampToMaxSalary } from "../cap/maxSalary";
import { veteranMinimumCents } from "../cap/veteranMinimum";
import { ageValueMultiplier } from "../valuation/ageCurve";
import { scoreToCapFraction } from "../valuation/playerValue";

/**
 * The one place a player is turned into a salary.
 *
 * **Every pricing path calls this.** Before, four paths priced players four
 * different ways: league bootstrap applied the age curve, a rookie-scale
 * discount and negotiation noise; CPU re-signing applied none of the three; the
 * CPU free-agent market applied none of them either but read a different
 * quality input; and the draft applied a different subset again. Measured, a
 * 39-year-old at quality 85 re-signed for 82% more than the same man would have
 * been bootstrapped at - age risk was priced on one path and free on the other
 * three. See docs/CONTRACT_AUDIT.md, C-P1-3.
 */

/**
 * Games at which a season's box score is trusted outright. Below it, the box
 * score is blended back toward the player's scouted rating in proportion.
 *
 * **`gamesPlayed` used to reach no valuation at all** - it is not a field on
 * `PlayerValuationStats`, so an eleven-game hot streak and an eighty-two-game
 * season were identical evidence. Measured on the seeded roster that put Ty
 * Jerome (15 games) on $51.5M, the third-highest salary in the league, and
 * Cormac Ryan (11 games) on $46.4M. 164 of 537 players in the dataset have
 * fewer than 40 games. See C-P0-2.
 *
 * 58 is roughly 70% of a season - enough that a real starter's line is
 * established, low enough that an ordinary injury absence is not punished.
 */
const FULL_SAMPLE_GAMES = 58;

/**
 * How far a fully-trusted season of production may move a player's price away
 * from his scouted rating.
 *
 * **The anchor is `overallRating`, not the box score, and that inverts what the
 * code used to do.** `overallRating` is the game's own statement of how good a
 * player is - it is what the interface shows, what trade value reads, what
 * development mutates. `computePerformanceScore` is a noisy estimate of the
 * same thing from one season of counting stats. Pricing off the estimate while
 * displaying the statement is why a player could show 79 and earn like an 88,
 * and it is what made the bug visible: 15 of 450 rostered players disagree by
 * ten points or more between the two. See C-P0-4.
 *
 * 0.3 says a full season of production moves a player 30% of the way from his
 * rating toward what his box score claims - real evidence, not the whole story.
 * Higher values re-import the same defect: at 1.0, measured, the correlation
 * between salary and displayed rating falls from 0.87 back to 0.83 and the
 * league's centres drift +3.2 rating points above what they are shown as.
 */
const PERFORMANCE_TILT = 0.3;

/**
 * `overallRating` and `computePerformanceScore` are not the same scale, and
 * this is the constant that reconciles them.
 *
 * `scoreToCapFraction` was calibrated against production scores. Anchoring the
 * price on the rating without translating it first fed that curve a scale it
 * was not built for and cost 10% of league payroll, which would have quietly
 * undone the calibration docs/FINANCE_AUDIT.md P0-1 established.
 *
 * **1.8, not the 1.13 the means differ by.** Measured across 450 rostered
 * players, a production score runs 1.13 points above the scouted rating for the
 * same man - and unevenly: +0.3 for point guards, +3.7 for centres. But
 * `scoreToCapFraction` is a logistic, so matching the two scales at the mean
 * does not preserve what the aggregate depends on; a point is worth far more
 * money near the top of the curve than near the floor, and mean-matching still
 * left the league 3.9% light and 28 of 30 clubs profitable against a real
 * 20-25. 1.8 is the offset at which the rating scale reproduces league payroll
 * through this curve: $5,103.8M against a real $5,100M, 25 of 30 profitable,
 * net income +$2.16B against the +$2.14B the finance audit signed off.
 *
 * **The correction lives here rather than in the curve on purpose.**
 * `scoreToCapFraction` is shared with `computePlayerTradeValue`, and moving its
 * midpoint to recover the payroll also compressed trade values - measured, an
 * 85-rated player fell from 16.1x a 65-rated player to 11.9x, which silently
 * changed which CPU trades clear. The scale changed in this module, so the
 * translation belongs in this module.
 */
export const RATING_TO_PRODUCTION_SCALE = 1.8;

export interface ContractQualityInput {
  /** The game's rating for this player - the anchor. */
  overallRating: number;
  /**
   * `computePerformanceScore` on the player's season. Null when no season
   * exists (a drafted rookie, a generated prospect), in which case the rating
   * stands alone.
   */
  performanceScore: number | null;
  /** Games behind `performanceScore`. Ignored when that is null. */
  gamesPlayed: number;
}

/**
 * What the market prices: a player's rating, corrected by however much of a
 * season stands behind his production.
 */
export function contractQualityScore(input: ContractQualityInput): number {
  // The rating, restated on the production scale so the two are comparable and
  // so what reaches `scoreToCapFraction` is the scale that curve expects.
  const anchor = input.overallRating + RATING_TO_PRODUCTION_SCALE;
  if (input.performanceScore === null) return anchor;

  const confidence = Math.min(1, Math.max(0, input.gamesPlayed) / FULL_SAMPLE_GAMES);
  return anchor + confidence * PERFORMANCE_TILT * (input.performanceScore - anchor);
}

/**
 * Rookie-scale contracts pay well below veteran market value regardless of a
 * rookie's actual impact (that's the point of the scale) - this approximates
 * that discount by years of experience rather than modeling the real per-pick
 * rookie scale table exactly.
 */
export function rookieScaleDiscount(yearsOfExperience: number): number {
  if (yearsOfExperience <= 0) return 0.35;
  if (yearsOfExperience === 1) return 0.4;
  if (yearsOfExperience === 2) return 0.45;
  if (yearsOfExperience === 3) return 0.55;
  return 1;
}

/**
 * What the league actually pays a position, relative to what a player's rating
 * alone predicts.
 *
 * **Quality and price are different things, and this is where they separate.**
 * docs/RATING_AUDIT.md R-P1-1 found centres rated about ten rank places above
 * what the market pays them and forwards about eleven below, and it could not
 * tell whether the rating model was wrong or the league simply values positions
 * differently. The follow-up settled it: within each position the model's
 * correlation with real salary is 0.73-0.88, and the two positions supposedly
 * biased - centres at 0.850 and power forwards at 0.877 - rank *best* of all
 * five. The model measures quality fine. The league pays centres less.
 *
 * So the correction belongs here rather than in the rating. A rating stays an
 * honest claim about how good a player is; the price reflects what his position
 * commands, which is exactly how the two come apart in reality.
 *
 * Measured as actual pay over rating-predicted pay across 213 veterans on real
 * contracts, then normalized so the league's total payroll is unchanged - this
 * moves money between positions, it does not create or destroy any. Reproduce
 * with `scripts/rating-audit.ts`.
 */
const POSITIONAL_MARKET_FACTOR: Record<string, number> = {
  PG: 0.917,
  SG: 0.978,
  SF: 1.149,
  PF: 1.066,
  C: 0.89,
};

/** 1.0 - no adjustment - for anything without a recognised position. */
export function positionalMarketFactor(position: string | null | undefined): number {
  if (!position) return 1;
  return POSITIONAL_MARKET_FACTOR[position.toUpperCase()] ?? 1;
}

export interface PriceContractInput {
  season: number;
  /** From `contractQualityScore`. */
  quality: number;
  age: number;
  yearsOfExperience: number;
  /**
   * Negotiation noise, typically 0.85-1.15 from the seeded RNG. Omitted by
   * paths that quote a price rather than strike a deal - a re-signing ceiling
   * and a free agent's asking price are figures, not outcomes.
   */
  noise?: number;
  /**
   * The player's position, so the price reflects what the league pays for it -
   * see `POSITIONAL_MARKET_FACTOR`. Omitted means no adjustment.
   */
  position?: string | null;
}

/**
 * A player's salary for one season, in cents.
 *
 * Order matters and is the same on every path: value the quality, discount for
 * age, discount for rookie scale, apply negotiation noise, then clamp between
 * the league minimum and the individual maximum. The clamp is last so nothing
 * upstream can escape it.
 */
export function priceContractCents(input: PriceContractInput): number {
  const rules = getSeasonCapRules(input.season);
  const value =
    Number(rules.salaryCapCents) *
    scoreToCapFraction(input.quality) *
    ageValueMultiplier(input.age) *
    rookieScaleDiscount(input.yearsOfExperience) *
    positionalMarketFactor(input.position) *
    (input.noise ?? 1);

  // Floored at this player's OWN minimum, which scales with service. It used
  // to floor at `emptyRosterChargeCents` - the cap hold for an empty roster
  // spot, a different rule entirely, and about a third of a ten-year veteran's
  // real minimum. See docs/CONTRACT_AUDIT.md C-P2-1.
  const floored = Math.max(
    value,
    Number(veteranMinimumCents(input.season, input.yearsOfExperience)),
  );
  return Math.round(
    clampToMaxSalary(floored, input.age, input.season, input.yearsOfExperience),
  );
}

/**
 * How many years the deal runs.
 *
 * **Length used to be near-random with respect to quality.** The old three
 * buckets keyed off a score whose floor was 60, so essentially every rostered
 * player fell in the same 2-4 year band: measured, superstars averaged 3.2
 * years and all-stars 3.7 - the ordering was flat and partly inverted - while
 * 130 of 450 players rated under 70 held 3+ year guaranteed deals. See C-P1-5.
 *
 * Two rules, in the order a front office actually applies them: quality buys
 * term, then age takes it back. A 34-year-old star gets star money on a short
 * deal, which is what real teams do and what the old code claimed to do but
 * did not.
 */
export function pickContractLength(quality: number, age: number, rng: () => number): number {
  const base =
    quality >= 85
      ? randomLength(4, 5, rng)
      : quality >= 78
        ? randomLength(3, 4, rng)
        : quality >= 70
          ? randomLength(2, 3, rng)
          : randomLength(1, 2, rng);

  // Decline risk caps term regardless of how good a player is now.
  const ageCeiling = age >= 35 ? 1 : age >= 33 ? 2 : age >= 31 ? 3 : 5;
  return Math.max(1, Math.min(base, ageCeiling));
}

function randomLength(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
