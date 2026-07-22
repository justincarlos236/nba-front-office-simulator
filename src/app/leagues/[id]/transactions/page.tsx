import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewsFeed } from "@/components/news/NewsFeed";

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
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
            &larr; Back to team
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            Transactions &amp; News
          </h1>
        </div>
        <Link
          href={`/leagues/${league.id}/history`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
        >
          League history
        </Link>
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Every trade, signing, injury, retirement, award, and real on-court moment across the league
        - including the other 29 teams&apos; own - most recent first. Filter by category, your own
        team, or search the text directly.
      </p>

      {transactions.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            Nothing on the wire yet - make a move yourself, or simulate some games and let the rest
            of the league start making theirs.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <NewsFeed transactions={transactions} userTeamId={league.userControlledTeamId} />
        </div>
      )}
    </main>
  );
}
