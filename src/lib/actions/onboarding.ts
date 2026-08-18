"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Marks the first-session tour finished for one franchise.
 *
 * Per league rather than per user, so a new save runs the tour again - see
 * `shouldAutoLaunchTour`. Scoped by `ownerId` so the update cannot touch a
 * league the caller does not own.
 *
 * Called for both "Done" and "Skip" - deliberately the same outcome. A tour you
 * have to escape twice is worse than no tour, and treating a skip as anything
 * less than completion is how onboarding becomes a thing players resent
 * (`docs/design/ONBOARDING_DESIGN.md`, principle 5).
 *
 * Idempotent: re-running it on an already-completed league is a harmless no-op
 * write, so a double-click or a replay ending cannot fail.
 */
export async function completeOnboardingAction(leagueId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  await prisma.league.updateMany({
    where: { id: leagueId, ownerId: session.user.id },
    data: { tourCompletedAt: new Date() },
  });
}
