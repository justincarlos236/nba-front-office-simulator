/**
 * What releasing a player costs the club that releases him.
 *
 * Waiving does not erase a contract, it moves it: guaranteed money stays on the
 * waiving team's cap for every season it was promised for, while the player
 * himself leaves and can sign anywhere. That is the whole reason a bad contract
 * is a problem in a real front office. A release that simply deleted the salary
 * would make every mistake in this game reversible for free, and the cap would
 * stop being a constraint at all.
 *
 * `ContractYear` already separates `guaranteedCents` from `salaryCents`, so the
 * charge is read rather than estimated. Every contract this game currently
 * writes is fully guaranteed, which means releasing usually costs the full
 * remaining salary - correct for most real deals, and deliberately unpleasant.
 *
 * **Deliberate simplification: no stretch provision.** The real CBA lets a club
 * spread the remaining guarantee over twice the remaining years plus one, which
 * lowers the annual hit and lengthens the tail. It is a second decision layered
 * on this one, and it is not modelled; the charge lands on the seasons it was
 * always owed for. Recorded in docs/ROADMAP.md rather than hidden here.
 */

export interface WaiveChargeYear {
  season: number;
  deadMoneyCents: bigint;
}

export interface WaiveCost {
  /** One entry per season still owed, earliest first. */
  years: WaiveChargeYear[];
  totalCents: bigint;
  /** The charge landing on the season the release happens in. */
  currentSeasonCents: bigint;
  /** Seasons after the current one that inherit a charge. */
  futureSeasons: number;
}

/**
 * The dead money a release creates, by season.
 *
 * Seasons already played are not charged again - a club has paid those and they
 * are behind it. Only `fromSeason` onward carries forward.
 */
export function computeWaiveCost(input: {
  years: readonly { season: number; guaranteedCents: bigint }[];
  fromSeason: number;
}): WaiveCost {
  const years = input.years
    .filter((y) => y.season >= input.fromSeason && y.guaranteedCents > 0n)
    .map((y) => ({ season: y.season, deadMoneyCents: y.guaranteedCents }))
    .sort((a, b) => a.season - b.season);

  return {
    years,
    totalCents: years.reduce((sum, y) => sum + y.deadMoneyCents, 0n),
    currentSeasonCents: years.find((y) => y.season === input.fromSeason)?.deadMoneyCents ?? 0n,
    futureSeasons: years.filter((y) => y.season > input.fromSeason).length,
  };
}
