import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const TYPE_LABEL: Record<string, string> = {
  TRADE: "Trade",
  SIGNING: "Signing",
  RETIREMENT: "Retirement",
  INJURY: "Injury",
  OWNERSHIP_MESSAGE: "Ownership",
  GAME_MILESTONE: "Milestone",
  WIN_STREAK: "Streak",
  GAME_RESULT: "Game",
};

const TYPE_BADGE_CLASS: Record<string, string> = {
  TRADE: "bg-accent/15 text-accent",
  SIGNING: "bg-emerald-500/15 text-emerald-400",
  RETIREMENT: "bg-muted/20 text-muted",
  INJURY: "bg-red-500/15 text-red-400",
  OWNERSHIP_MESSAGE: "bg-purple-500/15 text-purple-400",
  GAME_MILESTONE: "bg-sky-500/15 text-sky-400",
  WIN_STREAK: "bg-orange-500/15 text-orange-400",
  GAME_RESULT: "bg-yellow-500/15 text-yellow-400",
};

// Only BREAKING/MAJOR get a visual callout - MINOR/STANDARD read as the
// plain, routine feed this always was, so the important stuff actually
// stands out instead of everything competing for attention.
const IMPORTANCE_BORDER_CLASS: Record<string, string> = {
  BREAKING: "border-l-4 border-l-red-500",
  MAJOR: "border-l-4 border-l-orange-400",
};

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
        Every trade, free-agent signing, injury, and retirement across the league - including the
        other 29 teams&apos; own moves - most recent first.
      </p>

      {transactions.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">
            Nothing on the wire yet - make a move yourself, or simulate some games and let the rest
            of the league start making theirs.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {transactions.map((txn) => (
            <div
              key={txn.id}
              className={`flex items-start justify-between gap-4 rounded-lg border border-border bg-surface p-4 ${IMPORTANCE_BORDER_CLASS[txn.importance] ?? ""}`}
            >
              <p className="text-sm text-foreground">
                {txn.importance === "BREAKING" && (
                  <span className="mr-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold tracking-wide text-red-400 uppercase">
                    Breaking
                  </span>
                )}
                {txn.description}
              </p>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${TYPE_BADGE_CLASS[txn.type] ?? "bg-muted/20 text-muted"}`}
                >
                  {TYPE_LABEL[txn.type] ?? txn.type}
                </span>
                <span className="text-xs text-muted">
                  {txn.season}-{(txn.season + 1).toString().slice(-2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
