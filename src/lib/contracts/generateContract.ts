import {
  contractQualityScore,
  pickContractLength,
  priceContractCents,
  type ContractQualityInput,
} from "./priceContract";
import { createSeededRandom, randomInRange } from "./seededRandom";
import { contractYearSalaries } from "./contractRaises";

export interface GenerateContractInput extends ContractQualityInput {
  /** Season the contract is signed/starts in. */
  season: number;
  /** Drives both the age discount on salary and the length of the deal. */
  age: number;
  /** Years of NBA experience - drives the rookie-scale discount. */
  yearsOfExperience: number;
  /** Position, so the price reflects what the league pays for it. */
  position?: string | null;
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
    position: input.position,
    noise: randomInRange(rng, 0.85, 1.15),
  });

  const lengthYears = pickContractLength(quality, input.age, rng);
  const endSeason = input.season + lengthYears - 1;

  // Raises are a percentage of the first year, capped by the signing mechanism
  // - see contractRaises.ts. Bootstrap deals take the standard 5% ceiling
  // because the mechanism behind a seeded contract is not knowable; only a
  // team's own Bird re-signing earns 8%, and assuming that league-wide would
  // inflate every payroll.
  const years: GeneratedContractYear[] = contractYearSalaries(
    BigInt(Math.round(firstYearSalaryCents)),
    lengthYears,
    null,
  ).map((salaryCents, i) => ({
    season: input.season + i,
    salaryCents,
    guaranteedCents: salaryCents,
  }));

  return { startSeason: input.season, endSeason, years };
}
