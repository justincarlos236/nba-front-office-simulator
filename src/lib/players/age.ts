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
