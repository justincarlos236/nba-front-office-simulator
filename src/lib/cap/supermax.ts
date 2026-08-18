/**
 * The Designated Veteran Player Extension - the "supermax".
 *
 * **Why this is a rule and not a tuning knob.** `maxSalary.ts` models the three
 * CBA service tiers (25% of the cap at 0-6 years, 30% at 7-9, 35% at 10+), and
 * that is correct as far as it goes. What it misses is the mechanism the real
 * league uses to let a club pay *its own* franchise player above his tier: a
 * player with 7-9 years of service who has earned one of a specific set of
 * honours may be given 35% instead of 30%. `docs/audits/SALARY_SYSTEM_AUDIT.md` S-P2-6.
 *
 * Two properties of the real rule matter here, and both are modelled:
 *
 *   - **It is only available from the incumbent club.** A rival cannot offer it
 *     in free agency. Like Bird rights, it is a retention mechanism, so it makes
 *     keeping a homegrown star expensive rather than making him cheap to poach.
 *   - **It only ever applies to the 7-9 band.** At 10+ years the ordinary tier
 *     is already 35%, so there is nothing to raise.
 *
 * ## What this can and cannot see
 *
 * The real criteria admit three qualifying paths: MVP in one of the three prior
 * seasons; Defensive Player of the Year in the prior season or two of the three
 * before it; or All-NBA on the same recency pattern.
 *
 * This models the first two exactly, because `SeasonAward` tracks MVP and
 * Defensive Player of the Year. **It cannot model the All-NBA path, because the
 * simulator has no All-NBA selection** - `AwardCategory` runs MVP, Rookie of the
 * Year, Most Improved, Defensive Player of the Year and Sixth Man, and nothing
 * anywhere picks positional teams.
 *
 * That omission is one-directional and is left as a stated simplification rather
 * than papered over: All-NBA is by far the most common route in reality, so this
 * recognises *fewer* supermax players than the real league would, never more.
 * Inventing a synthetic All-NBA from `overallRating` would make the ceiling
 * depend on a rating rather than on an achievement, which is precisely the
 * confusion the service tiers were rewritten to remove.
 */

/** The fraction of the cap a supermax-eligible player may be paid. */
export const SUPERMAX_FRACTION_OF_CAP = 0.35;

/** The service band the supermax applies to; outside it the rule is a no-op. */
export const SUPERMAX_MIN_YEARS = 7;
export const SUPERMAX_MAX_YEARS = 9;

/** How far back the qualifying-award window reaches. */
export const SUPERMAX_LOOKBACK_SEASONS = 3;

/** The award categories this simulator tracks that qualify a player. */
export type SupermaxQualifyingAward = "MVP" | "DEFENSIVE_PLAYER_OF_THE_YEAR";

export interface SupermaxAward {
  /** The season the award was won, i.e. the season that had just finished. */
  season: number;
  category: SupermaxQualifyingAward;
}

/**
 * Whether this player may be given a Designated Veteran Extension.
 *
 * `currentSeason` is the season the contract would begin, so the most recently
 * completed season is `currentSeason - 1` and the window runs back three from
 * there.
 *
 * Returns false on unknown service, rather than falling back to the age proxy
 * the way `maxSalaryFractionFor` does. The age fallback exists so an ordinary
 * contract can still be priced when `draftYear` is missing; guessing a player
 * into an *elevated* ceiling on the same evidence is a different and worse
 * trade, and `maxSalary.ts` already holds the line that a bad input must never
 * unlock a supermax.
 */
export function isSupermaxEligible(input: {
  yearsOfExperience: number | null | undefined;
  awards: readonly SupermaxAward[];
  currentSeason: number;
}): boolean {
  const years = input.yearsOfExperience;
  if (years === null || years === undefined || !Number.isFinite(years)) return false;
  if (years < SUPERMAX_MIN_YEARS || years > SUPERMAX_MAX_YEARS) return false;

  const mostRecent = input.currentSeason - 1;
  const earliest = mostRecent - (SUPERMAX_LOOKBACK_SEASONS - 1);
  const inWindow = input.awards.filter((a) => a.season >= earliest && a.season <= mostRecent);

  // MVP in any of the three prior seasons.
  if (inWindow.some((a) => a.category === "MVP")) return true;

  // Defensive Player of the Year in the season just gone, or in two of the three.
  const dpoy = inWindow.filter((a) => a.category === "DEFENSIVE_PLAYER_OF_THE_YEAR");
  if (dpoy.some((a) => a.season === mostRecent)) return true;
  return dpoy.length >= 2;
}
