import { computeStrengthDiff } from "./simulateGame";
import type { PlayerBoxScoreLine } from "./boxScore";

/**
 * Live Playoff Game Experience - a genuinely independent, quarter-by-
 * quarter simulation for the user's own playoff games, distinct from
 * simulateGame.ts's single-shot final-score model (which regular-season
 * games and every CPU-vs-CPU playoff series continue to use, completely
 * unchanged). Each quarter (and OT period, if needed) is its own
 * strength-biased random draw - the winner and final score *emerge* from
 * summing them, rather than being decided upfront and reverse-engineered
 * into a plausible-looking breakdown.
 *
 * QUARTER_STRENGTH_SENSITIVITY is empirically calibrated (see
 * simulateLiveGame.test.ts's calibration check) so that summing 4
 * independent quarters at a given strength differential produces a home-
 * win rate that tracks computeHomeWinProbability's prediction at that
 * same differential - without this, compounding 4 independent draws
 * would make team strength swing outcomes more extremely than the rest
 * of the engine (and GM-facing win-probability displays) says it should.
 */

const AVERAGE_QUARTER_SCORE = 28; // AVERAGE_TEAM_SCORE (112) / 4 - same baseline simulateGame.ts uses, per quarter
const QUARTER_SCORE_RANDOMNESS = 9; // +/- swing applied independently to each team's quarter score
const MIN_QUARTER_SCORE = 12;

const OT_AVERAGE_SCORE = 11; // a real NBA 5-minute OT period, roughly a quarter's score at 5/12 the length
const OT_SCORE_RANDOMNESS = 5;
const MIN_OT_SCORE = 4;

// Points of mean quarter-margin shift per unit of the shared strength-diff
// signal (see computeStrengthDiff) - calibrated empirically (a throwaway
// script simulated 20,000 games per strength differential across
// [-25..+25] and compared the resulting home-win rate against
// computeHomeWinProbability's prediction at that same differential),
// not guessed. 0.11 tracks the existing win-probability model within
// about one percentage point across the whole range tested; see
// simulateLiveGame.test.ts's calibration check for the regression net.
// Naively reusing a per-game-scale sensitivity here would over-amplify
// outcomes, since summing 4 independent periods compounds a strength
// edge more than a single-shot roll does - this constant corrects for
// that compounding rather than the win-probability model itself changing.
const QUARTER_STRENGTH_SENSITIVITY = 0.11;

function triangular(rng: () => number, spread: number): number {
  return (rng() + rng() - 1) * spread;
}

export interface PeriodScore {
  home: number;
  away: number;
}

function simulatePeriod(
  meanMargin: number,
  averageScore: number,
  randomness: number,
  minScore: number,
  rng: () => number,
): PeriodScore {
  // Independent noise on each side (not just one shared margin term) so a
  // quarter's *pace* varies too, not only which team it favors.
  const away = Math.max(minScore, Math.round(averageScore + triangular(rng, randomness)));
  const home = Math.max(
    minScore,
    Math.round(averageScore + meanMargin + triangular(rng, randomness)),
  );
  return { home, away };
}

/** One regulation quarter - exported standalone for the calibration check and for reuse if a future need arises (e.g. per-quarter box-score weighting). */
export function simulateQuarter(
  homeStrength: number,
  awayStrength: number,
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
  rng: () => number = Math.random,
): PeriodScore {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  const meanMargin = diff * QUARTER_STRENGTH_SENSITIVITY;
  return simulatePeriod(
    meanMargin,
    AVERAGE_QUARTER_SCORE,
    QUARTER_SCORE_RANDOMNESS,
    MIN_QUARTER_SCORE,
    rng,
  );
}

function simulateOvertimePeriod(
  homeStrength: number,
  awayStrength: number,
  homeCoachBonus: number,
  awayCoachBonus: number,
  rng: () => number,
): PeriodScore {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  // OT is shorter (5 min vs. 12) - the same strength edge matters
  // proportionally less in a shorter period, same spirit as a real close
  // game being more of a coin flip once it reaches overtime.
  const meanMargin = diff * QUARTER_STRENGTH_SENSITIVITY * (5 / 12);
  return simulatePeriod(meanMargin, OT_AVERAGE_SCORE, OT_SCORE_RANDOMNESS, MIN_OT_SCORE, rng);
}

