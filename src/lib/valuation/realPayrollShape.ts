/**
 * The real 2025-26 NBA salary distribution, as a calibration target for
 * `scoreToCapFraction`.
 *
 * **Why a shape and not a 30-team table.** Public payroll trackers disagree
 * substantially on per-team totals - they variously count active cap hits,
 * guaranteed money, dead money, two-way deals and incomplete-roster charges,
 * and three sources checked while writing this put the same team as much as
 * $60M apart. What they *do* agree on is the aggregate shape, and the shape is
 * the only thing worth calibrating against anyway: the simulator's rosters are
 * the top 15 by rating from a 537-player dataset, not the real rosters, so
 * comparing simulated Cleveland to real Cleveland compares two different teams.
 *
 * Every figure below was cross-checked against at least two independent
 * sources, and the cap/apron figures are the league's own published ones.
 *
 * Sources: NBA PR (cap, tax, aprons - official); Spotrac via press coverage
 * (league total, highest team payroll); salary-tracker aggregates (band counts).
 * Retrieved 2026-08-11.
 */

/** Published 2025-26 figures. These are also in `src/lib/cap/constants.ts`. */
export const REAL_CAP_2025_26_CENTS = 154_647_000_00;
export const REAL_TAX_LINE_2025_26_CENTS = 187_895_000_00;

/**
 * Team-level shape. The league total is the firmest number here (two sources,
 * and a third's per-team table summed to within $0.3M of it); the max is
 * Spotrac's, widely quoted in coverage of Cleveland's second-apron season.
 */
export const REAL_TEAM_PAYROLL_SHAPE = {
  leagueTotalCents: 5_100_000_000_00,
  meanCents: 170_000_000_00,
  /** Cleveland, the league's only second-apron team that season. */
  maxCents: 228_600_000_00,
  teams: 30,
} as const;

/**
 * Individual salary shape, as counts of players at or above a fraction of the
 * cap. This is what `scoreToCapFraction` controls directly, so it is the
 * calibration target that matters most.
 *
 * Roughly 450-500 players hold standard contracts across the league.
 */
export const REAL_SALARY_BANDS = [
  { atLeastFractionOfCap: 0.323, dollars: "$50M+", players: 5 },
  { atLeastFractionOfCap: 0.259, dollars: "$40M+", players: 10 },
  { atLeastFractionOfCap: 0.194, dollars: "$30M+", players: 30 },
] as const;
