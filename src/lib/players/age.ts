/**
 * Real birth dates aren't available from the free bio API (see
 * docs/ARCHITECTURE.md), so age/experience are estimated from draft year -
 * assumes a player was 22 when drafted (a reasonable league-average, not a
 * claim about any specific player's real draft age). Season-parameterized
 * (rather than a hardcoded bootstrap year) so these stay correct as
 * `League.currentSeason` advances across multiple simulated seasons.
 */
const ASSUMED_DRAFT_AGE = 22;

export function estimateAge(draftYear: number | null, season: number): number {
  if (!draftYear) return 27;
  return Math.max(19, season - draftYear + ASSUMED_DRAFT_AGE);
}

export function estimateExperience(draftYear: number | null, season: number): number {
  if (!draftYear) return 5;
  return Math.max(0, season - draftYear);
}

/**
 * Real age from a birth date as of Oct 1 of the season's start year - used when
 * the dataset carries a real `birthDate` (the current hoopR-sourced roster
 * data does), which is far more accurate than the draft-year estimate above.
 * Returns null when no birth date is available so callers can fall back.
 */
export function ageFromBirthDate(birthDate: Date | null, season: number): number | null {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
  const ref = new Date(Date.UTC(season, 9, 1)); // Oct 1
  let age = ref.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = ref.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && ref.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

/** Rough NBA experience from age when draft year is unknown (drafted ~age 22). */
export function estimateExperienceFromAge(age: number): number {
  return Math.max(0, age - 22);
}

/** The two fields any player row needs for its age to be resolvable. */
export interface AgeSource {
  birthDate: Date | null;
  draftYear: number | null;
}

/**
 * A player's age, from the best source available.
 *
 * **Use this, not `estimateAge`.** The seeded roster comes from a dataset that
 * carries `birthDate` but no `draftYear`, so calling `estimateAge` on a real
 * player hit its null branch and returned the constant 27 - for all 537 of
 * them, in every save, every season. Nothing aged, nothing declined, and
 * retirement (which starts at 33) had probability exactly zero: a six-season
 * save recorded zero retirements and grew to 777 players.
 *
 * The real ages were in the database the whole time, spanning 22 to 44.
 *
 * Order matters: `birthDate` is exact, `draftYear` is an estimate assuming a
 * player was 22 when drafted, and the constant is a last resort for a row
 * carrying neither.
 */
export function resolvePlayerAge(player: AgeSource, season: number): number {
  return ageFromBirthDate(player.birthDate, season) ?? estimateAge(player.draftYear, season);
}

/** Experience from the best source available, mirroring `resolvePlayerAge`. */
export function resolvePlayerExperience(player: AgeSource, season: number): number {
  const age = ageFromBirthDate(player.birthDate, season);
  return age !== null
    ? estimateExperienceFromAge(age)
    : estimateExperience(player.draftYear, season);
}
