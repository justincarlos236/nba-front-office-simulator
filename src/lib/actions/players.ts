"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  loadLeaguePlayerProfile,
  loadReferencePlayerProfile,
  type PlayerProfileData,
  type PlayerProfileIdentity,
} from "@/lib/players/profileData";

/**
 * Fetches profile data for the player-profile drawer/page. Unlike most
 * actions in this app, this never redirects on failure - it's called
 * on-demand from a client-side overlay (`PlayerProfileProvider`) that
 * might be open on top of in-progress work (e.g. a half-built trade),
 * where an unexpected navigation away would be a real regression, not
 * just bad UX. Callers show an inline error instead.
 */
export async function getPlayerProfileAction(
  identity: PlayerProfileIdentity,
): Promise<PlayerProfileData | null> {
  if (identity.kind === "reference") {
    return loadReferencePlayerProfile(identity.playerId);
  }

  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");

  const league = await prisma.league.findUnique({
    where: { id: identity.leagueId },
    select: { ownerId: true },
  });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found.");
  }

  return loadLeaguePlayerProfile(identity.leagueId, identity.leaguePlayerId);
}
