import type { Position } from "@/generated/prisma/client";
import { deriveOverallRating } from "@/lib/league/ratingFromStats";
import type { RosterPlayerForSimulation, RealStatBaseline } from "@/lib/actions/leagueTeamStrength";

/**
 * A lightweight (not possession-by-possession) per-game player box-score
 * generator. `simulateGame.ts` already decided the team's final score - this
 * module's job is to explain that already-fixed result with a believable
 * individual stat line per player, not to re-decide who won. See
 * docs/ARCHITECTURE.md for the full design rationale.
 */

export interface PlayerBoxScoreLine {
  leaguePlayerId: string;
  leagueTeamId: string;
  minutesPlayed: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgMade: number;
  fgAttempted: number;
  fg3Made: number;
  fg3Attempted: number;
  ftMade: number;
  ftAttempted: number;
}

export interface GameRosters {
  homeTeamId: string;
  awayTeamId: string;
  homeRoster: RosterPlayerForSimulation[];
  awayRoster: RosterPlayerForSimulation[];
  homeStrength: number;
  awayStrength: number;
}

const TEAM_MINUTES = 240;
const MAX_ROTATION_SIZE = 12;
// Base minute-weight per rotation rank (0 = best player), tapering from
// starters through a 6th-man bump down to deep bench.
const RANK_MINUTE_WEIGHTS = [1.42, 1.35, 1.28, 1.2, 1.12, 0.95, 0.72, 0.55, 0.4, 0.28, 0.15, 0.08];
const GARBAGE_TIME_MARGIN_FLOOR = 15;
const GARBAGE_TIME_MARGIN_CEIL = 40;
const DEEP_BENCH_SCRATCH_RANK = 9; // rank >= this can DNP-CD
const DEEP_BENCH_SCRATCH_CHANCE = 0.4;

const POSITIONS: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Triangular random in [-spread, +spread], mode 0 - cheap, and matches this
// codebase's existing convention of a uniform rng() with no normal-RNG
// machinery (see simulateGame.ts).
function triangular(rng: () => number, spread: number): number {
  return (rng() + rng() - 1) * spread;
}

function countSuccesses(attempts: number, pct: number, rng: () => number): number {
  let makes = 0;
  for (let i = 0; i < attempts; i++) {
    if (rng() < pct) makes++;
  }
  return makes;
}

// ---------------------------------------------------------------------------
// 1. Minutes allocation
// ---------------------------------------------------------------------------

function buildRotation(
  roster: RosterPlayerForSimulation[],
): { player: RosterPlayerForSimulation; rank: number }[] {
  const used = new Set<string>();
  const starters: RosterPlayerForSimulation[] = [];

  for (const pos of POSITIONS) {
    const candidate = roster
      .filter((p) => p.position === pos && !used.has(p.leaguePlayerId))
      .sort((a, b) => b.overallRating - a.overallRating)[0];
    if (candidate) {
      starters.push(candidate);
      used.add(candidate.leaguePlayerId);
    }
  }

  const remaining = roster
    .filter((p) => !used.has(p.leaguePlayerId))
    .sort((a, b) => b.overallRating - a.overallRating);

  // Backfill any unfilled starting slot (e.g. no true center on the
  // roster) with the best remaining player regardless of position.
  while (starters.length < 5 && remaining.length > 0) {
    const next = remaining.shift();
    if (!next) break;
    starters.push(next);
  }

  return [...starters, ...remaining].slice(0, MAX_ROTATION_SIZE).map((player, rank) => ({
    player,
    rank,
  }));
}

