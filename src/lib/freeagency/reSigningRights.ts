import { priceContractCents } from "../contracts/priceContract";

/**
 * The ceiling a team can offer a player via simplified Re-Signing Rights - a
 * casual stand-in for Bird/Early-Bird rights that lets a player's own team
 * exceed the cap to keep them, regardless of apron status. Bounded at a "fair
 * market value" for the player, not a literal unlimited max deal - realistic
 * stakes without needing to model veteran-extension rules.
 *
 * **Prices through `priceContractCents`, like every other path.** This used to
 * be `cap × scoreToCapFraction(rating)` with no age term at all, which meant
 * age risk was priced when a player was bootstrapped and free when he was
 * re-signed: measured, a 39-year-old at quality 85 re-signed for 82% more than
 * the same man would have cost at bootstrap. See docs/CONTRACT_AUDIT.md,
 * C-P1-3.
 *
 * No negotiation noise: this is a quoted ceiling, not a struck deal, and a
 * ceiling that moved on every read would be unusable in the interface.
 */
export function computeReSigningMaxOfferCents(
  overallRating: number,
  season: number,
  age: number,
  yearsOfExperience: number,
  position?: string | null,
): bigint {
  return BigInt(
    priceContractCents({ season, quality: overallRating, age, yearsOfExperience, position }),
  );
}
