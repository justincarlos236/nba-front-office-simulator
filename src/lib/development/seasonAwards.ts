/**
 * Awards computed only from data the simulator actually tracks honestly:
 * rating, team record, rookie status, and season-over-season rating
 * change. MVP/ROY/MIP predate the box-score engine and stay
 * exactly as they were - untouched, already tuned and tested.
 *
 * DEFENSIVE_PLAYER_OF_THE_YEAR and SIXTH_MAN_OF_THE_YEAR were added once
 * Phase 14a/14b's real per-game box scores existed - previously excluded
 * here (and still excluded: Coach of the Year, All-Defense) for lacking
 * the individual defensive/bench-usage data to back them honestly. Same
 * "don't fabricate what the engine can't support" principle this project
 * already applies to contract data - now that real steals/blocks/minutes
 * exist per game, DPOY/6MOY have real data to stand on.
 */
import { computePerformanceScore } from "@/lib/valuation/playerValue";

export interface PlayerSeasonSnapshot {
  leaguePlayerId: string;
  overallRating: number;
  /** Rating at the start of the season just completed, or null if there's no prior record (e.g. a new signing). */
  previousRating: number | null;
  /** Years of experience entering the season just completed - 0 means a rookie season. */
  experience: number;
  /** The player's team's win percentage for the season just completed. */
  teamWinPct: number;
}

export interface SeasonAwardWinner {
  leaguePlayerId: string;
  value: number;
}

// How many rating-points-equivalent a full swing from a 0-win to a
// perfect team is worth. Additive (not multiplicative against rating) so
// team record can tip a close talent gap without ever letting a
// low-rated player on a great team outscore a real superstar on a bad one.
const TEAM_RECORD_WEIGHT = 15;

export function computeMVP(players: PlayerSeasonSnapshot[]): SeasonAwardWinner | null {
  let best: SeasonAwardWinner | null = null;
  let bestScore = -Infinity;
  for (const p of players) {
    const score = p.overallRating + (p.teamWinPct - 0.5) * TEAM_RECORD_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      best = { leaguePlayerId: p.leaguePlayerId, value: Math.round(score * 100) / 100 };
    }
  }
  return best;
}

export function computeRookieOfTheYear(players: PlayerSeasonSnapshot[]): SeasonAwardWinner | null {
  const rookies = players.filter((p) => p.experience === 0);
  if (rookies.length === 0) return null;
  const best = rookies.reduce((a, b) => (b.overallRating > a.overallRating ? b : a));
  return { leaguePlayerId: best.leaguePlayerId, value: best.overallRating };
}

export function computeMostImprovedPlayer(
  players: PlayerSeasonSnapshot[],
): SeasonAwardWinner | null {
  let best: SeasonAwardWinner | null = null;
  let bestDelta = -Infinity;
  for (const p of players) {
    if (p.previousRating === null) continue;
    const delta = p.overallRating - p.previousRating;
    if (delta > bestDelta) {
      bestDelta = delta;
      best = { leaguePlayerId: p.leaguePlayerId, value: delta };
    }
  }
  // A league full of decliners shouldn't produce a "most improved" winner
  // with a negative or zero delta.
  if (!best || bestDelta <= 0) return null;
  return best;
}

export interface DefensiveSeasonSnapshot {
  leaguePlayerId: string;
  gamesPlayed: number;
  minutesPerGame: number;
  stealsPerGame: number;
  blocksPerGame: number;
  reboundsPerGame: number;
}

// Enough of a season's sample that a hot early stretch of steals/blocks
// isn't mistaken for a real defensive season - same "small sample is
// noise" principle the valuation model and league leaders already apply.
const MIN_GAMES_FOR_DEFENSIVE_AWARD = 10;

/**
 * Only steals/blocks/rebounds are available - this engine has no
 * opponent-shooting or on/off defensive data (see docs/SYSTEMS.md's
 * box-score limitations), so this is a real but narrow slice of defensive
 * value, not a claim of complete defensive rating. Per-36 normalized so a
 * lower-minutes defensive specialist isn't crowded out by a high-minutes
 * starter posting only slightly better raw per-game numbers.
 */
export function computeDefensivePlayerOfTheYear(
  players: DefensiveSeasonSnapshot[],
): SeasonAwardWinner | null {
  const eligible = players.filter((p) => p.gamesPlayed >= MIN_GAMES_FOR_DEFENSIVE_AWARD);
  if (eligible.length === 0) return null;

  let best: SeasonAwardWinner | null = null;
  let bestScore = -Infinity;
  for (const p of eligible) {
    const per36 = (v: number) => (v * 36) / Math.max(p.minutesPerGame, 1);
    const score =
      per36(p.stealsPerGame) * 2.5 + per36(p.blocksPerGame) * 2.5 + per36(p.reboundsPerGame) * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = { leaguePlayerId: p.leaguePlayerId, value: Math.round(score * 100) / 100 };
    }
  }
  return best;
}

export interface BenchSeasonSnapshot {
  leaguePlayerId: string;
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

const MIN_GAMES_FOR_SIXTH_MAN_AWARD = 10;
// A real per-game "started" flag doesn't exist (box-score minutes are
// generated per game, not persisted as a starter/bench role) - average
// minutes below this is used as a bench-role proxy, honestly documented as
// an approximation rather than a real starter/bench distinction.
const SIXTH_MAN_MINUTES_CEILING = 28;

/** Reuses the same tested performance-composite the valuation model uses, fed real simulated season averages instead of the frozen real-world baseline. */
export function computeSixthManOfTheYear(players: BenchSeasonSnapshot[]): SeasonAwardWinner | null {
  const eligible = players.filter(
    (p) =>
      p.gamesPlayed >= MIN_GAMES_FOR_SIXTH_MAN_AWARD &&
      p.minutesPerGame < SIXTH_MAN_MINUTES_CEILING,
  );
  if (eligible.length === 0) return null;

  let best: SeasonAwardWinner | null = null;
  let bestScore = -Infinity;
  for (const p of eligible) {
    const score = computePerformanceScore({
      pointsPerGame: p.pointsPerGame,
      reboundsPerGame: p.reboundsPerGame,
      assistsPerGame: p.assistsPerGame,
      stealsPerGame: p.stealsPerGame,
      blocksPerGame: p.blocksPerGame,
      turnoversPerGame: p.turnoversPerGame,
      minutesPerGame: p.minutesPerGame,
      trueShootingPct: p.trueShootingPct,
    });
    if (score > bestScore) {
      bestScore = score;
      best = { leaguePlayerId: p.leaguePlayerId, value: score };
    }
  }
  return best;
}
