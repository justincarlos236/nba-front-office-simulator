/**
 * A team's competitive identity - the lens the trade-AI evaluation engine
 * (Phase 11c) reasons through: a Contender prioritizes immediate impact
 * over future assets, a Rebuilding team values youth and picks, etc. See
 * docs/ARCHITECTURE.md's "GM accountability" section for the sibling
 * concept (`ExpectationLevel`) this deliberately mirrors in spirit but not
 * in scale - identity is about *what a team is right now*, not what
 * ownership expects of it this season.
 */
export type TeamIdentity = "CONTENDER" | "PLAYOFF_TEAM" | "PLAY_IN_TEAM" | "REBUILDING" | "TANKING";

export const TEAM_IDENTITY_LABEL: Record<TeamIdentity, string> = {
  CONTENDER: "Championship Contender",
  PLAYOFF_TEAM: "Playoff Team",
  PLAY_IN_TEAM: "Play-In Team",
  REBUILDING: "Rebuilding",
  TANKING: "Tanking",
};

export const TEAM_IDENTITY_DESCRIPTION: Record<TeamIdentity, string> = {
  CONTENDER: "Built to win a championship now - prioritizes immediate impact over future assets.",
  PLAYOFF_TEAM:
    "A legitimate playoff team - values proven talent, but not at the cost of its future.",
  PLAY_IN_TEAM: "On the playoff bubble - open to moves that push it over the top either direction.",
  REBUILDING: "Building around its young core - values youth and draft picks over short-term wins.",
  TANKING: "Playing for the future, not this season - draft picks and youth are the priority.",
};

// Percentile thresholds calibrated against the real playoff structure: the
// top 6/30 direct qualifiers per conference (~top 20% league-wide) are
// Contenders/Playoff Teams, the next 4/30 per conference (~next 13%) are
// the Play-In field, and the bottom ~33% split into Rebuilding/Tanking by
// roster age rather than by record alone - a bad-but-young team is still
// building, not necessarily playing for next year's lottery on purpose.
const CONTENDER_PERCENTILE = 0.8;
const PLAYOFF_PERCENTILE = 0.6;
const PLAY_IN_PERCENTILE = 0.33;

// At or below this average roster age, a bad team reads as "still
// developing" rather than "deliberately bad" - calibrated against typical
// rookie-to-prime age curves (see src/lib/players/age.ts), not a claim
// about any specific real-world roster-construction strategy.
const YOUNG_ROSTER_AGE_THRESHOLD = 26;

/**
 * Classifies a team's identity from how competitive it is relative to the
 * rest of the league (0 = league's worst, 1 = league's best) and its
 * average roster age. `competitivenessPercentile` is deliberately an
 * opaque input rather than raw wins/strength - the caller decides whether
 * to rank by actual win percentage (once enough games are played this
 * season) or by roster strength (early season/preseason, before winning
 * percentage means much), keeping this function a simple, testable
 * percentile bucket.
 */
export function computeTeamIdentity(
  competitivenessPercentile: number,
  avgRosterAge: number,
): TeamIdentity {
  if (competitivenessPercentile >= CONTENDER_PERCENTILE) return "CONTENDER";
  if (competitivenessPercentile >= PLAYOFF_PERCENTILE) return "PLAYOFF_TEAM";
  if (competitivenessPercentile >= PLAY_IN_PERCENTILE) return "PLAY_IN_TEAM";
  return avgRosterAge <= YOUNG_ROSTER_AGE_THRESHOLD ? "REBUILDING" : "TANKING";
}
