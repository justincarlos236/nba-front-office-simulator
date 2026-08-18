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
