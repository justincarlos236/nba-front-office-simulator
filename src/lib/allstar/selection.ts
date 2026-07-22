import { computePerformanceScore } from "@/lib/valuation/playerValue";
import type { Conference, Position } from "@/generated/prisma/client";

/**
 * All-Star selection is driven primarily by this season's actual simulated
 * performance (computePerformanceScore on real box-score averages) - never
 * overallRating directly. overallRating is repurposed here as a small
 * "reputation/star power" nudge (an existing-data proxy for fan-vote bias,
 * no new field invented), so an elite player having a poor season can
 * still miss out while a breakout player having a great one gets a real
 * shot. See docs/ARCHITECTURE.md's All-Star Weekend section.
 */
export interface PlayerSeasonPerformanceSnapshot {
  leaguePlayerId: string;
  position: Position;
  conference: Conference;
  overallRating: number;
  gamesPlayed: number;
  minutesPerGame: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  turnoversPerGame: number;
  trueShootingPct: number;
  teamWinPct: number;
  isHealthy: boolean;
}

export type AllStarPositionGroup = "GUARD" | "FRONTCOURT";
export type AllStarRole = "STARTER" | "RESERVE" | "INJURY_REPLACEMENT";

export interface AllStarSelectionResult {
  leaguePlayerId: string;
  conference: Conference;
  positionGroup: AllStarPositionGroup;
  role: AllStarRole;
  performanceScore: number;
  pointsPerGame: number;
  reboundsPerGame: number;
  assistsPerGame: number;
  teamWinPct: number;
}

export interface SnubResult {
  leaguePlayerId: string;
  conference: Conference;
  performanceScore: number;
}

export interface AllStarSelectionOutput {
  selections: AllStarSelectionResult[];
  snubs: SnubResult[];
}

const POSITION_GROUP: Record<Position, AllStarPositionGroup> = {
  PG: "GUARD",
  SG: "GUARD",
  SF: "FRONTCOURT",
  PF: "FRONTCOURT",
  C: "FRONTCOURT",
};

// A real sample by the All-Star break (~41 team games) - excludes players
// who missed most of the first half, same "small sample is noise"
// principle applied everywhere else in this codebase's award logic.
const MIN_GAMES_FOR_ELIGIBILITY = 20;

const STARTER_GUARD_SLOTS = 2;
const STARTER_FRONTCOURT_SLOTS = 3;
const RESERVE_SLOTS_PER_CONFERENCE = 7;
const SNUBS_PER_CONFERENCE = 3;

// Same TEAM_RECORD_WEIGHT-style scale computeMVP already uses.
const TEAM_SUCCESS_WEIGHT = 15;

const STARTER_WEIGHTS = { performance: 0.7, reputation: 0.2 };
const RESERVE_WEIGHTS = { performance: 0.85, reputation: 0.1 };

function performanceScoreOf(p: PlayerSeasonPerformanceSnapshot): number {
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

function caseScore(
  p: PlayerSeasonPerformanceSnapshot,
  weights: { performance: number; reputation: number },
): number {
  const teamSuccessBonus = (p.teamWinPct - 0.5) * TEAM_SUCCESS_WEIGHT;
  return (
    performanceScoreOf(p) * weights.performance +
    p.overallRating * weights.reputation +
    teamSuccessBonus
  );
}

function toSelection(
  p: PlayerSeasonPerformanceSnapshot,
  role: AllStarRole,
): AllStarSelectionResult {
  return {
    leaguePlayerId: p.leaguePlayerId,
    conference: p.conference,
    positionGroup: POSITION_GROUP[p.position],
    role,
    performanceScore: performanceScoreOf(p),
    pointsPerGame: p.pointsPerGame,
    reboundsPerGame: p.reboundsPerGame,
    assistsPerGame: p.assistsPerGame,
    teamWinPct: p.teamWinPct,
  };
}

export function selectAllStars(players: PlayerSeasonPerformanceSnapshot[]): AllStarSelectionOutput {
  const eligible = players.filter((p) => p.gamesPlayed >= MIN_GAMES_FOR_ELIGIBILITY);
  const byId = new Map(eligible.map((p) => [p.leaguePlayerId, p]));
  const selectedIds = new Set<string>();
  const selections: AllStarSelectionResult[] = [];

  for (const conference of ["EAST", "WEST"] as const) {
    const confPlayers = eligible.filter((p) => p.conference === conference);

    const guards = confPlayers
      .filter((p) => POSITION_GROUP[p.position] === "GUARD")
      .sort((a, b) => caseScore(b, STARTER_WEIGHTS) - caseScore(a, STARTER_WEIGHTS))
      .slice(0, STARTER_GUARD_SLOTS);
    const frontcourt = confPlayers
      .filter((p) => POSITION_GROUP[p.position] === "FRONTCOURT")
      .sort((a, b) => caseScore(b, STARTER_WEIGHTS) - caseScore(a, STARTER_WEIGHTS))
      .slice(0, STARTER_FRONTCOURT_SLOTS);

    for (const p of [...guards, ...frontcourt]) {
      selections.push(toSelection(p, "STARTER"));
      selectedIds.add(p.leaguePlayerId);
    }

    const reserves = confPlayers
      .filter((p) => !selectedIds.has(p.leaguePlayerId))
      .sort((a, b) => caseScore(b, RESERVE_WEIGHTS) - caseScore(a, RESERVE_WEIGHTS))
      .slice(0, RESERVE_SLOTS_PER_CONFERENCE);

    for (const p of reserves) {
      selections.push(toSelection(p, "RESERVE"));
      selectedIds.add(p.leaguePlayerId);
    }
  }

  // Injury replacements - still-honored original selection stays in the
  // roster (matches real NBA: you're still "selected" even if replaced),
  // the next-highest-scoring eligible alternate at the same position group
  // and conference fills the roster spot.
  const replacements: AllStarSelectionResult[] = [];
  for (const selection of selections) {
    const original = byId.get(selection.leaguePlayerId);
    if (!original || original.isHealthy) continue;

    const alternate = eligible
      .filter(
        (p) =>
          p.conference === selection.conference &&
          POSITION_GROUP[p.position] === selection.positionGroup &&
          !selectedIds.has(p.leaguePlayerId),
      )
      .sort((a, b) => caseScore(b, RESERVE_WEIGHTS) - caseScore(a, RESERVE_WEIGHTS))[0];

    if (alternate) {
      replacements.push(toSelection(alternate, "INJURY_REPLACEMENT"));
      selectedIds.add(alternate.leaguePlayerId);
    }
  }
  selections.push(...replacements);

  // Snubs - not persisted as an achievement (nothing to record on a
  // profile), just the top non-selected players by pure performance
  // (not the reputation-blended case score) for news to reference.
  const snubs: SnubResult[] = [];
  for (const conference of ["EAST", "WEST"] as const) {
    const topSnubs = eligible
      .filter((p) => p.conference === conference && !selectedIds.has(p.leaguePlayerId))
      .map((p) => ({
        leaguePlayerId: p.leaguePlayerId,
        conference,
        performanceScore: performanceScoreOf(p),
      }))
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, SNUBS_PER_CONFERENCE);
    snubs.push(...topSnubs);
  }

  return { selections, snubs };
}
