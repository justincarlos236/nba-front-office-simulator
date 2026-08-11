"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Marks the first-session tour finished for the signed-in user.
 *
 * Called for both "Done" and "Skip" - deliberately the same outcome. A tour
 * you have to escape twice is worse than no tour, and treating a skip as
 * anything other than completion is how onboarding becomes a thing players
 * resent (`docs/ONBOARDING_DESIGN.md`, principle 5).
 *
 * Idempotent: re-running it on an already-completed user is a harmless
 * no-op write, so a double-click or a replay ending cannot fail.
 */
export async function completeOnboardingAction(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) return;

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingCompletedAt: new Date() },
  });
}
