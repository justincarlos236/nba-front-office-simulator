import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/** The homepage's session-aware primary CTA - shared by the hero and the closing banner so they never drift out of sync. */
export async function resolvePrimaryCta(): Promise<{ label: string; href: string }> {
  const session = await auth();
  if (!session?.user) return { label: "Start Your Franchise", href: "/sign-up" };

  const leagueCount = await prisma.league.count({ where: { ownerId: session.user.id } });
  return leagueCount > 0
    ? { label: "Continue Your Franchise", href: "/leagues" }
    : { label: "Start Your Franchise", href: "/leagues/new" };
}
