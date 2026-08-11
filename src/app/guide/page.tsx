import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GUIDE_ARTICLES } from "@/lib/guide/registry";

export const metadata = {
  title: "Guide | NBA Front Office Simulator",
};

export default async function GuideIndexPage() {
  // The replay entry for the first-session tour. It needs a live franchise to
  // walk through, so it points at the most recent playable save and is simply
  // absent when there is none - a dead "replay" link would be worse than no
  // link. `?tour=1` is read by <Tour> in the league layout.
  const session = await auth();
  const replayLeague = session?.user?.id
    ? await prisma.league.findFirst({
        where: { ownerId: session.user.id, endedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      })
    : null;

  return (
    <main className="mx-auto max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Guide</h1>
      <p className="mt-2 text-ink-muted">
        Plain-English explanations of how the simulator works - no NBA front-office experience
        required. You&apos;ll also find these linked directly from the page or moment they explain.
      </p>

      <div className="mt-8 space-y-3">
        {GUIDE_ARTICLES.map((article) => (
          <Link
            key={article.slug}
            href={`/guide/${article.slug}`}
            className="block rounded-[2px] border border-rule bg-field p-5 transition hover:border-team-accent/40 hover:bg-raised"
          >
            <h2 className="font-semibold text-ink">{article.title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{article.summary}</p>
          </Link>
        ))}
      </div>

      {replayLeague && (
        <div className="mt-8 border-t border-rule pt-6">
          <h2 className="font-semibold text-ink">New to this?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            A two-minute walkthrough of the dashboard, your rotation, and how a season actually gets
            played.
          </p>
          <Link
            href={`/leagues/${replayLeague.id}?tour=1`}
            className="mt-3 inline-block rounded-[2px] border border-rule bg-raised px-3 py-1.5 text-sm font-medium text-ink transition hover:border-team-accent"
          >
            Replay the tour
          </Link>
        </div>
      )}

      <p className="mt-12 text-xs text-ink-muted">
        <Link href="/leagues" className="hover:text-ink">
          &larr; Back to My Leagues
        </Link>
      </p>
    </main>
  );
}
