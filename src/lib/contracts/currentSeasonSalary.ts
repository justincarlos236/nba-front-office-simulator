export interface ContractYearLike {
  season: number;
  salaryCents: bigint;
}

export interface ContractLike {
  years: ContractYearLike[];
}

/**
 * The salary a player is owed in a specific season - the single figure both
 * the cap engine and any money-formatting display must read.
 *
 * Resolves by matching `season`, never by array position. `years[0]` is only
 * the current-season salary when the query happened to filter or order the
 * `years` relation to put it first; every caller that reaches for `[0]` is
 * quietly depending on that, and a display path and a cap-math path can drift
 * apart the moment one of them forgets the filter. Reading by season removes
 * that coupling: the same contract resolves to the same figure regardless of
 * how its years were loaded.
 *
 * Returns 0 when the contract does not cover the season (no contract, or the
 * player is only under contract in other seasons), matching how an unrostered
 * or expired player contributes nothing to the cap.
 */
export function currentSeasonSalaryCents(
  contract: ContractLike | null | undefined,
  season: number,
): bigint {
  const year = contract?.years.find((y) => y.season === season);
  return year?.salaryCents ?? 0n;
}

/**
 * What a player is still owed *after* `season`, earliest year first.
 *
 * The companion to `currentSeasonSalaryCents`, and it exists for the same
 * reason. Callers used `contract.years.slice(1)`, which is only the future
 * years when the query that loaded them happened to filter to
 * `season >= current` *and* order ascending. That was true at all three call
 * sites - but it made a valuation input depend on a `where` clause written
 * hundreds of lines away, in a file that does not mention trade value. The
 * offseason roster query filters to a single season, and the same expression
 * there would silently yield an empty future.
 *
 * Resolving by season removes the coupling: the same contract yields the same
 * remaining years however it was loaded, ordered or filtered. A contract whose
 * first year starts *after* `season` keeps that year, which `slice(1)` dropped.
 */
export function futureSalaryCents(
  contract: ContractLike | null | undefined,
  season: number,
): bigint[] {
  return (contract?.years ?? [])
    .filter((y) => y.season > season)
    .sort((a, b) => a.season - b.season)
    .map((y) => y.salaryCents);
}
