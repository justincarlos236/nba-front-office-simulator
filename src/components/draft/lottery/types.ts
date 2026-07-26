/** Pre-reveal display shape - everything the overview needs, before any draw has happened. */
export interface LotteryOverviewTeamDisplay {
  currentOwnerTeamId: string;
  currentOwnerLabel: string;
  logoUrl: string | null;
  primaryColor: string;
  isUserTeam: boolean;
  originalTeamId: string;
  originalTeamLabel: string;
  ownedByAnotherTeam: boolean;
  projectedSeed: number;
  oddsForNumberOnePickPct: number;
}