/** Allocates exactly 240 team-minutes across a healthy roster for one game. */
export function allocateMinutes(
  roster: RosterPlayerForSimulation[],
  marginOfVictory: number,
  rng: () => number = Math.random,
): Map<string, number> {
  const rotation = buildRotation(roster);
  if (rotation.length === 0) return new Map();

  const garbageFactor = clamp(
    (marginOfVictory - GARBAGE_TIME_MARGIN_FLOOR) /
      (GARBAGE_TIME_MARGIN_CEIL - GARBAGE_TIME_MARGIN_FLOOR),
    0,
    1,
  );

  const weights = rotation.map(({ player, rank }) => {
    const baseWeight = RANK_MINUTE_WEIGHTS[rank] ?? 0;
    if (baseWeight <= 0) return 0;
    if (rank >= DEEP_BENCH_SCRATCH_RANK && rng() < DEEP_BENCH_SCRATCH_CHANCE) return 0;

    const ratingMultiplier = 0.8 + (player.overallRating / 99) * 0.2;
    const garbageMultiplier = rank < 5 ? 1 - 0.4 * garbageFactor : 1 + 0.5 * garbageFactor;
    const variance = 1 + triangular(rng, rank < DEEP_BENCH_SCRATCH_RANK ? 0.15 : 0.3);
    return Math.max(0, baseWeight * ratingMultiplier * garbageMultiplier * variance);
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return new Map();

  const minutes = weights.map((w) => clamp(Math.round((w / totalWeight) * TEAM_MINUTES), 0, 40));

  // Close the rounding gap by nudging the highest-minute players first -
  // never the deep bench, so a scratch player doesn't suddenly show up.
  let residual = TEAM_MINUTES - minutes.reduce((sum, m) => sum + m, 0);
  const order = [...minutes.keys()].sort((a, b) => minutes[b] - minutes[a]);
  let guard = 0;
  while (residual !== 0 && guard < order.length * 4) {
    const idx = order[guard % order.length];
    const delta = residual > 0 ? 1 : -1;
    if (
      minutes[idx] + delta >= 0 &&
      minutes[idx] + delta <= 40 &&
      (minutes[idx] > 0 || delta > 0)
    ) {
      minutes[idx] += delta;
      residual -= delta;
    }
    guard++;
  }

  const result = new Map<string, number>();
  rotation.forEach(({ player }, i) => {
    if (minutes[i] > 0) result.set(player.leaguePlayerId, minutes[i]);
  });
  return result;
}

// ---------------------------------------------------------------------------
// 2. Per-36 rate priors
// ---------------------------------------------------------------------------

interface Per36Prior {
  pts36: number;
  reb36: number;
  ast36: number;
  stl36: number;
  blk36: number;
  tov36: number;
  ts: number;
  fgPct: number;
  fg3Pct: number;
  threePARate: number; // share of FGA that are 3s
  ftRate: number; // FTA / FGA
}

interface PositionProfile {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  ts: number;
  fgPct: number;
  fg3Pct: number;
  threePARate: number;
  ftRate: number;
  // Per-rating-point movement above/below the RATING_ANCHOR, per stat -
  // e.g. a center's rebounds/blocks move far more per rating point than a
  // point guard's would.
  shape: { pts: number; reb: number; ast: number; stl: number; blk: number; tov: number };
}

// Anchored at rating 72 ("average starter"), matching playerValue.ts's own
// anchor point, so a fictional 72-rated wing produces roughly the same kind
// of box score a real 72-rated wing's real stats would.
const POSITION_PROFILES: Record<Position, PositionProfile> = {
  PG: {
    pts: 15,
    reb: 3.5,
    ast: 6.5,
    stl: 1.3,
    blk: 0.3,
    tov: 2.3,
    ts: 0.56,
    fgPct: 0.44,
    fg3Pct: 0.36,
    threePARate: 0.4,
    ftRate: 0.25,
    shape: { pts: 0.35, reb: 0.05, ast: 0.35, stl: 0.1, blk: 0.02, tov: 0.05 },
  },
  SG: {
    pts: 17,
    reb: 3.5,
    ast: 3.0,
    stl: 1.1,
    blk: 0.3,
    tov: 1.8,
    ts: 0.565,
    fgPct: 0.45,
    fg3Pct: 0.37,
    threePARate: 0.45,
    ftRate: 0.22,
    shape: { pts: 0.45, reb: 0.08, ast: 0.15, stl: 0.1, blk: 0.02, tov: 0.05 },
  },
  SF: {
    pts: 16,
    reb: 5.0,
    ast: 3.0,
    stl: 1.0,
    blk: 0.5,
    tov: 1.7,
    ts: 0.57,
    fgPct: 0.46,
    fg3Pct: 0.36,
    threePARate: 0.38,
    ftRate: 0.25,
    shape: { pts: 0.35, reb: 0.15, ast: 0.15, stl: 0.1, blk: 0.05, tov: 0.05 },
  },
  PF: {
    pts: 15,
    reb: 7.5,
    ast: 2.2,
    stl: 0.8,
    blk: 0.8,
    tov: 1.6,
    ts: 0.56,
    fgPct: 0.49,
    fg3Pct: 0.35,
    threePARate: 0.25,
    ftRate: 0.32,
    shape: { pts: 0.25, reb: 0.3, ast: 0.08, stl: 0.05, blk: 0.15, tov: 0.05 },
  },
  C: {
    pts: 14,
    reb: 10.0,
    ast: 1.8,
    stl: 0.7,
    blk: 1.6,
    tov: 1.6,
    ts: 0.6,
    fgPct: 0.55,
    fg3Pct: 0.33,
    threePARate: 0.12,
    ftRate: 0.4,
    shape: { pts: 0.15, reb: 0.4, ast: 0.05, stl: 0.03, blk: 0.2, tov: 0.05 },
  },
};

const RATING_ANCHOR = 72;
const PCT_SHIFT_PER_RATING = 0.0015;
const COUNTING_STAT_ELASTICITY = 0.85;
const TURNOVER_ELASTICITY = 0.3;
const RATIO_CLAMP_MIN = 0.5;
const RATIO_CLAMP_MAX = 1.8;

/** No real stat baseline (fictional draft-generated prospect) - a hand-authored, position-shaped archetype. */
function fictionalPrior(position: Position, rating: number): Per36Prior {
  const p = POSITION_PROFILES[position];
  const d = rating - RATING_ANCHOR;
  return {
    pts36: Math.max(0, p.pts + p.shape.pts * d),
    reb36: Math.max(0, p.reb + p.shape.reb * d),
    ast36: Math.max(0, p.ast + p.shape.ast * d),
    stl36: Math.max(0, p.stl + p.shape.stl * d),
    blk36: Math.max(0, p.blk + p.shape.blk * d),
    tov36: Math.max(0.5, p.tov + p.shape.tov * d * 0.5),
    ts: clamp(p.ts + PCT_SHIFT_PER_RATING * d, 0.42, 0.68),
    fgPct: clamp(p.fgPct + PCT_SHIFT_PER_RATING * d, 0.36, 0.62),
    fg3Pct: clamp(p.fg3Pct + PCT_SHIFT_PER_RATING * 0.6 * d, 0.28, 0.46),
    threePARate: p.threePARate,
    ftRate: p.ftRate,
  };
}

/**
 * Real player: scale their real per-36 stat line by how far their *current*
 * league-save rating has drifted from what deriveOverallRating would
 * compute fresh from that same frozen real stat line right now - "rating at
 * creation" never needs to be stored, just recomputed on demand. This is
 * what makes a player's simulated production actually move as they
 * develop/decline in a league, instead of staying frozen to their real
 * 2023-24 line forever.
 */
function realPlayerPrior(
  position: Position,
  realStat: RealStatBaseline,
  currentRating: number,
): Per36Prior {
  const minutes = Math.max(realStat.minutesPerGame, 1);
  const per36 = (v: number) => (v * 36) / minutes;
  const ts = realStat.trueShootingPct ?? 0.56;

  const baselineRating = deriveOverallRating({
    pointsPerGame: realStat.pointsPerGame,
    reboundsPerGame: realStat.reboundsPerGame,
    assistsPerGame: realStat.assistsPerGame,
    stealsPerGame: realStat.stealsPerGame,
    blocksPerGame: realStat.blocksPerGame,
    turnoversPerGame: realStat.turnoversPerGame,
    minutesPerGame: realStat.minutesPerGame,
    trueShootingPct: ts,
  });

  const ratio = clamp(
    currentRating / Math.max(baselineRating, 1),
    RATIO_CLAMP_MIN,
    RATIO_CLAMP_MAX,
  );
  const countingRatio = 1 + (ratio - 1) * COUNTING_STAT_ELASTICITY;
  const tovRatio = 1 + (ratio - 1) * TURNOVER_ELASTICITY;
  const pctShift = (currentRating - baselineRating) * PCT_SHIFT_PER_RATING;

  const positionProfile = POSITION_PROFILES[position];
  const fgPct = realStat.fgPct ?? positionProfile.fgPct;
  const fg3Pct = realStat.fg3Pct ?? positionProfile.fg3Pct;

  return {
    pts36: per36(realStat.pointsPerGame) * countingRatio,
    reb36: per36(realStat.reboundsPerGame) * countingRatio,
    ast36: per36(realStat.assistsPerGame) * countingRatio,
    stl36: per36(realStat.stealsPerGame) * countingRatio,
    blk36: per36(realStat.blocksPerGame) * countingRatio,
    tov36: Math.max(0.5, per36(realStat.turnoversPerGame) * tovRatio),
    ts: clamp(ts + pctShift, 0.42, 0.68),
    fgPct: clamp(fgPct + pctShift, 0.36, 0.62),
    fg3Pct: clamp(fg3Pct + pctShift * 0.6, 0.28, 0.46),
    // Shot selection (3PA rate, FT rate) isn't in PlayerSeasonStat at all
    // (only shooting percentages, no attempt counts) - always position-based.
    threePARate: positionProfile.threePARate,
    ftRate: positionProfile.ftRate,
  };
}

function derivePer36Prior(player: RosterPlayerForSimulation): Per36Prior {
  return player.realStat
    ? realPlayerPrior(player.position, player.realStat, player.overallRating)
    : fictionalPrior(player.position, player.overallRating);
}

// ---------------------------------------------------------------------------
// 3. Per-game generation (prior + minutes -> one game's raw stats)
// ---------------------------------------------------------------------------

const REFERENCE_LEAGUE_STRENGTH = 75;
const OPPONENT_ADJUSTMENT_CAP = 0.1;
const HOT_COLD_SPREAD = 0.35;
const OUTLIER_GAME_CHANCE = 0.06;
const OUTLIER_MULTIPLIER = 2.5;

function generateRawPlayerGame(
  player: RosterPlayerForSimulation,
  leagueTeamId: string,
  minutes: number,
  opponentStrength: number,
  rng: () => number,
): PlayerBoxScoreLine {
  const prior = derivePer36Prior(player);
  const oppAdjustment = clamp(
    (REFERENCE_LEAGUE_STRENGTH - opponentStrength) * 0.0025,
    -OPPONENT_ADJUSTMENT_CAP,
    OPPONENT_ADJUSTMENT_CAP,
  );

  // One shared "hot/cold" factor for the game, applied more to volume than
  // efficiency - a big scoring night reads as "took more shots," not "same
  // shots, implausibly better percentage."
  const hotSpread =
    rng() < OUTLIER_GAME_CHANCE ? HOT_COLD_SPREAD * OUTLIER_MULTIPLIER : HOT_COLD_SPREAD;
  const hot = 1 + triangular(rng, hotSpread);
  const minutesFactor = minutes / 36;

  const pts36 = prior.pts36 * (1 + oppAdjustment);
  const ts = clamp(prior.ts * (1 + oppAdjustment * 0.4), 0.3, 0.75);
  const fgPct = clamp(
    prior.fgPct * (1 + oppAdjustment * 0.4) * (1 + (hot - 1) * 0.25 + triangular(rng, 0.08)),
    0.25,
    0.75,
  );
  const fg3Pct = clamp(
    prior.fg3Pct * (1 + oppAdjustment * 0.4) * (1 + (hot - 1) * 0.25 + triangular(rng, 0.08)),
    0.15,
    0.6,
  );
  const ftPct = clamp(0.75 * (1 + triangular(rng, 0.05)), 0.5, 0.95);

  // Standard true-shot-attempts identity (TSA = FGA + 0.44*FTA), fully
  // derivable from TS% + a position shot profile - no new data needed.
  const tsa36 = pts36 / (2 * ts);
  const fga36 = tsa36 / (1 + 0.44 * prior.ftRate);
  const fta36 = prior.ftRate * fga36;
  const threePa36 = prior.threePARate * fga36;

  const fgAttempted = Math.max(0, Math.round(fga36 * minutesFactor * hot));
  const fg3Attempted = Math.min(
    fgAttempted,
    Math.max(0, Math.round(threePa36 * minutesFactor * hot * (1 + triangular(rng, 0.1)))),
  );
  const twoAttempted = fgAttempted - fg3Attempted;
  const ftAttempted = Math.max(0, Math.round(fta36 * minutesFactor * (1 + (hot - 1) * 0.5)));

  const fg3Made = countSuccesses(fg3Attempted, fg3Pct, rng);
  const twoPct = clamp(
    (fgPct * fgAttempted - fg3Pct * fg3Attempted) / Math.max(twoAttempted, 1),
    0.3,
    0.75,
  );
  const twoMade = countSuccesses(twoAttempted, twoPct, rng);
  const ftMade = countSuccesses(ftAttempted, ftPct, rng);

  const points = twoMade * 2 + fg3Made * 3 + ftMade;

  const otherStat = (per36: number, correlation: number) =>
    Math.max(
      0,
      Math.round(per36 * minutesFactor * (1 + (hot - 1) * correlation + triangular(rng, 0.35))),
    );

  return {
    leaguePlayerId: player.leaguePlayerId,
    leagueTeamId,
    minutesPlayed: minutes,
    points,
    rebounds: otherStat(prior.reb36 * (1 + oppAdjustment), 0.3),
    assists: otherStat(prior.ast36 * (1 + oppAdjustment), 0.3),
    steals: otherStat(prior.stl36 * (1 + oppAdjustment), 0.2),
    blocks: otherStat(prior.blk36 * (1 + oppAdjustment), 0.2),
    turnovers: otherStat(prior.tov36, 0.2),
    fgMade: twoMade + fg3Made,
    fgAttempted,
    fg3Made,
    fg3Attempted,
    ftMade,
    ftAttempted,
  };
}

// ---------------------------------------------------------------------------
// 4. Reconciliation to the already-fixed team score
// ---------------------------------------------------------------------------

/**
 * Rescales every player's attempts (not points directly, so the
 * makes/attempted identity always stays legal) down toward the fixed team
 * total - attempts are floored rather than rounded so the re-rolled makes
 * almost always land at or below the target, leaving a small non-negative
 * residual that's always solvable by adding free throws (unbounded, always
 * available). The rare case where re-rolled variance still overshoots is
 * resolved by removing a made free throw, or failing that downgrading a
 * made three to a made two (a one-point "plug," same spirit as how a real
 * box score's last point or two just is what it is).
 */
function reconcilePoints(
  rawPlayers: PlayerBoxScoreLine[],
  targetScore: number,
  rng: () => number,
): PlayerBoxScoreLine[] {
  if (rawPlayers.length === 0) return rawPlayers;
  const rawTotal = rawPlayers.reduce((sum, p) => sum + p.points, 0);
  if (rawTotal <= 0) return rawPlayers;

  const scaleFactor = targetScore / rawTotal;

  const rescaled = rawPlayers.map((p) => {
    const fgAttempted = Math.floor(p.fgAttempted * scaleFactor);
    const fg3Attempted = Math.min(fgAttempted, Math.floor(p.fg3Attempted * scaleFactor));
    const twoAttempted = fgAttempted - fg3Attempted;
    const ftAttempted = Math.floor(p.ftAttempted * scaleFactor);

    const fg3Pct = p.fg3Attempted > 0 ? p.fg3Made / p.fg3Attempted : 0.35;
    const origTwoAttempted = p.fgAttempted - p.fg3Attempted;
    const twoPct = origTwoAttempted > 0 ? (p.fgMade - p.fg3Made) / origTwoAttempted : 0.48;
    const ftPct = p.ftAttempted > 0 ? p.ftMade / p.ftAttempted : 0.75;

    const fg3Made = countSuccesses(fg3Attempted, fg3Pct, rng);
    const twoMade = countSuccesses(twoAttempted, twoPct, rng);
    const ftMade = countSuccesses(ftAttempted, ftPct, rng);

    return {
      ...p,
      points: twoMade * 2 + fg3Made * 3 + ftMade,
      fgMade: twoMade + fg3Made,
      fgAttempted,
      fg3Made,
      fg3Attempted,
      ftMade,
      ftAttempted,
    };
  });

  let residual = targetScore - rescaled.reduce((sum, p) => sum + p.points, 0);
  if (residual === 0) return rescaled;

  const order = [...rescaled.keys()].sort(
    (a, b) => rescaled[b].minutesPlayed - rescaled[a].minutesPlayed,
  );
  let guard = 0;
  while (residual !== 0 && guard < order.length * 6) {
    const idx = order[guard % order.length];
    const p = rescaled[idx];
    if (residual > 0) {
      p.ftMade += 1;
      p.ftAttempted = Math.max(p.ftAttempted, p.ftMade);
      p.points += 1;
      residual -= 1;
    } else if (p.ftMade > 0) {
      p.ftMade -= 1;
      p.points -= 1;
      residual += 1;
    } else if (p.fg3Made > 0) {
      p.fg3Made -= 1;
      p.fgMade -= 1; // still a make, just recorded as a two instead of a three
      p.points -= 1;
      residual += 1;
    }
    guard++;
  }

  return rescaled;
}

/**
 * Rebounds/assists are left independently generated (real team totals for
 * these already vary widely game to game) - this is only a lightweight
 * guardrail pulling an implausible team total back toward a believable band.
 */
function rescaleStatBand(
  players: PlayerBoxScoreLine[],
  stat: "rebounds" | "assists",
  min: number,
  max: number,
): PlayerBoxScoreLine[] {
  const total = players.reduce((sum, p) => sum + p[stat], 0);
  if (total === 0 || (total >= min && total <= max)) return players;
  const target = total < min ? min : max;
  const factor = target / total;
  return players.map((p) => ({ ...p, [stat]: Math.max(0, Math.round(p[stat] * factor)) }));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Generates a full game's player box scores for both teams from an already-decided final score. */
export function generateBoxScore(
  rosters: GameRosters,
  homeScore: number,
  awayScore: number,
  rng: () => number = Math.random,
): PlayerBoxScoreLine[] {
  const margin = Math.abs(homeScore - awayScore);

  const homeMinutes = allocateMinutes(rosters.homeRoster, margin, rng);
  const awayMinutes = allocateMinutes(rosters.awayRoster, margin, rng);

  const homeById = new Map(rosters.homeRoster.map((p) => [p.leaguePlayerId, p]));
  const awayById = new Map(rosters.awayRoster.map((p) => [p.leaguePlayerId, p]));

  const homeRaw = [...homeMinutes.entries()].map(([leaguePlayerId, minutes]) => {
    const player = homeById.get(leaguePlayerId);
    if (!player) throw new Error(`Unknown home roster player ${leaguePlayerId}`);
    return generateRawPlayerGame(player, rosters.homeTeamId, minutes, rosters.awayStrength, rng);
  });
  const awayRaw = [...awayMinutes.entries()].map(([leaguePlayerId, minutes]) => {
    const player = awayById.get(leaguePlayerId);
    if (!player) throw new Error(`Unknown away roster player ${leaguePlayerId}`);
    return generateRawPlayerGame(player, rosters.awayTeamId, minutes, rosters.homeStrength, rng);
  });

  const homeReconciled = rescaleStatBand(
    rescaleStatBand(reconcilePoints(homeRaw, homeScore, rng), "rebounds", 28, 58),
    "assists",
    8,
    38,
  );
  const awayReconciled = rescaleStatBand(
    rescaleStatBand(reconcilePoints(awayRaw, awayScore, rng), "rebounds", 28, 58),
    "assists",
    8,
    38,
  );

  return [...homeReconciled, ...awayReconciled];
}
