/**
 * The veteran minimum salary, which scales with years of service.
 *
 * **This was `emptyRosterChargeCents`, which is a different thing entirely.**
 * That constant is the *cap hold* charged against a team's books for each
 * roster spot below twelve — a real CBA concept, correctly used by
 * `computeCapSheet`. It was also standing in as the minimum *salary* in four
 * places: `validateSigning`'s always-legal branch, the acceptance floor in
 * `signFreeAgentAction`, in-season CPU signings, and the price floor in
 * `priceContractCents`. Two unrelated rules sharing one number, and the number
 * belonged to the other one.
 *
 * It was also just too low. `docs/CONTRACT_AUDIT.md` C-P2-1 measured 39 players
 * pinned to a $1.3M minimum against a real scale of roughly $2.1M to $3.6M.
 *
 * **Real minimums are a service-year scale, not a single figure.** A rookie
 * minimum and a ten-year veteran's minimum differ by about 3x, which is why
 * veteran-minimum contracts are a real roster-building tool rather than a
 * rounding error: signing a proven veteran to one costs meaningfully more than
 * signing a rookie.
 *
 * Expressed as fractions of the salary cap rather than dollar figures, because
 * the CBA ties the minimum scale to the cap — so this stays correct for any
 * season in `SEASON_CAP_RULES` without a second table to keep in sync.
 */
import { getSeasonCapRules } from "./constants";

/**
 * Minimum salary as a share of the salary cap, indexed by years of service.
 * Index 10 covers ten years and above.
 *
 * Derived from the published 2025-26 scale against that season's $154.6M cap:
 * $1.27M for a rookie through $3.64M at ten years.
 */
const MINIMUM_AS_CAP_FRACTION: readonly number[] = [
  0.0082, // 0 years - rookie minimum
  0.0133, // 1
  0.0149, // 2
  0.0154, // 3
  0.0159, // 4
  0.0173, // 5
  0.0186, // 6
  0.0199, // 7
  0.0213, // 8
  0.0213, // 9 - the real scale flattens here before the 10-year step
  0.0235, // 10+
];

/** The largest minimum on the scale, for callers that need a single ceiling. */
export const MAX_SERVICE_YEARS_ON_MINIMUM_SCALE = MINIMUM_AS_CAP_FRACTION.length - 1;

/**
 * What a player with this much service must be paid at minimum.
 *
 * `yearsOfExperience` is clamped, so a caller that does not know a player's
 * service time can pass 0 and get the rookie minimum — the safe floor, since
 * every other rung is higher.
 */
export function veteranMinimumCents(season: number, yearsOfExperience: number): bigint {
  const index = Math.min(
    MAX_SERVICE_YEARS_ON_MINIMUM_SCALE,
    Math.max(0, Math.round(yearsOfExperience)),
  );
  const capCents = Number(getSeasonCapRules(season).salaryCapCents);
  return BigInt(Math.round(capCents * MINIMUM_AS_CAP_FRACTION[index]));
}

/**
 * The lowest salary legal for anybody this season — the rookie minimum.
 *
 * For paths that must answer "is this offer above the floor at all" without
 * knowing who the player is. Prefer `veteranMinimumCents` wherever service
 * years are available; using this everywhere is what let a ten-year veteran be
 * signed for a rookie's minimum.
 */
export function leagueMinimumCents(season: number): bigint {
  return veteranMinimumCents(season, 0);
}
