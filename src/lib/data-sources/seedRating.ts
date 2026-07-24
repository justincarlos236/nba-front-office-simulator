/**
 * Seed rating model: turns a real season line into a realistic 60-99 starting
 * overall for a newly created league. This is deliberately SEPARATE from the
 * in-sim valuation composite in `src/lib/valuation/playerValue.ts`:
 *
 *   - This runs ONCE, at import time, to establish a league's initial state.
 *     After a save begins, `LeaguePlayer.overallRating` evolves on its own
 *     (development/decline/injuries) and this model is never consulted again.
 *   - Keeping it standalone means calibrating for *realistic starting ratings*
 *     (a believable leaguewide distribution, stars separated at the top) can't
 *     destabilize the gameplay economy, which the valuation model governs.
 *
 * Calibrated against the real 2025-26 season. The old box-score composite, run
 * on real data, clamped a dozen stars to 99 and inflated low-minute efficient
 * bigs (Sims/Bitadze/Poeltl) to 99 too. This model fixes that with three
 * levers: production is volume-aware (per-game, not per-36, so low-minute rates
 * don't balloon), minutes/role and sample size regress unproven players toward
 * a fringe baseline, and the top end is compressed so 99 is genuinely rare.
 *
 * A separate minimal override layer (see `ratingOverrides`) nudges the handful
 * of players where this model still disagrees with broad NBA consensus.
 */
import type { CanonicalSeasonStat } from "./canonical";

// Average-starter anchor baselines (per game) - the statline that scores ~0
// production points, i.e. lands near the ANCHOR overall.
const ANCHOR = 74;
const BASE = { pts: 14, reb: 4.5, ast: 3, stl: 0.9, blk: 0.5, tov: 1.6, min: 24, ts: 0.57 };

// Per-unit production weights (per game).
const W = {
  pts: 0.62,
  reb: 0.5,
  ast: 0.9,
  stl: 1.7,
  blk: 1.5,
  tov: -0.9,
  role: 0.45, // minutes are real evidence of a coach's trust
  eff: 42, // TS% delta -> points; bounded below
};
const EFF_CLAMP = 7;

// Top-end compression: production is linear up to KNEE, compressed above it, so
// elite lines separate a little but 99 stays rare.
const KNEE = 89;
const ABOVE_KNEE_SCALE = 0.52;

// Sample-size regression target + trust curves. Unproven players (few games or
// few minutes) are pulled toward a fringe/replacement baseline rather than
// trusted at a spiky small-sample rate.
const REGRESSION_TARGET = 67;
const FULL_TRUST_GAMES = 42;
const FULL_TRUST_MINUTES = 22;

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * The raw, pre-regression production+role+efficiency score for a season line.
 * Exported for calibration/inspection; most callers want
 * `computeSeedOverallRating`.
 */
export function seedProductionScore(stat: CanonicalSeasonStat): number {
  const ts = stat.trueShootingPct ?? BASE.ts;
  const production =
    (stat.pointsPerGame - BASE.pts) * W.pts +
    (stat.reboundsPerGame - BASE.reb) * W.reb +
    (stat.assistsPerGame - BASE.ast) * W.ast +
    (stat.stealsPerGame - BASE.stl) * W.stl +
    (stat.blocksPerGame - BASE.blk) * W.blk +
    (stat.turnoversPerGame - BASE.tov) * W.tov;
  const role = (stat.minutesPerGame - BASE.min) * W.role;
  const eff = clamp((ts - BASE.ts) * W.eff, -EFF_CLAMP, EFF_CLAMP);

  const raw = ANCHOR + production + role + eff;
  return raw <= KNEE ? raw : KNEE + (raw - KNEE) * ABOVE_KNEE_SCALE;
}

/** How much to trust a season line, 0-1, from games played and minutes. */
export function sampleConfidence(gamesPlayed: number, minutesPerGame: number): number {
  const gamesConf = clamp(gamesPlayed / FULL_TRUST_GAMES, 0, 1);
  const minConf = clamp(minutesPerGame / FULL_TRUST_MINUTES, 0, 1);
  return gamesConf * (0.6 + 0.4 * minConf);
}

/**
 * The realistic 60-99 seed overall for one real season line. Small samples and
 * low-minute roles are regressed toward a fringe baseline so efficient bench
 * bigs don't read as stars.
 */
export function computeSeedOverallRating(stat: CanonicalSeasonStat): number {
  const score = seedProductionScore(stat);
  const confidence = sampleConfidence(stat.gamesPlayed, stat.minutesPerGame);
  const regressed = confidence * score + (1 - confidence) * REGRESSION_TARGET;
  return clamp(Math.round(regressed), 60, 99);
}

/**
 * Age-driven development headroom above the seed overall (mirrors the existing
 * `derivePotentialRating` shape): young players get real upside, players past
 * their prime have little. Kept here so the seed dataset carries both numbers.
 */
export function computeSeedPotentialRating(overallRating: number, age: number): number {
  const yearsOfUpside = Math.max(0, 26 - age);
  const headroom = Math.min(10, yearsOfUpside * 2);
  return Math.min(99, overallRating + headroom);
}
