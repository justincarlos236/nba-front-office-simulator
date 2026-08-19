import { prisma } from "@/lib/prisma";

/**
 * Dead money owed by each club for one season.
 *
 * `computeCapSheet` has taken a `deadMoneyCents` input since it was written,
 * but nothing produced one until releasing a player existed. Every cap sheet in
 * the app has to read this: a club that can waive a contract without the charge
 * appearing against its cap has been handed a way to erase any mistake for
 * free, which is the one thing the cap is there to prevent.
 *
 * Loaded per season rather than per contract because dead money outlives the
 * contract that created it - the row is the record, and the contract is gone.
 */

/** Dead money for every club in a league, keyed by `leagueTeamId`. */
export async function loadDeadMoneyByTeam(
  leagueId: string,
  season: number,
): Promise<Map<string, bigint>> {
  const rows = await prisma.deadMoney.groupBy({
    by: ["leagueTeamId"],
    where: { leagueId, season },
    _sum: { amountCents: true },
  });
  return new Map(rows.map((r) => [r.leagueTeamId, r._sum.amountCents ?? 0n]));
}

/** Dead money for a single club, for callers that only build one sheet. */
export async function loadDeadMoneyCents(leagueTeamId: string, season: number): Promise<bigint> {
  const row = await prisma.deadMoney.aggregate({
    where: { leagueTeamId, season },
    _sum: { amountCents: true },
  });
  return row._sum.amountCents ?? 0n;
}

/** The individual charges behind a club's total, for showing the user why. */
export async function loadDeadMoneyLines(leagueTeamId: string, season: number) {
  return prisma.deadMoney.findMany({
    where: { leagueTeamId, season },
    orderBy: { amountCents: "desc" },
    select: { id: true, playerName: true, amountCents: true, waivedSeason: true },
  });
}
