import {
  contractQualityScore,
  pickContractLength,
  priceContractCents,
  type ContractQualityInput,
} from "./priceContract";
import { createSeededRandom, randomInRange } from "./seededRandom";

export interface GenerateContractInput extends ContractQualityInput {
  /** Season the contract is signed/starts in. */
  season: number;
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
 * Generates a plausible contract for a player from their rating, their season's
 * production and deterministic negotiation noise - see docs/SYSTEMS.md for why
 * contracts are simulated rather than hand-curated real salaries.
 *
 * The money itself is `priceContractCents`, shared with every other pricing
 * path; what this function adds is the noise, the term and the raise structure
 * of an actual signed deal.
 */
export function generateContract(input: GenerateContractInput): GeneratedContract {
  const rng = createSeededRandom(input.seed);

  const quality = contractQualityScore(input);

  const firstYearSalaryCents = priceContractCents({
    season: input.season,
    quality,
    age: input.age,
    yearsOfExperience: input.yearsOfExperience,
    noise: randomInRange(rng, 0.85, 1.15),
  });

  const lengthYears = pickContractLength(quality, input.age, rng);
  const endSeason = input.season + lengthYears - 1;

  const years: GeneratedContractYear[] = [];
  for (let i = 0; i < lengthYears; i++) {
    // Modest year-over-year raise, matching how most real contracts are structured.
    const salaryCents = BigInt(Math.round(firstYearSalaryCents * (1 + 0.05 * i)));
    years.push({
      season: input.season + i,
      salaryCents,
      guaranteedCents: salaryCents,
    });
  }

  return { startSeason: input.season, endSeason, years };
}
