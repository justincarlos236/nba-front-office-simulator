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
 * **These counts were wrong until real contracts were imported, and wrong in a
 * way that inverted a conclusion.** They were hand-assembled from published
 * trackers and read 5 / 10 / 30. Measured against the 462 real 2025-26
 * contracts the dataset now carries (`scripts/import-contracts.ts`), the true
 * counts are 14 / 26 / 59 - two to three times higher across every band.
 *
 * docs/audits/CONTRACT_AUDIT.md judged the generated distribution against the old
 * numbers and concluded it was too fat through $30-40M. Against the real ones
 * it is the opposite: the generator is too *thin* at the top, producing one
 * player above $50M where the league has fourteen. Any future calibration
 * should be measured against these, not the old figures.
 *
 * Source: the committed dataset's own `contract` field, counted over players
 * holding a roster spot. Reproduce with `scripts/contract-audit.ts`.
 */
export const REAL_SALARY_BANDS = [
  { atLeastFractionOfCap: 0.323, dollars: "$50M+", players: 14 },
  { atLeastFractionOfCap: 0.259, dollars: "$40M+", players: 26 },
  { atLeastFractionOfCap: 0.194, dollars: "$30M+", players: 59 },
] as const;

/**
 * What the real contracts actually total across the 462 matched players. Kept
 * separate from `REAL_TEAM_PAYROLL_SHAPE.leagueTotalCents` (an external
 * estimate) because the two are measured differently: this one excludes the
 * ~75 rostered players on two-way deals, which carry no cap contract and never
 * appear in a contract feed.
 */
export const SEEDED_REAL_PAYROLL_CENTS = 5_291_000_000_00;
