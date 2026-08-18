import {
  contractQualityScore,
  pickContractLength,
  priceContractCents,
  type ContractQualityInput,
} from "./priceContract";
import { createSeededRandom, randomInRange } from "./seededRandom";
import { contractYearSalaries } from "./contractRaises";
import { rookieScaleSalaryCents, ROOKIE_CONTRACT_YEARS } from "./rookieScale";
import { getSeasonCapRules } from "../cap/constants";

export interface GenerateContractInput extends ContractQualityInput {
  /** Season the contract is signed/starts in. */
  season: number;
  /**
   * Where this player was drafted, for a rookie contract being written on draft
   * night. First-round picks take the rookie scale instead of market pricing -
   * see `rookieScale.ts`. Omitted (or a second-round slot) prices normally.
   */
  overallPickNumber?: number | null;
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

  // A first-round pick is paid by the scale, not by the market. This is the
  // whole reason a high pick is an asset: he is worth more than he costs, by a
  // margin the slot decides. See docs/audits/SALARY_SYSTEM_AUDIT.md P1-2.
  const scaleSalaryCents =
    input.overallPickNumber == null
      ? null
      : rookieScaleSalaryCents(
          input.overallPickNumber,
          getSeasonCapRules(input.season).salaryCapCents,
        );

  const lengthYears =
    scaleSalaryCents === null ? pickContractLength(quality, input.age, rng) : ROOKIE_CONTRACT_YEARS;
  const endSeason = input.season + lengthYears - 1;

  // Raises are a percentage of the first year, capped by the signing mechanism
  // - see contractRaises.ts. Bootstrap deals take the standard 5% ceiling
  // because the mechanism behind a seeded contract is not knowable; only a
  // team's own Bird re-signing earns 8%, and assuming that league-wide would
  // inflate every payroll.
  const years: GeneratedContractYear[] = contractYearSalaries(
    scaleSalaryCents ?? BigInt(Math.round(firstYearSalaryCents)),
    lengthYears,
    null,
  ).map((salaryCents, i) => ({
    season: input.season + i,
    salaryCents,
    guaranteedCents: salaryCents,
  }));

  return { startSeason: input.season, endSeason, years };
}
