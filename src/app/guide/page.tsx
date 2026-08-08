import Link from "next/link";
import { GUIDE_ARTICLES } from "@/lib/guide/registry";

export const metadata = {
  title: "Guide | NBA Front Office Simulator",
};

export default function GuideIndexPage() {
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

      <p className="mt-12 text-xs text-ink-muted">
        <Link href="/leagues" className="hover:text-ink">
          &larr; Back to My Leagues
        </Link>
      </p>
    </main>
  );
}