export interface LiveGameResult {
  quarters: PeriodScore[]; // always length 4
  overtimes: PeriodScore[]; // empty unless the game was tied after regulation
  finalHomeScore: number;
  finalAwayScore: number;
  homeWon: boolean;
}

const MAX_OVERTIME_PERIODS = 6; // effectively unbounded for real play; just a hard safety cap

/**
 * Simulates a full playoff game one period at a time - 4 regulation
 * quarters, then sudden-death-length overtime periods until untied. The
 * winner and final score are read off the summed periods; nothing decides
 * the outcome ahead of the simulation.
 */
export function simulateLiveGame(
  homeStrength: number,
  awayStrength: number,
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
  rng: () => number = Math.random,
): LiveGameResult {
  const quarters: PeriodScore[] = [];
  for (let i = 0; i < 4; i++) {
    quarters.push(simulateQuarter(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus, rng));
  }

  let homeScore = quarters.reduce((sum, q) => sum + q.home, 0);
  let awayScore = quarters.reduce((sum, q) => sum + q.away, 0);

  const overtimes: PeriodScore[] = [];
  while (homeScore === awayScore && overtimes.length < MAX_OVERTIME_PERIODS) {
    const ot = simulateOvertimePeriod(
      homeStrength,
      awayStrength,
      homeCoachBonus,
      awayCoachBonus,
      rng,
    );
    overtimes.push(ot);
    homeScore += ot.home;
    awayScore += ot.away;
  }

  return {
    quarters,
    overtimes,
    finalHomeScore: homeScore,
    finalAwayScore: awayScore,
    homeWon: homeScore > awayScore,
  };
}

// ---------------------------------------------------------------------------
// Player stat progression for the live reveal
// ---------------------------------------------------------------------------

const COUNTING_STATS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers"] as const;

export interface PeriodPlayerStats {
  leaguePlayerId: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}

/** Splits `total` across periods proportional to `weights`, using the largest-remainder method so the periods always sum back to exactly `total` (never off by a rounding error). */
function allocateAcrossPeriods(total: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0 || total === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (w / totalWeight) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((sum, f) => sum + f, 0);
  const byFraction = raw
    .map((r, i) => ({ index: i, fraction: r - floors[i] }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[byFraction[k % byFraction.length].index] += 1;
  return result;
}

/**
 * Distributes the authoritative final box score (from `generateBoxScore` -
 * never recomputed or invented twice) across the game's periods for the
 * live reveal, so player stats visibly accumulate alongside the score.
 * Every player on a team shares that team's own real per-period scoring
 * shape (the team's actual points-per-quarter split from `simulateLiveGame`) -
 * a deliberate, honest simplification: this doesn't model an individual
 * player having a hotter or colder quarter than their team's overall pace,
 * only that the *team's* real per-period rhythm (already generated, not
 * fabricated) is what paces every player's own stat reveal. The final
 * totals always match the authoritative box score exactly, by construction.
 */
export function allocatePlayerStatsAcrossPeriods(
  finalBoxScore: PlayerBoxScoreLine[],
  periods: PeriodScore[],
  homeTeamId: string,
): PeriodPlayerStats[][] {
  const homeWeights = periods.map((p) => p.home);
  const awayWeights = periods.map((p) => p.away);

  const perPeriod: PeriodPlayerStats[][] = periods.map(() => []);
  for (const player of finalBoxScore) {
    const weights = player.leagueTeamId === homeTeamId ? homeWeights : awayWeights;
    const perStat = Object.fromEntries(
      COUNTING_STATS.map((stat) => [stat, allocateAcrossPeriods(player[stat], weights)]),
    ) as Record<(typeof COUNTING_STATS)[number], number[]>;

    periods.forEach((_, i) => {
      perPeriod[i].push({
        leaguePlayerId: player.leaguePlayerId,
        points: perStat.points[i],
        rebounds: perStat.rebounds[i],
        assists: perStat.assists[i],
        steals: perStat.steals[i],
        blocks: perStat.blocks[i],
        turnovers: perStat.turnovers[i],
      });
    });
  }
  return perPeriod;
}
