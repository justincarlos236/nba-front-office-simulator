import { generateContract, type GeneratedContract } from "../contracts/generateContract";
import { computePerformanceScore, type PlayerValuationStats } from "../valuation/playerValue";
import type { SeededContract } from "../data-sources/canonical";
import { deriveOverallRating, derivePotentialRating } from "./ratingFromStats";

export interface PlanLeaguePlayerInput {
  season: number;
  age: number;
  yearsOfExperience: number;
  stats: PlayerValuationStats;
  /** Games behind `stats` - how much of a season the production is drawn from. */
  gamesPlayed: number;
  /**
   * The imported scouting rating, when the dataset carries one. This is the
   * rating the league actually starts the player on, so it is also what prices
   * his contract - see the note below.
   */
  seedOverallRating: number | null;
  seedPotentialRating: number | null;
  /**
   * The player's real contract, when the dataset carries one. Used verbatim in
   * place of a generated deal - see `resolveContract`.
   */
  seededContract: SeededContract | null;
  /** Position, so a generated deal is priced the way the league pays it. */
  position?: string | null;
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
 * development ceiling, and a generated contract. Kept as a pure function (no
 * Prisma calls) so it's unit-testable on its own; the imperative shell that
 * creates the League/LeagueTeam/LeaguePlayer/Contract rows calls this once per
 * player when a user starts a new save (src/lib/actions/league.ts).
 *
 * **The rating this returns is the rating that prices the contract.** It used
 * to resolve the seed rating in the caller and the contract price here, off
 * `computePerformanceScore` instead - so a league player could be shown as a 79
 * and paid like an 88. Resolving both in one place is what keeps those from
 * drifting apart again; see docs/CONTRACT_AUDIT.md, C-P0-4.
 */
export function planLeaguePlayer(input: PlanLeaguePlayerInput): LeaguePlayerPlan {
  const performanceScore = computePerformanceScore(input.stats);
  const overallRating = input.seedOverallRating ?? deriveOverallRating(input.stats);
  const potentialRating =
    input.seedPotentialRating ?? derivePotentialRating(overallRating, input.age);

  const contract =
    resolveSeededContract(input.seededContract, input.season) ??
    generateContract({
      season: input.season,
      overallRating,
      performanceScore,
      gamesPlayed: input.gamesPlayed,
      age: input.age,
      yearsOfExperience: input.yearsOfExperience,
      position: input.position,
      seed: input.seed,
    });

  return { overallRating, potentialRating, contract };
}

/**
 * A real contract, converted to the shape the simulator stores - or null when
 * there isn't a usable one, in which case the caller generates.
 *
 * **A real deal is used verbatim.** No noise, no age curve, no rating anchor:
 * the whole point is that year one matches the real league rather than what the
 * valuation model thinks a player is worth. The generator takes over from the
 * moment this contract expires, which is where pricing off a rating is the
 * right behaviour rather than the wrong one.
 *
 * Rejects a contract that does not actually cover the season being seeded. A
 * deal that lapsed before the league starts describes a player who is really a
 * free agent, and seeding it would put a salary on a roster spot the real team
 * no longer pays for.
 */
function resolveSeededContract(
  seeded: SeededContract | null,
  season: number,
): GeneratedContract | null {
  if (!seeded || seeded.years.length === 0) return null;

  const years = seeded.years
    .filter((y) => y.season >= season && y.salaryCents > 0)
    .sort((a, b) => a.season - b.season);
  if (years.length === 0 || years[0].season !== season) return null;

  return {
    startSeason: season,
    endSeason: years[years.length - 1].season,
    years: years.map((y) => ({
      season: y.season,
      salaryCents: BigInt(y.salaryCents),
      // Real guarantee structure is not in the feed. Treating a seeded year as
      // fully guaranteed matches what the generator does and keeps every cap
      // sheet reading one rule rather than two.
      guaranteedCents: BigInt(y.salaryCents),
    })),
  };
}
