/**
 * GM Career Mode (Phase 2) - the reputation-gated GM Job Market. Pure logic
 * over an already-computed team-strength ranking. Reputation (earned across a
 * user's whole career, see careerRecord.ts) gates which jobs a GM is offered:
 * a stacked contender only calls a proven executive, while a rebuild will take
 * anyone. Each job also carries a different "leash" - a contender's owner
 * expects to win now and has little patience, a rebuild's owner is patient -
 * expressed as the starting `ownerConfidence` for that save, so *where* you
 * take a job is a real risk/reward decision, not just a label.
 *
 * Cap/CBA and every other in-league system are unchanged; this only decides
 * which teams a user may start a new save with, and how much rope they get.
 */

import { computeTeamStrength } from "@/lib/simulation/teamStrength";

export type JobSituation =
  "CONTENDER" | "PLAYOFF_CONTENDER" | "RETOOLING" | "REBUILD" | "BOTTOMING_OUT";

export const JOB_SITUATION_LABEL: Record<JobSituation, string> = {
  CONTENDER: "Title Contender",
  PLAYOFF_CONTENDER: "Playoff Contender",
  RETOOLING: "Retooling",
  REBUILD: "Rebuild",
  BOTTOMING_OUT: "Bottoming Out",
};

export const JOB_SITUATION_DESCRIPTION: Record<JobSituation, string> = {
  CONTENDER:
    "A loaded roster with a championship window open now. Ownership expects a deep run immediately - and won't wait.",
  PLAYOFF_CONTENDER:
    "A solid roster expected to compete for a playoff spot. Ownership wants steady progress.",
  RETOOLING: "A middling roster that could go either way. Ownership's expectations are moderate.",
  REBUILD: "A thin roster in need of a long-term plan. Ownership is patient - for now.",
  BOTTOMING_OUT:
    "A bare-cupboard roster years from contention. Ownership expects growth, not wins, and will give you time.",
};

// Reputation needed for a team in this situation to offer you the job. A
// rebuild takes anyone; a contender only calls a proven executive.
const REPUTATION_REQUIRED: Record<JobSituation, number> = {
  CONTENDER: 70,
  PLAYOFF_CONTENDER: 50,
  RETOOLING: 35,
  REBUILD: 0,
  BOTTOMING_OUT: 0,
};

// The "leash": the owner-confidence a save starts at for this situation. A
// contender starts low (short leash - win now or else); a rebuild starts high
// (patient). Combined with the expectation level (already scaled by roster
// strength at league creation), this makes a top job genuinely riskier to
// keep than a rebuild.
const STARTING_OWNER_CONFIDENCE: Record<JobSituation, number> = {
  CONTENDER: 52,
  PLAYOFF_CONTENDER: 60,
  RETOOLING: 65,
  REBUILD: 70,
  BOTTOMING_OUT: 72,
};

const LEASH_LABEL: Record<JobSituation, string> = {
  CONTENDER: "Short leash",
  PLAYOFF_CONTENDER: "Moderate leash",
  RETOOLING: "Standard leash",
  REBUILD: "Patient owner",
  BOTTOMING_OUT: "Very patient owner",
};

/** `strengthPercentile` is 0-1 (1 = strongest roster in the league). */
export function computeJobSituation(strengthPercentile: number): JobSituation {
  if (strengthPercentile >= 0.85) return "CONTENDER";
  if (strengthPercentile >= 0.65) return "PLAYOFF_CONTENDER";
  if (strengthPercentile >= 0.4) return "RETOOLING";
  if (strengthPercentile >= 0.2) return "REBUILD";
  return "BOTTOMING_OUT";
}

export interface JobOffer {
  situation: JobSituation;
  reputationRequired: number;
  /** True if the user's reputation clears the requirement - i.e. this team will hire them. */
  available: boolean;
  startingOwnerConfidence: number;
  leashLabel: string;
}

export function computeJobOffer(strengthPercentile: number, gmReputation: number): JobOffer {
  const situation = computeJobSituation(strengthPercentile);
  const reputationRequired = REPUTATION_REQUIRED[situation];
  return {
    situation,
    reputationRequired,
    available: gmReputation >= reputationRequired,
    startingOwnerConfidence: STARTING_OWNER_CONFIDENCE[situation],
    leashLabel: LEASH_LABEL[situation],
  };
}

/**
 * Ranks teams by roster strength into 0-1 percentiles (1 = strongest). The
 * job-market UI and the server-side gate in createLeagueAction both derive a
 * team's situation from this, so a team's ranking is identical in both places.
 */
export function computeStrengthPercentiles(
  strengthByTeam: Map<string, number>,
): Map<string, number> {
  const entries = [...strengthByTeam.entries()].sort((a, b) => a[1] - b[1]); // ascending
  const n = entries.length;
  const result = new Map<string, number>();
  entries.forEach(([teamId], i) => {
    result.set(teamId, n > 1 ? i / (n - 1) : 1);
  });
  return result;
}

/**
 * Weighted roster strength per team from each real player's derived rating,
 * grouped by their real team. Both the job-market page and the createLeagueAction
 * gate build the `{ teamId, overallRating }` list from the same reference data
 * (planLeaguePlayer's rating is deriveOverallRating, identical to what the page
 * computes), so the rankings match exactly.
 */
export function computeStrengthByTeam(
  players: { teamId: string | null; overallRating: number }[],
): Map<string, number> {
  const ratingsByTeam = new Map<string, number[]>();
  for (const p of players) {
    if (!p.teamId) continue;
    const list = ratingsByTeam.get(p.teamId) ?? [];
    list.push(p.overallRating);
    ratingsByTeam.set(p.teamId, list);
  }
  const result = new Map<string, number>();
  for (const [teamId, ratings] of ratingsByTeam) {
    result.set(teamId, computeTeamStrength(ratings));
  }
  return result;
}
