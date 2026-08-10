import { getSeasonCapRules } from "../cap/constants";
import { ageAdjustedMarketValueCents } from "../valuation/playerValue";
import { ageValueMultiplier } from "../valuation/ageCurve";
import { createSeededRandom, randomInRange } from "./seededRandom";

export interface GenerateContractInput {
  /** Season the contract is signed/starts in. */
  season: number;
  /** Un-aged on-court production score (0-100) from the valuation model. */
  performanceScore: number;
  /** Drives both the age discount on salary and the length of the deal. */
  age: number;
  /** Years of NBA experience - drives the rookie-scale discount. */
  yearsOfExperience: number;
  /** Deterministic seed (e.g. the player's id) so re-running the seed produces the same contracts. */
  seed: string;
}

export interface GeneratedContractYear {
  season: number;
  salaryCents: bigint;
  guaranteedCents: bigint;
}

export interface GeneratedContract {
  startSeason: number;
  endSeason: number;
  years: GeneratedContractYear[];
}

/**
 * Rookie-scale contracts pay well below veteran market value regardless of
 * a rookie's actual impact (that's the point of the scale) - this
 * approximates that discount by years of experience rather than modeling
 * the real per-pick rookie scale table exactly.
 */
function rookieScaleDiscount(yearsOfExperience: number): number {
  if (yearsOfExperience <= 0) return 0.35;
  if (yearsOfExperience === 1) return 0.4;
  if (yearsOfExperience === 2) return 0.45;
  if (yearsOfExperience === 3) return 0.55;
  return 1;
}

function pickContractLength(ageAdjustedScore: number, rng: () => number): number {
  if (ageAdjustedScore >= 80)
    return rng() < 0.6 ? randomLength(4, 5, rng) : randomLength(2, 3, rng);
  if (ageAdjustedScore >= 55) return randomLength(2, 4, rng);
  return randomLength(1, 2, rng);
}

function randomLength(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Generates a plausible contract for a player from their valuation-model
 * score plus deterministic negotiation noise - see docs/SYSTEMS.md
 * for why contracts are simulated rather than hand-curated real salaries.
 */
export function generateContract(input: GenerateContractInput): GeneratedContract {
  const rules = getSeasonCapRules(input.season);
  const rng = createSeededRandom(input.seed);

  // The age discount applies to the money, not to the score - see
  // `ageAdjustedMarketValueCents` for why that distinction is load-bearing.
  const marketValueCents = ageAdjustedMarketValueCents({
    score: input.performanceScore,
    age: input.age,
    season: input.season,
  });

  const discount = rookieScaleDiscount(input.yearsOfExperience);
  const negotiationNoise = randomInRange(rng, 0.85, 1.15);
  const rawSalaryCents = BigInt(Math.round(Number(marketValueCents) * discount * negotiationNoise));

  const floorCents = rules.emptyRosterChargeCents; // roughly a veteran-minimum-scale floor
  const firstYearSalaryCents = rawSalaryCents < floorCents ? floorCents : rawSalaryCents;

  // Length still keys off the age-adjusted score, where the compounding is
  // wanted: a 37-year-old star should command star money on a short deal,
  // not a five-year one.
  const ageAdjustedScore = Math.min(99, input.performanceScore * ageValueMultiplier(input.age));
  const lengthYears = pickContractLength(ageAdjustedScore, rng);
  const endSeason = input.season + lengthYears - 1;

  const years: GeneratedContractYear[] = [];
  for (let i = 0; i < lengthYears; i++) {
    // Modest year-over-year raise, matching how most real contracts are structured.
    const salaryCents = BigInt(Math.round(Number(firstYearSalaryCents) * (1 + 0.05 * i)));
    years.push({
      season: input.season + i,
      salaryCents,
      guaranteedCents: salaryCents,
    });
  }

  return { startSeason: input.season, endSeason, years };
}
