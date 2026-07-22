import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { simulateGame } from "@/lib/simulation/simulateGame";
import {
  generateBoxScore,
  type CoachModifier,
  type PlayerBoxScoreLine,
} from "@/lib/simulation/boxScore";
import { computePerformanceScore } from "@/lib/valuation/playerValue";
import { draftTeams } from "./draftTeams";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";

/**
 * Reuses the existing game-simulation engine entirely rather than building
 * a separate All-Star basketball simulation. This synthetic "exhibition"
 * CoachModifier is the same hook Head Coach effects already use
 * (src/lib/simulation/boxScore.ts) - per its scratchChance formula
 * (`DEEP_BENCH_SCRATCH_CHANCE - benchTrustDelta * 0.15`, clamped to
 * [0.1, 0.6]), a high benchTrustDelta pushes the deep-bench DNP-CD chance
 * down to its floor so nobody on a 12-man drafted squad gets scratched,
 * and a boosted threePaMultiplier produces the higher, more
 * perimeter-heavy scoring an exhibition game is known for. No changes to
 * boxScore.ts itself.
 */
export const EXHIBITION_COACH_MODIFIER: CoachModifier = {
  benchTrustDelta: 2,
  threePaMultiplier: 1.35,
};

export interface AllStarGameResult {
  captainAId: string;
  captainBId: string;
  teamAScore: number;
  teamBScore: number;
  /** `leagueTeamId` on each line is the captain id of the side that player was drafted to. */
  stats: PlayerBoxScoreLine[];
  mvpLeaguePlayerId: string;
}

function trueShootingPctOf(line: PlayerBoxScoreLine): number {
  const trueShotAttempts = line.fgAttempted + 0.44 * line.ftAttempted;
  return trueShotAttempts > 0 ? line.points / (2 * trueShotAttempts) : 0.56;
}

/**
 * MVP reuses the exact same performance-score weighting selection already
 * uses, applied to this one game's stat line instead of a season average -
 * computePerformanceScore's per-36 normalization works identically on a
 * single game's counts and minutes. A small winning-side bonus mirrors how
 * a real ASG MVP is rarely voted off the losing team.
 */
const WINNING_SIDE_BONUS = 3;

function crownMvp(stats: PlayerBoxScoreLine[], winningSideId: string): string {
  const scored = stats.map((line) => ({
    leaguePlayerId: line.leaguePlayerId,
    score:
      computePerformanceScore({
        pointsPerGame: line.points,
        reboundsPerGame: line.rebounds,
        assistsPerGame: line.assists,
        stealsPerGame: line.steals,
        blocksPerGame: line.blocks,
        turnoversPerGame: line.turnovers,
        minutesPerGame: Math.max(line.minutesPlayed, 1),
        trueShootingPct: trueShootingPctOf(line),
      }) + (line.leagueTeamId === winningSideId ? WINNING_SIDE_BONUS : 0),
  }));

  scored.sort((a, b) => b.score - a.score || a.leaguePlayerId.localeCompare(b.leaguePlayerId));
  return scored[0].leaguePlayerId;
}

/**
 * Team assignment (captain draft) is handled by the shared draftTeams
 * helper; `selectees` should already be exactly the selected All-Star
 * roster (starters + reserves + injury replacements), scored by the same
 * ranking selection.ts used so captains are the two biggest names.
 */
export function simulateAllStarGame(
  selectees: { player: RosterPlayerForSimulation; score: number }[],
  rng: () => number,
): AllStarGameResult {
  const draft = draftTeams(
    selectees.map((s) => ({ leaguePlayerId: s.player.leaguePlayerId, score: s.score })),
  );
  const byId = new Map(selectees.map((s) => [s.player.leaguePlayerId, s.player]));
  const teamARoster = draft.teamA.map((id) => byId.get(id)!);
  const teamBRoster = draft.teamB.map((id) => byId.get(id)!);

  const teamAStrength = computeTeamStrength(teamARoster.map((p) => p.overallRating));
  const teamBStrength = computeTeamStrength(teamBRoster.map((p) => p.overallRating));

  // No real home team in an exhibition - "team A" is nominally home purely
  // as a simulateGame parameter slot, an inconsequential simplification.
  const game = simulateGame(teamAStrength, teamBStrength, rng, 0, 0);
  const teamAScore = game.homeScore;
  const teamBScore = game.awayScore;

  const stats = generateBoxScore(
    {
      homeTeamId: draft.captainAId,
      awayTeamId: draft.captainBId,
      homeRoster: teamARoster,
      awayRoster: teamBRoster,
      homeStrength: teamAStrength,
      awayStrength: teamBStrength,
      homeCoachModifier: EXHIBITION_COACH_MODIFIER,
      awayCoachModifier: EXHIBITION_COACH_MODIFIER,
    },
    teamAScore,
    teamBScore,
    rng,
  );

  const winningSideId = teamAScore >= teamBScore ? draft.captainAId : draft.captainBId;

  return {
    captainAId: draft.captainAId,
    captainBId: draft.captainBId,
    teamAScore,
    teamBScore,
    stats,
    mvpLeaguePlayerId: crownMvp(stats, winningSideId),
  };
}
