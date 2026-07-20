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
