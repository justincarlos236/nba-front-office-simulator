/**
 * Derives a single team-strength number (roughly the same 0-100 scale as
 * `overallRating`) from a roster, weighting a rotation rather than averaging a
 * squad. Feeds `simulateGame`, the standings, playoff seeding and team
 * identity, so its shape decides how much of a season is talent and how much
 * is luck.
 *
 * **The weights were nearly flat, and that was the single most consequential
 * number in the simulation.** Across 15 players the best man was 12.3% of a
 * team and the bottom six were 21.1%, which meant acquiring a superstar was
 * worth about what gutting six bench spots cost. Measured (see
 * docs/TEAM_STRENGTH_AUDIT.md):
 *
 *   - talent SD 6.4 wins against a real ~11.1
 *   - the league spanned 26 to 53 wins; a real one spans roughly 17 to 63
 *   - 56% of the standings were luck, against about 14% in reality
 *
 * That last figure is the one that mattered. A seven-game series averages luck
 * away and leaves only talent, which is why `docs/PLAYOFF_AUDIT.md` found a 1v8
 * series at 83.5% against a real 93% - the bracket was right and the league
 * underneath it was too flat. Two earlier audits went looking for this in the
 * rating distribution and could not find it, because it was never there.
 *
 * The curve is a geometric decay across the rotation, fitted in
 * `scripts/team-strength-calibration.ts` against three league-level targets at
 * once - talent SD, best record, worst record - rather than to any single
 * matchup. It is bounded at both ends on purpose: unconstrained, the fit
 * returns a shape that zeroes out the 9th man and leaves the bench at 25% of a
 * team, fitting the number while inverting the meaning.
 *
 * Resulting shares: best player 24.9%, top three 58.8%, bottom six 3.4%.
 * Real minutes shares are nearer 14% and 5%; impact is more concentrated than
 * minutes, which is why the top is allowed above its minutes share and the
 * bench below.
 *
 * This closes most of the gap, not all of it: talent SD lands at 9.5 against
 * the real 11.1, and the top-share bound is what binds. The residual belongs to
 * the rating distribution - `docs/RATING_AUDIT.md` has the 80+ population at
 * ~115 against a real 82 - and cannot be fixed here without making one player
 * an implausible share of his team.
 */
const ROTATION_SIZE = 9;
const ROTATION_WEIGHTS = [1.0, 0.77, 0.59, 0.45, 0.34, 0.26, 0.2, 0.15, 0.12];
const BENCH_WEIGHT = 0.02;

export function computeTeamStrength(playerRatings: number[]): number {
  if (playerRatings.length === 0) return 0;

  const sorted = [...playerRatings].sort((a, b) => b - a);
  let weightedSum = 0;
  let weightTotal = 0;

  sorted.forEach((rating, i) => {
    const weight = i < ROTATION_SIZE ? ROTATION_WEIGHTS[i] : BENCH_WEIGHT;
    weightedSum += rating * weight;
    weightTotal += weight;
  });

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}
