import { ApronLevel } from "../cap/apron";
import type { SeasonCapRules } from "../cap/constants";

/**
 * Maximum incoming salary a team can absorb in a trade given what it's
 * sending out, per the 2023 CBA's three-tier matching formula for teams
 * below the first apron:
 *   - small outgoing salaries can be matched up to 200% (+$250k)
 *   - mid-range outgoing salaries can add a flat amount on top
 *   - large outgoing salaries are capped at a 125% match (+$250k)
 * Teams at or above the first apron lose access to the generous low tier
 * and are held to a flat multiplier instead (110% at the first apron, an
 * exact 100% - no aggregation - at the second apron).
 */
const FLEXIBLE_MATCH_BONUS_CENTS = 250_000_00n;

export function maxIncomingSalaryCents(
  outgoingSalaryCents: bigint,
  apronLevel: ApronLevel,
  rules: SeasonCapRules,
): bigint {
  if (outgoingSalaryCents <= 0n) return 0n;

  if (apronLevel === ApronLevel.SECOND_APRON) {
    return outgoingSalaryCents;
  }

  if (apronLevel === ApronLevel.FIRST_APRON) {
    return (outgoingSalaryCents * 110n) / 100n;
  }

  if (outgoingSalaryCents <= rules.tradeMatchLowerBreakpointCents) {
    return outgoingSalaryCents * 2n + FLEXIBLE_MATCH_BONUS_CENTS;
  }

  if (outgoingSalaryCents <= rules.tradeMatchUpperBreakpointCents) {
    return outgoingSalaryCents + rules.tradeMatchLowerBreakpointCents;
  }

  return (outgoingSalaryCents * 125n) / 100n + FLEXIBLE_MATCH_BONUS_CENTS;
}

/**
 * Below the first apron, a team can aggregate multiple outgoing contracts
 * to match one incoming salary. At/above the second apron this is
 * disallowed entirely - each outgoing player must be matched without
 * combining salaries. A team under the salary cap (cap space) doesn't need
 * to match anything.
 */
export function canAggregateSalaries(apronLevel: ApronLevel): boolean {
  return apronLevel !== ApronLevel.SECOND_APRON;
}

export function isUnderCapSpace(apronLevel: ApronLevel): boolean {
  return apronLevel === ApronLevel.UNDER_CAP;
}
