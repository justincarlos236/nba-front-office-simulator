import { prisma } from "@/lib/prisma";

/**
 * Sums this team's already-committed first-year salary from signings made
 * via the (simplified, single) Signing Exception this season, derived
 * from `Contract.signedUsing` rather than a separately-tracked running
 * total - one source of truth for "how much exception spend has
 * happened," not a counter that could drift out of sync with the
 * contracts it's supposed to represent.
 */
export async function getSigningExceptionUsage(
  leagueTeamId: string,
  season: number,
): Promise<bigint> {
  const contracts = await prisma.contract.findMany({
    where: {
      leagueTeamId,
      signedSeason: season,
      signedUsing: { in: ["MID_LEVEL_NON_TAXPAYER", "MID_LEVEL_TAXPAYER"] },
    },
    include: { years: { where: { season } } },
  });
  return contracts.reduce((sum, c) => sum + (c.years[0]?.salaryCents ?? 0n), 0n);
}
