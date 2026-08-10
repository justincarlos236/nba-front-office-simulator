import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewsFeed } from "@/components/news/NewsFeed";
import { Label } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TransactionsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const transactions = await prisma.leagueTransaction.findMany({
    where: { leagueId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    // Ledger container - the wire needs the width the old max-w-4xl denied it,
    // which is what left the right side of this page empty.
    <main className="mx-auto max-w-350 flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <div className="border-b border-rule-strong pb-6">
        <Label tone="accent">The wire</Label>
        <h1 className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
          Transactions &amp; News
        </h1>
        <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-ink-muted">
          Every trade, signing, injury, retirement, award, and real on-court moment across the
          league - including the other 29 teams&apos; own. The biggest stories lead; everything else
          stays filed below, in the order it happened.
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="mt-10 rounded-[2px] border border-rule bg-field p-8 text-center">
          <p className="text-ink-muted">
            Nothing on the wire yet - make a move yourself, or simulate some games and let the rest
            of the league start making theirs.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <NewsFeed
            transactions={transactions}
            userTeamId={league.userControlledTeamId}
            leagueId={league.id}
          />
        </div>
      )}
    </main>
  );
}
