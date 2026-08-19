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
 * Only the name and where they came from change. Rating, potential, position,
 * height, weight and comparison all stay as generated for that slot, which is
 * what keeps them genuinely average instead of secretly good, and stops a
 * hand-written height from landing on a hand-written position.
 *
 * All five are marked international, because all five are: two from the
 * Philippines and three from Singapore universities. Leaving the generated
 * nationality in place would have printed a Singapore school beside a US
 * nationality, which reads as a data bug rather than a joke.
 *
 * The slots are spread across the middle of the board on purpose. Grouping
 * them would be conspicuous, and putting them at the top would hand whoever
 * spots it a lottery pick.
 */

/** The class these appear in - the second draft a save reaches. */
export const GUEST_PROSPECT_SEASON = DATASET_ROSTER_SEASON + 1;

interface GuestProspect {
  fullName: string;
  /** Shown as "Club:" on the prospect profile, since all five come from
   *  outside the US college system. */
  collegeOrTeam: string;
  nationality: string;
}

const GUESTS: GuestProspect[] = [
  { fullName: "Jake Herrera", collegeOrTeam: "Philippines", nationality: "Philippines" },
  { fullName: "Jacob Tuglo", collegeOrTeam: "Philippines", nationality: "Philippines" },
  { fullName: "Dhiren Rishi", collegeOrTeam: "SIM", nationality: "Singapore" },
  { fullName: "Adrian Tan", collegeOrTeam: "SMU", nationality: "Singapore" },
  { fullName: "Gabriel Tay", collegeOrTeam: "NUS", nationality: "Singapore" },
];

export const GUEST_PROSPECT_NAMES = GUESTS.map((g) => g.fullName);

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
    const guest = GUESTS[i];
    out[index] = {
      ...slot,
      fullName: guest.fullName,
      collegeOrTeam: guest.collegeOrTeam,
      nationality: guest.nationality,
      isInternational: true,
      pathway: "INTERNATIONAL_PROFESSIONAL",
    };
  });
  return out;
}
