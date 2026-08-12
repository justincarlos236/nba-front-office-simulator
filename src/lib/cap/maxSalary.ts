import { getSeasonCapRules } from "./constants";

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
 * docs/CONTRACT_AUDIT.md, C-P0-3.
 *
 * **Keyed off age, not experience, and that is deliberate.** The real CBA sets
 * the tiers by years of service: 25% of the cap for 0-6 years, 30% for 7-9,
 * 35% for 10+. This codebase cannot see years of service - not one of the 537
 * players in the seeded dataset carries a `draftYear`, so
 * `resolvePlayerExperience` falls through to `age - 22` for every real player
 * in every save. Expressing the tiers in experience would therefore mean
 * expressing them in age anyway, one indirection later and with a worse
 * constant: `age - 22` assumes a draft at 22, while real NBA players are drafted
 * at 19-21 and stars earlier still. Measured on the seeded roster, the
 * experience form put Shai Gilgeous-Alexander (27) and Luka Dončić (26) in the
 * 25% tier when both are really on supermax deals, and left only two players in
 * the league above 30% of the cap against a real fourteen.
 *
 * The boundaries below assume a typical draft age of 20, which maps the real
 * service tiers onto ages: 0-6 years is roughly age 26 and under, 7-9 is 27-29,
 * 10+ is 30 and over.
 */
const MAX_SALARY_TIERS = [
  { minAge: 30, fractionOfCap: 0.35 },
  { minAge: 27, fractionOfCap: 0.3 },
  { minAge: 0, fractionOfCap: 0.25 },
] as const;

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
export function maxIndividualSalaryCents(age: number, season: number): number {
  const rules = getSeasonCapRules(season);
  return Math.round(Number(rules.salaryCapCents) * maxSalaryFractionForAge(age));
}

/**
 * Clamps a salary to the individual maximum. Applied at the end of every
 * pricing path so no valuation error, present or future, can produce a salary
 * the league would not permit.
 */
export function clampToMaxSalary(salaryCents: number, age: number, season: number): number {
  return Math.min(salaryCents, maxIndividualSalaryCents(age, season));
}
