/**
 * How many seasons ahead a team's own future picks exist as tradeable
 * assets - deep enough for real NBA-style "pick 3-5 years out" trades, but
 * bounded. A league always has a full rolling window of `[currentSeason,
 * currentSeason + FUTURE_PICK_WINDOW_YEARS]` pre-generated (see
 * `createLeagueAction`/`advanceSeasonAction`), refreshed by one new
 * far-edge year every time a season advances.
 */
export const FUTURE_PICK_WINDOW_YEARS = 5;

export interface FuturePickRow {
  leagueId: string;
  season: number;
  round: 1 | 2;
  originalTeamId: string;
  currentOwnerId: string;
}

/**
 * Every team's own round-1 and round-2 pick for each of the given seasons,
 * ready for `prisma.draftPick.createMany` (with `overallPickNumber: null`
 * added by the caller - the draft order for a season isn't known until
 * that season's own draft actually starts, see `startDraftAction`). Both
 * `originalTeamId` and `currentOwnerId` start out as the same team - a
 * pick only diverges from its original team once it's traded.
 */
export function buildFuturePickRows(
  leagueId: string,
  teamIds: string[],
  seasons: number[],
): FuturePickRow[] {
  const rows: FuturePickRow[] = [];
  for (const season of seasons) {
    for (const teamId of teamIds) {
      rows.push({ leagueId, season, round: 1, originalTeamId: teamId, currentOwnerId: teamId });
      rows.push({ leagueId, season, round: 2, originalTeamId: teamId, currentOwnerId: teamId });
    }
  }
  return rows;
}
