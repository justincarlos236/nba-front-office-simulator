import { computePerformanceScore } from "@/lib/valuation/playerValue";
import { estimateExperience } from "@/lib/players/age";
import { draftTeams } from "./draftTeams";

/**
 * Eligibility mirrors Rookie of the Year's own cutoff
 * (estimateExperience <= 0) extended by one year, since Rising Stars in
 * the real NBA includes second-year players too.
 */
const MAX_EXPERIENCE_FOR_ELIGIBILITY = 1;
const MIN_GAMES_FOR_ELIGIBILITY = 10;
const ROSTER_SIZE = 14;

export interface RisingStarsCandidate {
  leaguePlayerId: string;
  draftYear: number | null;
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  trueShootingPct: number;
}

export interface RisingStarsSelection {
  leaguePlayerId: string;
  performanceScore: number;
}

export interface RisingStarsResult {
  selections: RisingStarsSelection[];
  /** Null when fewer than 2 players are eligible - too sparse a pool for a draft (see draftTeams). */
  captainAId: string | null;
  captainBId: string | null;
  teamA: string[];
  teamB: string[];
}

function performanceScoreOf(p: RisingStarsCandidate): number {
  return computePerformanceScore({
    pointsPerGame: p.pointsPerGame,
    reboundsPerGame: p.reboundsPerGame,
    assistsPerGame: p.assistsPerGame,
    stealsPerGame: p.stealsPerGame,
    blocksPerGame: p.blocksPerGame,
    turnoversPerGame: p.turnoversPerGame,
    minutesPerGame: p.minutesPerGame,
    trueShootingPct: p.trueShootingPct,
  });
}

export function selectRisingStars(
  candidates: RisingStarsCandidate[],
  season: number,
): RisingStarsResult {
  const eligible = candidates.filter(
    (p) =>
      estimateExperience(p.draftYear, season) <= MAX_EXPERIENCE_FOR_ELIGIBILITY &&
      p.gamesPlayed >= MIN_GAMES_FOR_ELIGIBILITY,
  );

  const selections = eligible
    .map((p) => ({ leaguePlayerId: p.leaguePlayerId, performanceScore: performanceScoreOf(p) }))
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .slice(0, ROSTER_SIZE);

  // Guarded rather than assumed: a real league produces a full rookie
  // class every season, so this pool is realistically never this sparse,
  // but draftTeams itself intentionally throws below 2 players.
  const draft =
    selections.length >= 2
      ? draftTeams(
          selections.map((s) => ({ leaguePlayerId: s.leaguePlayerId, score: s.performanceScore })),
        )
      : null;

  return {
    selections,
    captainAId: draft?.captainAId ?? null,
    captainBId: draft?.captainBId ?? null,
    teamA: draft?.teamA ?? [],
    teamB: draft?.teamB ?? [],
  };
}
