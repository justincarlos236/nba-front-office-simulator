import {
  validateTrade,
  type TradeAssetInput,
  type TradeTeamCapState,
} from "@/lib/trade/validateTrade";

/**
 * Around-the-league activity rolled as regular-season games are simulated:
 * injuries, CPU-CPU trades, and CPU free-agent signings. All of it is
 * driven by the number of games just simulated (not real time or click
 * count), so "sim a few games" produces little, "sim 50" produces more -
 * matching how an actual NBA season's news ebbs and flows with games played.
 */

export interface InjuryCandidate {
  leaguePlayerId: string;
  playerName: string;
}

export interface InjuryRollResult {
  leaguePlayerId: string;
  playerName: string;
  durationGames: number;
  injuryName: string;
  severity: "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
}

const MINOR_INJURIES = [
  "a sprained ankle",
  "back spasms",
  "soreness in his knee",
  "wrist soreness",
  "a hip contusion",
];
const MODERATE_INJURIES = [
  "a hamstring strain",
  "a calf strain",
  "a groin strain",
  "a shoulder sprain",
  "plantar fasciitis",
];
const MAJOR_INJURIES = [
  "a torn ACL",
  "a torn Achilles",
  "a fractured foot",
  "a torn meniscus",
  "a stress fracture",
];

function pick<T>(pool: readonly T[], rng: () => number): T {
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * Rolled once per team per simulated game (2% default chance). On a hit,
 * one player is chosen uniformly from that team's currently-healthy active
 * roster - real injuries aren't concentrated on stars or bench alike, so no
 * rating-based weighting.
 */
export function rollForTeamInjury(
  healthyRoster: InjuryCandidate[],
  rng: () => number = Math.random,
  chance = 0.02,
): InjuryRollResult | null {
  if (healthyRoster.length === 0) return null;
  if (rng() >= chance) return null;

  const injured = pick(healthyRoster, rng);
  const tierRoll = rng();

  if (tierRoll < 0.6) {
    return {
      leaguePlayerId: injured.leaguePlayerId,
      playerName: injured.playerName,
      durationGames: 1 + Math.floor(rng() * 5), // 1-5
      injuryName: pick(MINOR_INJURIES, rng),
      severity: "DAY_TO_DAY",
    };
  }
  if (tierRoll < 0.9) {
    return {
      leaguePlayerId: injured.leaguePlayerId,
      playerName: injured.playerName,
      durationGames: 6 + Math.floor(rng() * 10), // 6-15
      injuryName: pick(MODERATE_INJURIES, rng),
      severity: "OUT",
    };
  }
  return {
    leaguePlayerId: injured.leaguePlayerId,
    playerName: injured.playerName,
    durationGames: 16 + Math.floor(rng() * 15), // 16-30
    injuryName: pick(MAJOR_INJURIES, rng),
    severity: "SEASON_ENDING",
  };
}

/** P(at least one event) across `gamesInBatch` independent per-game rolls. */
export function shouldTriggerEvent(
  gamesInBatch: number,
  chancePerGame: number,
  rng: () => number = Math.random,
): boolean {
  if (gamesInBatch <= 0) return false;
  const chance = 1 - (1 - chancePerGame) ** gamesInBatch;
  return rng() < chance;
}

export interface CpuRosterPlayer {
  leaguePlayerId: string;
  playerName: string;
  rating: number;
  salaryCents: bigint;
  noTradeClause: boolean;
}

export interface CpuTeam {
  leagueTeamId: string;
  teamLabel: string;
  roster: CpuRosterPlayer[];
  capState: TradeTeamCapState;
}

export interface CpuTradeResult {
  teamA: { leagueTeamId: string; teamLabel: string; player: CpuRosterPlayer };
  teamB: { leagueTeamId: string; teamLabel: string; player: CpuRosterPlayer };
}

// Real trades skew heavily toward role players/depth, not stars - biasing
// toward the lower-rated ~70% of each team's tradeable (no-no-trade-clause)
// roster keeps CPU-CPU trades believable rather than randomly gutting
// contenders of their best player.
const TRADEABLE_POOL_FRACTION = 0.7;

function pickTradeablePlayer(roster: CpuRosterPlayer[], rng: () => number): CpuRosterPlayer | null {
  const eligible = roster.filter((p) => !p.noTradeClause);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => a.rating - b.rating);
  const poolSize = Math.max(1, Math.ceil(sorted.length * TRADEABLE_POOL_FRACTION));
  return pick(sorted.slice(0, poolSize), rng);
}

/**
 * Picks two random CPU teams and one tradeable player from each, re-rolling
 * up to `maxAttempts` times until a cap-legal 1-for-1 swap is found (reusing
 * the exact same `validateTrade` the user's own trades go through - CPU
 * moves are never a special-cased shortcut around real cap rules). Returns
 * null if no legal swap turns up within the attempt budget, which is a
 * quiet no-op for that roll, not an error.
 */
export function rollForCpuTrade(
  teams: CpuTeam[],
  season: number,
  rng: () => number = Math.random,
  maxAttempts = 5,
): CpuTradeResult | null {
  if (teams.length < 2) return null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const i = Math.floor(rng() * teams.length);
    let j = Math.floor(rng() * teams.length);
    if (j === i) j = (j + 1) % teams.length;
    const teamA = teams[i];
    const teamB = teams[j];

    const playerA = pickTradeablePlayer(teamA.roster, rng);
    const playerB = pickTradeablePlayer(teamB.roster, rng);
    if (!playerA || !playerB) continue;

    const assets: TradeAssetInput[] = [
      {
        type: "PLAYER",
        fromTeamId: teamA.leagueTeamId,
        toTeamId: teamB.leagueTeamId,
        playerId: playerA.leaguePlayerId,
        salaryCents: playerA.salaryCents,
      },
      {
        type: "PLAYER",
        fromTeamId: teamB.leagueTeamId,
        toTeamId: teamA.leagueTeamId,
        playerId: playerB.leaguePlayerId,
        salaryCents: playerB.salaryCents,
      },
    ];
    const validation = validateTrade({
      season,
      assets,
      teamCapStates: {
        [teamA.leagueTeamId]: teamA.capState,
        [teamB.leagueTeamId]: teamB.capState,
      },
    });

    if (validation.isValid) {
      return {
        teamA: { leagueTeamId: teamA.leagueTeamId, teamLabel: teamA.teamLabel, player: playerA },
        teamB: { leagueTeamId: teamB.leagueTeamId, teamLabel: teamB.teamLabel, player: playerB },
      };
    }
  }
  return null;
}

export interface CpuSigningResult {
  leagueTeamId: string;
  leaguePlayerId: string;
}

/**
 * Free agent minimum-salary signings are always cap-legal regardless of
 * apron status (see `validateSigning`), so unlike trades this never needs a
 * re-roll loop - any CPU team can always sign any available free agent to a
 * minimum deal.
 */
export function rollForCpuSigning(
  cpuTeamIds: string[],
  freeAgentIds: string[],
  rng: () => number = Math.random,
): CpuSigningResult | null {
  if (cpuTeamIds.length === 0 || freeAgentIds.length === 0) return null;
  return {
    leagueTeamId: pick(cpuTeamIds, rng),
    leaguePlayerId: pick(freeAgentIds, rng),
  };
}
