/**
 * A player just acquired in a trade cannot be flipped again immediately.
 *
 * **This exists because the acceptance band cannot tell repetition from a
 * single deal.** `docs/TRADE_EXPLOIT_AUDIT.md` P0-1: a greedy chain of
 * individually-reasonable trades raised a club's book value 21.5% under full
 * salary-matching and roster constraints, by upgrading the *same roster slot*
 * over and over — Porter Jr. → Young → Davis → Mobley → Brunson → Şengün →
 * Jackson III, each step sending away the player acquired in the previous one.
 *
 * Two fixes were measured and eliminated first, both recorded in that document:
 *
 *   - **A per-club trade budget** does nothing, because the exploit is on the
 *     user's side and there are 29 counterparties to rotate through.
 *   - **Raising `ACCEPT_THRESHOLD`** cannot work at all. Two CPU clubs only
 *     agree when both accept, which with a symmetric model requires a threshold
 *     below 1.0 — and that same sub-1.0 band is what the user re-enters. At
 *     1.05 the chain drops to 4.9% and CPU-to-CPU trading falls to *zero*.
 *
 * Neither could separate the two cases, because at the level of one trade they
 * are identical. **What differs is repetition**, so that is what this measures.
 *
 * The real league restricts re-trading recently acquired players for much the
 * same reason, which makes this a rules-shaped fix rather than a balance patch:
 * it constrains *when* a trade may happen, not what a club thinks a player is
 * worth. Valuation is left completely alone.
 */

/**
 * Days a player must spend on his new roster before he can be traded again.
 *
 * The real restriction is 60 days. A season here runs about 174 days
 * (`REGULAR_SEASON_TARGET_DAYS`), so this caps any single roster slot at
 * roughly two upgrades a season instead of an unbounded ladder — while leaving
 * a club free to make as many trades as it likes involving *different* players.
 */
export const TRADE_COOLDOWN_DAYS = 60;

export interface AcquisitionRecord {
  /** Season the player joined his current team, if known. */
  joinedTeamSeason: number | null;
  /** Day index within that season, if known. Null for pre-day-tracking rows. */
  joinedTeamDayIndex: number | null;
}

/**
 * Whether this player is still inside his post-trade cooldown.
 *
 * Fails OPEN on unknown history: a row with no recorded acquisition day — a
 * seeded player, or one acquired before day tracking existed — is tradeable.
 * Blocking a trade because of missing data would be a worse failure than
 * allowing one, and the seeded roster has no acquisition to be recent from.
 */
export function isWithinTradeCooldown(
  record: AcquisitionRecord,
  currentSeason: number,
  currentDayIndex: number,
  cooldownDays: number = TRADE_COOLDOWN_DAYS,
): boolean {
  if (record.joinedTeamSeason === null || record.joinedTeamDayIndex === null) return false;
  // A different season is always long enough ago - the offseason alone exceeds
  // any cooldown this rule would sensibly use.
  if (record.joinedTeamSeason !== currentSeason) return false;
  return currentDayIndex - record.joinedTeamDayIndex < cooldownDays;
}

/** Days until this player may be traded again; 0 if he already may be. */
export function daysUntilTradeable(
  record: AcquisitionRecord,
  currentSeason: number,
  currentDayIndex: number,
  cooldownDays: number = TRADE_COOLDOWN_DAYS,
): number {
  if (!isWithinTradeCooldown(record, currentSeason, currentDayIndex, cooldownDays)) return 0;
  return cooldownDays - (currentDayIndex - (record.joinedTeamDayIndex ?? 0));
}
