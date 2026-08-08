import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FinancesTabs } from "@/components/finances/FinancesTabs";
import { countPendingDecisions } from "@/lib/finances/financesPageData";

export const dynamic = "force-dynamic";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Shared chrome for the whole finances section: the tab bar, with its live
 * inbox badge, sits here so it's fetched once and stays put across every tab
 * navigation instead of re-querying (and re-flashing) per page.
 */
export default async function FinancesLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) notFound();

  const pendingDecisionCount = await countPendingDecisions(league.id, myLeagueTeamId);

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Finances</h1>
      <div className="mt-6">
        <FinancesTabs leagueId={league.id} pendingDecisionCount={pendingDecisionCount} />
      </div>
      <div className="py-8">{children}</div>
    </main>
  );
}
