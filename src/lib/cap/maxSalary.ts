import { getSeasonCapRules } from "./constants";
import { SUPERMAX_FRACTION_OF_CAP, SUPERMAX_MIN_YEARS } from "./supermax";

/**
 * The individual maximum salary - the ceiling one player may be paid.
 *
 * **This did not exist before, and its absence was a P0.** Nothing anywhere
 * bounded an individual salary: `validateSigning` checked cap space and the
 * re-signing ceiling, and `generateContract` checked nothing at all. The
 * highest salary the simulator produced (37.7% of the cap) was not the result
 * of a rule - it was an accident of `scoreToCapFraction`'s 0.35 asymptote
 * multiplied by up to +15% negotiation noise. A team with $67.9M of room could
 * legally hand one player all of it, and any future change to the valuation
 * curve would have run straight past the ceiling unchecked. See
 * docs/audits/CONTRACT_AUDIT.md, C-P0-3.
 *
 * **Keyed off years of service, which is the real rule, falling back to age.**
 * The CBA sets the tiers by service: 25% of the cap for 0-6 years, 30% for 7-9,
 * 35% for 10+.
 *
 * This was age-based for a good reason that has since expired. The older
 * dataset carried no `draftYear` for any player, so `resolvePlayerExperience`
 * fell through to `age - 22` universally and expressing the tiers in experience
 * meant expressing them in age anyway, one indirection later and with a worse
 * constant. The 2026-27 re-seed populates `draftYear` for 83% of players, and
 * `resolvePlayerExperience` now prefers it, so service is real data.
 *
 * The age proxy was not harmless. It assumes a draft at 20; real players are
 * drafted at 19-21 and stars earlier still, so it mis-tiered anyone whose
 * career started off-pattern. Lauri Markkanen (9 years of service, rated 89)
 * drew the 35% tier on age while Shai Gilgeous-Alexander (8 years, rated 98)
 * was held to 30% - a worse player permitted a bigger maximum purely because
 * of his birthday.
 *
 * The age boundaries are kept as the fallback for the 17% of rows with no
 * draft year, mapping the service tiers onto ages at a typical draft age of 20.
 */
const MAX_SALARY_TIERS = [
  { minAge: 30, fractionOfCap: 0.35 },
  { minAge: 27, fractionOfCap: 0.3 },
  { minAge: 0, fractionOfCap: 0.25 },
] as const;

/** The real CBA tiers, by years of service. */
const MAX_SALARY_SERVICE_TIERS = [
  { minYears: 10, fractionOfCap: 0.35 },
  { minYears: 7, fractionOfCap: 0.3 },
  { minYears: 0, fractionOfCap: 0.25 },
] as const;

/**
 * The fraction of the cap this player may be paid at most.
 *
 * Prefers service years; falls back to the age proxy when they are unknown. A
 * non-finite or negative input falls to the most restrictive tier - a bad
 * value must never unlock a supermax.
 */
export function maxSalaryFractionFor(input: {
  age: number;
  yearsOfExperience?: number | null;
  /**
   * Set only on the incumbent club's own re-signing path, from
   * `isSupermaxEligible`. Raises the 7-9 band to 35%; a no-op everywhere else,
   * since 10+ is already 35% and 0-6 cannot qualify.
   */
  supermaxEligible?: boolean;
}): number {
  const years = input.yearsOfExperience;
  if (years !== null && years !== undefined && Number.isFinite(years)) {
    const base = MAX_SALARY_SERVICE_TIERS[MAX_SALARY_SERVICE_TIERS.length - 1];
    const tier = (MAX_SALARY_SERVICE_TIERS.find((t) => years >= t.minYears) ?? base).fractionOfCap;
    // Re-checked here rather than trusted from the caller. `isSupermaxEligible`
    // already enforces the band, but this function is exported and a caller
    // passing the flag for a 4-year player must not thereby skip two tiers.
    const qualifies = input.supermaxEligible === true && years >= SUPERMAX_MIN_YEARS;
    return qualifies ? Math.max(tier, SUPERMAX_FRACTION_OF_CAP) : tier;
  }
  return maxSalaryFractionForAge(input.age);
}

/**
 * The fraction of the cap this player may be paid at most, by age tier.
 *
 * An age that satisfies no tier - `NaN`, or a negative from a corrupt birth
 * date - falls to the *most restrictive* tier rather than throwing or reaching
 * for the highest. A bad input must never be able to unlock a supermax.
 */
export function maxSalaryFractionForAge(age: number): number {
  const base = MAX_SALARY_TIERS[MAX_SALARY_TIERS.length - 1];
  return (MAX_SALARY_TIERS.find((tier) => age >= tier.minAge) ?? base).fractionOfCap;
}

/** The individual maximum salary in cents for a player of this age. */
export function maxIndividualSalaryCents(
  age: number,
  season: number,
  yearsOfExperience?: number | null,
  supermaxEligible?: boolean,
): number {
  const rules = getSeasonCapRules(season);
  return Math.round(
    Number(rules.salaryCapCents) *
      maxSalaryFractionFor({ age, yearsOfExperience, supermaxEligible }),
  );
}

/**
 * Clamps a salary to the individual maximum. Applied at the end of every
 * pricing path so no valuation error, present or future, can produce a salary
 * the league would not permit.
 */
export function clampToMaxSalary(
  salaryCents: number,
  age: number,
  season: number,
  yearsOfExperience?: number | null,
  supermaxEligible?: boolean,
): number {
  return Math.min(
    salaryCents,
    maxIndividualSalaryCents(age, season, yearsOfExperience, supermaxEligible),
  );
}
