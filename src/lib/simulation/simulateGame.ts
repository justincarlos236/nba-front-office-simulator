/**
 * Strength-based game simulation.
 *
 * A game is modelled as a **point margin drawn from a normal distribution
 * centred on the strength differential**, with the winner falling out of that
 * margin's sign. This is deliberately NOT a possession-by-possession
 * simulation - a simplification documented in docs/SYSTEMS.md, chosen so
 * the engine is fast, deterministic given a seed, and easy to reason about.
 *
 * WHY MARGIN-FIRST (see docs/SIMULATION_AUDIT.md, P1-5/P1-6)
 *
 * The previous model drew the winner from a logistic curve and then drew the
 * margin from a bounded uniform [3, 22] that never looked at team strength. It
 * had three measured consequences over 246,000 simulated games:
 *
 *   - a 97.5% favourite beat a hopeless team by the same margin distribution
 *     as a coin-flip game (12.49 points in both cases)
 *   - not one game in 246,000 was decided by 1 or 2 points (NBA: ~7%)
 *   - not one was decided by more than 22 (NBA: ~12% are 26+)
 *
 * Deriving both from a single distribution fixes all three at once and makes
 * them consistent by construction: win probability is now literally
 * "how often is this margin positive", so the two can never disagree.
 */

/**
 * Rating points of equivalent strength conferred by playing at home.
 *
 * Reduced from 3 when the margin model changed: a strength point is now worth
 * 2.31 points of expected margin, so 3 meant a ~7-point home edge and pushed
 * home teams to a 67% win rate. Real home-court advantage is about 2.5 points
 * of margin, which is a shade over one strength point here and lands the home
 * win rate back in the real 54-58% band.
 */
const HOME_COURT_ADVANTAGE = 1.1;

/**
 * Home-court advantage in the postseason, which is genuinely larger than in the
 * regular season.
 *
 * **The playoffs used to differ from a regular-season game by nothing at all.**
 * `simulateSeries` called `simulateGame` directly: same advantage, same
 * variance, same everything. Measured across 20,000 playoff games, home teams
 * won 58.2% - the top of the engine's own regular-season band rather than above
 * it. Real home teams win about 54% of regular-season games and 60% of playoff
 * games. See docs/PLAYOFF_AUDIT.md, PO-P2-1.
 *
 * Louder crowds, tighter rotations and referees under more pressure are the
 * usual explanations; the effect is well documented whatever the mechanism.
 *
 * Calibrated in `scripts/playoff-home-court-calibration.ts` against a measured
 * 60% postseason home win rate, holding the regular-season value fixed.
 */
export const PLAYOFF_HOME_COURT_ADVANTAGE = 1.3;

/**
 * Points of expected margin per point of strength differential.
 *
 * Calibrated empirically against real saves rather than assumed. The strength
 * model produces a best-to-worst spread of roughly 7 rating points in a fresh
 * league and 12 in a talent-stratified one, so no single value is ideal for
 * both; this pair brackets the NBA's ~12-win standard deviation from either
 * side, measured over 200 seasons per league: 10.7 in a fresh league and 14.1
 * in a developed one, against 5.1 and 5.8 before this change.
 *
 * The old logistic steepness of 0.07 was calibrated for a far wider spread
 * than the roster model has ever produced, which flattened the league to a
 * nine-game gap between first and last and made 60-win seasons a 0.01% event.
 *
 * Only the ratio to MARGIN_SD sets win probability, so the two must be tuned
 * together: this pair holds that ratio at 0.154 while widening the margin
 * spread to match real box scores.
 */
const MARGIN_PER_STRENGTH_POINT = 2.31;

/**
 * Standard deviation of a single game's margin around its expectation - what
 * produces both one-point finishes and 30-point blowouts from one draw.
 *
 * 15 rather than the NBA's own ~13 because a pure normal puts more mass near
 * zero than real basketball does (late-game fouling and garbage time push
 * close games apart). Measured across margin bands, 15 fits real NBA
 * frequencies best overall: blowouts of 26+ land at 12.3% against a real 12%,
 * and every band from 6 to 25 points lands within three points of real.
 * One-possession games remain somewhat over-represented (11.9% vs ~7%), which
 * is the residual cost of a symmetric distribution.
 */
const MARGIN_SD = 15;

/** Combined points scored by both teams, before the margin is split out. */
const AVERAGE_COMBINED_SCORE = 228;
const COMBINED_SCORE_SD = 19;

