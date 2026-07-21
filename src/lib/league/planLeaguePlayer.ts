import { generateContract, type GeneratedContract } from "../contracts/generateContract";
import { ageValueMultiplier } from "../valuation/ageCurve";
import { computePerformanceScore, type PlayerValuationStats } from "../valuation/playerValue";
import { deriveOverallRating, derivePotentialRating } from "./ratingFromStats";

export interface PlanLeaguePlayerInput {
  season: number;
  age: number;
  yearsOfExperience: number;
  stats: PlayerValuationStats;
  /** Deterministic seed for contract generation - typically the reference Player.id. */
  seed: string;
}

export interface LeaguePlayerPlan {
  overallRating: number;
  potentialRating: number;
  contract: GeneratedContract;
}

/**
 * The functional core of "bootstrap a league from the reference snapshot":
 * given one player's real stats and age, derive their starting rating,
 * development ceiling, and a generated contract. Kept as a pure function
 * (no Prisma calls) so it's unit-testable on its own; the imperative shell
 * that actually creates League/LeagueTeam/LeaguePlayer/Contract rows will
 * call this once per player when a user starts a new save (see
 * docs/ROADMAP.md, M5 - that shell needs a real signed-in user and isn't
 * built yet).
 */
export function planLeaguePlayer(input: PlanLeaguePlayerInput): LeaguePlayerPlan {
  const overallRating = deriveOverallRating(input.stats);
  const potentialRating = derivePotentialRating(overallRating, input.age);

  const performanceScore = computePerformanceScore(input.stats);
  const ageAdjustedScore = Math.min(99, performanceScore * ageValueMultiplier(input.age));

  const contract = generateContract({
    season: input.season,
    ageAdjustedScore,
    yearsOfExperience: input.yearsOfExperience,
    seed: input.seed,
  });

  return { overallRating, potentialRating, contract };
}
