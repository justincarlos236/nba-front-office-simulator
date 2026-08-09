"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { executeTradeAction } from "@/lib/actions/trade";

/**
 * Accepting and declining an unsolicited CPU trade offer.
 *
 * These are the first real users of `TradeStatus.PROPOSED`. The schema has
 * always carried the proposal lifecycle, but every trade in the product went
 * straight to EXECUTED because trade was outbound-only - the user proposed and
 * the deal either happened or it did not.
 */

async function loadOwnedProposal(leagueId: string, tradeId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  // 404-shaped rather than 403-shaped, consistent with the rest of the
  // data-access layer: a non-owner must not learn a league exists.
  if (!league || league.ownerId !== session.user.id) throw new Error("League not found");
  if (!league.userControlledTeamId) throw new Error("You don't control a team in this league");

  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: { assets: true },
  });
  if (!trade || trade.leagueId !== leagueId) throw new Error("Offer not found");
  // Re-checked here rather than trusted from the page: the offer may have been
  // resolved in another tab, and a double-accept would execute the deal twice.
  if (trade.status !== "PROPOSED") throw new Error("This offer is no longer open");

  return { league, trade, userTeamId: league.userControlledTeamId };
}

export async function acceptCpuOfferAction(leagueId: string, tradeId: string) {
  const { trade, userTeamId } = await loadOwnedProposal(leagueId, tradeId);

  const outgoing = trade.assets.filter((a) => a.fromLeagueTeamId === userTeamId);
  const incoming = trade.assets.filter((a) => a.toLeagueTeamId === userTeamId);
  const partnerTeamId = incoming[0]?.fromLeagueTeamId ?? trade.proposedById;

  // Resolve the proposal *before* delegating: `executeTradeAction` ends in a
  // redirect, which throws, so anything after that call would never run.
  await prisma.trade.update({
    where: { id: tradeId },
    data: { status: "ACCEPTED", resolvedAt: new Date() },
  });

  // Delegated rather than reimplemented. That action re-validates everything
  // server-side, writes the cap snapshot, and records fan sentiment and the
  // news row - an accepted offer must be exactly as real as a trade the user
  // built themselves, and a second execution path would drift from it.
  await executeTradeAction({
    leagueId,
    fromTeamId: userTeamId,
    toTeamId: partnerTeamId,
    myPlayerIds: outgoing.filter((a) => a.leaguePlayerId).map((a) => a.leaguePlayerId!),
    theirPlayerIds: incoming.filter((a) => a.leaguePlayerId).map((a) => a.leaguePlayerId!),
    myPickIds: outgoing.filter((a) => a.draftPickId).map((a) => a.draftPickId!),
    theirPickIds: incoming.filter((a) => a.draftPickId).map((a) => a.draftPickId!),
  });
}

export async function declineCpuOfferAction(leagueId: string, tradeId: string) {
  await loadOwnedProposal(leagueId, tradeId);

  await prisma.trade.update({
    where: { id: tradeId },
    data: { status: "REJECTED", resolvedAt: new Date() },
  });

  // Declining is deliberately silent - no news row. A deal that never happened
  // is not league news, and the wire is for things that actually occurred.
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/trades`);
}