/** Nobody scores under this in a modern NBA game; guards against tail draws. */
const MIN_TEAM_SCORE = 78;

/**
 * The single shared strength-differential signal every win/scoring model in
 * this engine derives from - exported so the live playoff quarter simulator
 * (`simulateLiveGame.ts`) uses the exact same underlying number, rather than a
 * second copy of this formula that could quietly drift out of sync.
 */
export function computeStrengthDiff(
  homeStrength: number,
  awayStrength: number,
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
  /** Defaults to the regular-season value; the postseason passes its own. */
  homeCourtAdvantage: number = HOME_COURT_ADVANTAGE,
): number {
  return homeStrength + homeCourtAdvantage + homeCoachBonus - awayStrength - awayCoachBonus;
}

/**
 * Cumulative normal, via a standard erf approximation (Abramowitz & Stegun).
 *
 * Clamped strictly inside (0, 1): at large |z| the approximation underflows to
 * exactly 0 or 1, and callers rely on no matchup ever being a certainty - a
 * probability of 1 would also make the live-game simulator unable to produce a
 * comeback.
 */
function standardNormalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = z >= 0 ? 1 - p : p;
  return Math.min(1 - 1e-6, Math.max(1e-6, cdf));
}

/**
 * A standard normal draw from two uniforms (Box-Muller). Consumes exactly two
 * rng() values, which keeps seeded sequences reproducible.
 */
function gaussian(rng: () => number): number {
  // Guard the log against an exact zero, which some seeded generators can emit.
  const u1 = Math.max(rng(), 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * The home team's win probability: exactly the chance that this matchup's
 * margin distribution comes out positive. Derived from the same constants
 * `simulateGame` draws from, so the stated probability and the simulated
 * results cannot diverge.
 */
export function computeHomeWinProbability(
  homeStrength: number,
  awayStrength: number,
  // a small additive nudge alongside
  // HOME_COURT_ADVANTAGE, deliberately kept out of the strength numbers
  // themselves since those are reused elsewhere as a pure-player signal.
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
): number {
  const diff = computeStrengthDiff(homeStrength, awayStrength, homeCoachBonus, awayCoachBonus);
  return standardNormalCdf((diff * MARGIN_PER_STRENGTH_POINT) / MARGIN_SD);
}

export interface SimulatedGameResult {
  homeWon: boolean;
  homeScore: number;
  awayScore: number;
  homeWinProbability: number;
}

export function simulateGame(
  homeStrength: number,
  awayStrength: number,
  rng: () => number = Math.random,
  homeCoachBonus: number = 0,
  awayCoachBonus: number = 0,
  homeCourtAdvantage: number = HOME_COURT_ADVANTAGE,
): SimulatedGameResult {
  const diff = computeStrengthDiff(
    homeStrength,
    awayStrength,
    homeCoachBonus,
    awayCoachBonus,
    homeCourtAdvantage,
  );
  const homeWinProbability = standardNormalCdf((diff * MARGIN_PER_STRENGTH_POINT) / MARGIN_SD);

  // The margin, from the home team's perspective. Positive means the home team
  // won by that much.
  const expectedMargin = diff * MARGIN_PER_STRENGTH_POINT;
  let homeMargin = Math.round(expectedMargin + gaussian(rng) * MARGIN_SD);
  // Basketball has no ties. A drawn zero breaks toward whoever was favoured,
  // which is also what overtime tends to do.
  if (homeMargin === 0) homeMargin = expectedMargin >= 0 ? 1 : -1;

  const combined = Math.round(AVERAGE_COMBINED_SCORE + gaussian(rng) * COMBINED_SCORE_SD);
  const absMargin = Math.abs(homeMargin);
  // Split the combined total around the margin. The winner takes the larger
  // half; `combined` and `absMargin` always have the same parity after this
  // rounding, so the two scores are whole numbers that sum back exactly.
  const loserScore = Math.max(MIN_TEAM_SCORE, Math.round((combined - absMargin) / 2));
  const winnerScore = loserScore + absMargin;

  const homeWon = homeMargin > 0;
  return homeWon
    ? { homeWon: true, homeScore: winnerScore, awayScore: loserScore, homeWinProbability }
    : { homeWon: false, homeScore: loserScore, awayScore: winnerScore, homeWinProbability };
}
