import { getSeasonCapRules } from "./constants";

export interface ContractYearForProjection {
  season: number;
  salaryCents: bigint;
}

export interface SeasonProjection {
  season: number;
  committedSalaryCents: bigint;
  /** 0 once committed salary already meets or exceeds that season's projected cap. */
  projectedCapSpaceCents: bigint;
  playersUnderContract: number;
}

/**
 * Projects a team's already-committed payroll forward across future
 * seasons from its current roster's contracts - not a prediction of what
 * the team *will* do (no re-signings/new signings assumed), just what's
 * already on the books. That's deliberate: the point is to show how much
 * of a future season is already spoken for by decisions already made,
 * which is exactly what "long-term contracts affect future flexibility"
 * means in practice.
 */
export function computeMultiYearProjection(
  contractYears: ContractYearForProjection[],
  startSeason: number,
  yearsAhead: number,
): SeasonProjection[] {
  const seasons = Array.from({ length: yearsAhead }, (_, i) => startSeason + i);
  return seasons.map((season) => {
    const rows = contractYears.filter((cy) => cy.season === season);
    const committedSalaryCents = rows.reduce((sum, cy) => sum + cy.salaryCents, 0n);
    const rules = getSeasonCapRules(season);
    const projectedCapSpaceCents =
      committedSalaryCents < rules.salaryCapCents
        ? rules.salaryCapCents - committedSalaryCents
        : 0n;
    return {
      season,
      committedSalaryCents,
      projectedCapSpaceCents,
      playersUnderContract: rows.length,
    };
  });
}
