/**
 * GM Career Mode (Phase 1) - pure math over an already-built career
 * snapshot. Deliberately excludes "successful trades," "drafting stars,"
 * and "developing young players" as reputation factors (per the original
 * design brief) since scoring those honestly needs new per-event
 * tracking that doesn't exist yet - this only uses what's actually
 * snapshotted (championships, playoff appearances, win rate, how the
 * tenure ended).
 */
export type CareerEndReason = "FIRED" | "RETIRED";

export interface ReputationDeltaInput {
  seasons: number;
  wins: number;
  losses: number;
  championships: number;
  playoffAppearances: number;
  endReason: CareerEndReason;
}

const MIN_REPUTATION_DELTA = -40;
const MAX_REPUTATION_DELTA = 60;

export function computeReputationDelta(input: ReputationDeltaInput): number {
  const gamesPlayed = input.wins + input.losses;
  const winPct = gamesPlayed > 0 ? input.wins / gamesPlayed : 0.5;

  const raw =
    input.championships * 15 +
    input.playoffAppearances * 5 +
    Math.round((winPct - 0.5) * 40) +
    (input.endReason === "FIRED" ? -20 : 0);

  return Math.max(MIN_REPUTATION_DELTA, Math.min(MAX_REPUTATION_DELTA, raw));
}

export type CareerTitle =
  | "HALL_OF_FAME_EXECUTIVE"
  | "RESPECTED_EXECUTIVE"
  | "STEADY_HAND"
  | "JOURNEYMAN_GM"
  | "UNDER_SCRUTINY"
  | "CAUTIONARY_TALE";

export const CAREER_TITLE_LABEL: Record<CareerTitle, string> = {
  HALL_OF_FAME_EXECUTIVE: "Hall of Fame Executive",
  RESPECTED_EXECUTIVE: "Respected Executive",
  STEADY_HAND: "Steady Hand",
  JOURNEYMAN_GM: "Journeyman GM",
  UNDER_SCRUTINY: "Under Scrutiny",
  CAUTIONARY_TALE: "Cautionary Tale",
};

/** Same 0-100 bucketing convention as ownerConfidence/fanHappiness. */
export function computeCareerTitle(gmReputation: number): CareerTitle {
  if (gmReputation >= 90) return "HALL_OF_FAME_EXECUTIVE";
  if (gmReputation >= 75) return "RESPECTED_EXECUTIVE";
  if (gmReputation >= 60) return "STEADY_HAND";
  if (gmReputation >= 40) return "JOURNEYMAN_GM";
  if (gmReputation >= 20) return "UNDER_SCRUTINY";
  return "CAUTIONARY_TALE";
}

/**
 * `maxRoundReached` is the furthest `PlayoffSeries.round` (1-4) the team's
 * tenure ever reached, or null if it never made the playoffs at all.
 * `wonFinals` only matters when `maxRoundReached === 4`.
 */
export function describeBestPlayoffFinish(
  maxRoundReached: number | null,
  wonFinals: boolean,
): string {
  if (maxRoundReached === null) return "Missed the Playoffs";
  if (maxRoundReached === 4) return wonFinals ? "NBA Champion" : "NBA Finals";
  if (maxRoundReached === 3) return "Conference Finals";
  if (maxRoundReached === 2) return "Conference Semifinals";
  return "First Round";
}
