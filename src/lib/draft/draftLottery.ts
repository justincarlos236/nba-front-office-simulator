/**
 * The real post-2019-reform NBA draft lottery odds table: the three
 * worst records are flattened to identical 14.0% odds at the top (so
 * tanking to be the single worst team no longer meaningfully improves a
 * team's odds versus finishing 2nd or 3rd worst), then odds taper off for
 * seeds 4-14. This is real, published data, not an approximation - see
 * https://official.nba.com/nba-draft-lottery-faq/ for the source odds.
 *
 * The real lottery draws picks 1-3 via weighted ping-pong-ball
 * combinations without replacement, then picks 4-14 go in strict
 * reverse-standings order among the remaining teams. This module
 * approximates the same *probabilities* with a simpler weighted draw
 * without replacement for the first 4 picks (in practice picks 1-3 are
 * lottery-drawn and pick 4 is close to deterministic anyway once the top
 * 3 are removed) - a documented simplification of the exact combinatoric
 * mechanism, not the odds themselves.
 */
export const LOTTERY_ODDS: Readonly<Record<number, number>> = {
  1: 0.14,
  2: 0.14,
  3: 0.14,
  4: 0.125,
  5: 0.105,
  6: 0.09,
  7: 0.075,
  8: 0.06,
  9: 0.045,
  10: 0.03,
  11: 0.02,
  12: 0.015,
  13: 0.01,
  14: 0.005,
};

export interface LotteryTeam {
  leagueTeamId: string;
  /** 1 = worst regular-season record among non-playoff teams, 14 = best. */
  seed: number;
}

function weightedDraw(teams: LotteryTeam[], rng: () => number): LotteryTeam {
  const totalWeight = teams.reduce((sum, t) => sum + (LOTTERY_ODDS[t.seed] ?? 0), 0);
  let roll = rng() * totalWeight;
  for (const team of teams) {
    roll -= LOTTERY_ODDS[team.seed] ?? 0;
    if (roll <= 0) return team;
  }
  return teams[teams.length - 1];
}

/**
 * Runs the lottery for the 14 non-playoff teams, returning their pick
 * order (index 0 = pick 1, index 13 = pick 14). The top 4 picks are
 * decided by weighted draw without replacement; the rest fall in
 * reverse-seed order among whoever didn't win one of the first 4.
 */
export function runLottery(teams: LotteryTeam[], rng: () => number = Math.random): string[] {
  const remaining = [...teams];
  const winners: string[] = [];
  const drawCount = Math.min(4, teams.length);

  for (let i = 0; i < drawCount; i++) {
    const winner = weightedDraw(remaining, rng);
    winners.push(winner.leagueTeamId);
    remaining.splice(remaining.indexOf(winner), 1);
  }

  const rest = [...remaining].sort((a, b) => a.seed - b.seed).map((t) => t.leagueTeamId);
  return [...winners, ...rest];
}

/** Seeds 1-14 are lottery-bound; 15-30 pick in straight reverse-standings order. */
export const LOTTERY_SEED_COUNT = 14;
const TOP_PICKS_DRAWN = 4;

/**
 * The expected pick slot for each lottery seed, computed exactly.
 *
 * **Why this exists.** `computeDraftPickTradeValue` has to price a pick whose
 * slot is not yet known, and it used to assume the worst team simply receives
 * pick 1. The lottery denies exactly that: post-2019 reform the three worst
 * records share a flat 14% and the worst team lands at pick 1 only about one
 * year in seven. Pricing off the best possible outcome overvalued a bottom
 * team's future first by 47% (docs/DRAFT_AUDIT.md, D-P1-1) - an asset a user
 * could then sell at that price, with tanking as the way to acquire one.
 *
 * **Exact, not simulated.** The draw is four teams without replacement, so the
 * whole outcome space is the 14 x 13 x 12 x 11 = 24,024 ordered top-four
 * sequences. Enumerating them gives the exact distribution under the same
 * Plackett-Luce model `weightedDraw` implements, so this and `runLottery`
 * cannot drift apart. Cheap enough to compute once and memoise; no Monte Carlo
 * and no hand-copied table that could go stale if the odds are ever updated.
 */
let cachedDistributions: readonly (readonly number[])[] | null = null;

/**
 * The full probability distribution over pick slots for one lottery seed:
 * index i holds P(this seed lands at pick i + 1).
 *
 * Callers that price a pick want this rather than the mean. Pick value is
 * strongly convex in slot - pick 1 is worth about eight times pick 30 - so by
 * Jensen's inequality the value of the average slot is not the average value
 * of the slot, and using the mean underprices a lottery pick by around 5%.
 */
export function lotterySlotDistributionForSeed(seed: number): readonly number[] {
  if (!cachedDistributions) cachedDistributions = computeLotteryDistributions();
  const index = Math.min(Math.max(Math.round(seed) - 1, 0), cachedDistributions.length - 1);
  return cachedDistributions[index];
}

/** The mean of the above. Kept for callers that genuinely want a slot number. */
export function expectedLotterySlotForSeed(seed: number): number {
  return lotterySlotDistributionForSeed(seed).reduce(
    (sum, probability, i) => sum + probability * (i + 1),
    0,
  );
}

function computeLotteryDistributions(): number[][] {
  const seeds = Array.from({ length: LOTTERY_SEED_COUNT }, (_, i) => i + 1);
  const distributions = Array.from({ length: LOTTERY_SEED_COUNT }, () =>
    new Array<number>(LOTTERY_SEED_COUNT).fill(0),
  );

  const walk = (drawn: number[], probability: number) => {
    if (drawn.length === TOP_PICKS_DRAWN) {
      const drawnSet = new Set(drawn);
      // The four winners take picks 1-4 in the order drawn; everyone else
      // falls in seed order behind them.
      drawn.forEach((seed, i) => {
        distributions[seed - 1][i] += probability;
      });
      let slot = TOP_PICKS_DRAWN + 1;
      for (const seed of seeds) {
        if (drawnSet.has(seed)) continue;
        distributions[seed - 1][slot - 1] += probability;
        slot += 1;
      }
      return;
    }

    const remaining = seeds.filter((s) => !drawn.includes(s));
    const totalWeight = remaining.reduce((sum, s) => sum + (LOTTERY_ODDS[s] ?? 0), 0);
    if (totalWeight <= 0) return;
    for (const seed of remaining) {
      const weight = LOTTERY_ODDS[seed] ?? 0;
      if (weight <= 0) continue;
      walk([...drawn, seed], probability * (weight / totalWeight));
    }
  };

  walk([], 1);
  return distributions;
}
