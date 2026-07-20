import { getSeasonCapRules } from "../cap/constants";
import { scoreToCapFraction } from "../valuation/playerValue";

/**
 * The ceiling a team can offer a player via simplified Re-Signing Rights -
 * a casual stand-in for Bird/Early-Bird rights that lets a player's own
 * team exceed the cap to keep them, regardless of apron status. Bounded
 * at a "fair market value" for the player's rating (the same
 * rating-to-cap-fraction curve contract generation and valuation already
 * use), not a literal unlimited max deal - realistic stakes without
 * needing to model max-contract tiers or veteran-extension rules.
 */
export function computeReSigningMaxOfferCents(overallRating: number, season: number): bigint {
  const rules = getSeasonCapRules(season);
  const fraction = scoreToCapFraction(overallRating);
  return BigInt(Math.round(Number(rules.salaryCapCents) * fraction));
}
