import { DATASET_ROSTER_SEASON } from "@/lib/data-sources/datasetSeasons";
import type { GeneratedProspect } from "./generateDraftClass";

/**
 * Five real names hidden in one draft class.
 *
 * A private joke for the people this was shared with, and nothing more: they
 * are ordinary prospects who happen to be named after friends. They take the
 * place of five generated prospects rather than being added alongside them, so
 * the class is still exactly `CLASS_SIZE` and every distribution the draft
 * audits measure - ratings by pick, potential falloff, positional mix - is
 * untouched.
 *
 * Only the name changes. Rating, potential, position, height, college and
 * comparison all stay as generated for that slot, which is what keeps them
 * genuinely average instead of secretly good, and stops a hand-written height
 * from landing on a hand-written position and reading as a mistake.
 *
 * The slots are spread across the middle of the board on purpose. Grouping
 * them would be conspicuous, and putting them at the top would hand whoever
 * spots it a lottery pick.
 */

/** The class these appear in - the second draft a save reaches. */
export const GUEST_PROSPECT_SEASON = DATASET_ROSTER_SEASON + 1;

export const GUEST_PROSPECT_NAMES = [
  "Jake Herrera",
  "Jacob Tuglo",
  "Dhiren Rishi",
  "Adrian Tan",
  "Gabriel Tay",
] as const;

/**
 * Which board positions they occupy, as pick numbers.
 *
 * The middle of the board, unevenly spaced. Ratings fall from pick 1 to 60, so
 * "average" is the band either side of the median rather than anywhere in the
 * second round - an earlier draft of this put one at pick 51, which made him a
 * late-second flyer rather than an ordinary prospect. An even spread would also
 * look placed.
 */
const GUEST_PICKS = [21, 26, 32, 37, 43] as const;

/**
 * Substitutes the guest names into a generated class, in place.
 *
 * A no-op for every season but one, so a save that never reaches that draft -
 * or one that has already passed it - behaves exactly as before.
 */
export function applyGuestProspects(
  prospects: GeneratedProspect[],
  season: number,
): GeneratedProspect[] {
  if (season !== GUEST_PROSPECT_SEASON) return prospects;

  const out = [...prospects];
  GUEST_PICKS.forEach((pick, i) => {
    const index = pick - 1;
    const slot = out[index];
    // A short class would otherwise write past the end of the board.
    if (!slot) return;
    out[index] = { ...slot, fullName: GUEST_PROSPECT_NAMES[i] };
  });
  return out;
}
