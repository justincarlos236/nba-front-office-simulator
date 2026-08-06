import Link from "next/link";
import { GUIDE_ARTICLES } from "@/lib/guide/registry";

export const metadata = {
  title: "Guide | NBA Front Office Simulator",
};

export default function GuideIndexPage() {
  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Guide</h1>
      <p className="mt-2 text-muted">
        Plain-English explanations of how the simulator works - no NBA front-office experience
        required. You&apos;ll also find these linked directly from the page or moment they explain.
      </p>

      <div className="mt-8 space-y-3">
        {GUIDE_ARTICLES.map((article) => (
          <Link
            key={article.slug}
            href={`/guide/${article.slug}`}
            className="block rounded-xl border border-border bg-surface p-5 transition hover:border-accent/40 hover:bg-surface-2"
          >
            <h2 className="font-semibold text-foreground">{article.title}</h2>
            <p className="mt-1 text-sm text-muted">{article.summary}</p>
          </Link>
        ))}
      </div>

      <p className="mt-12 text-xs text-muted">
        <Link href="/leagues" className="hover:text-foreground">
          &larr; Back to My Leagues
        </Link>
      </p>
    </main>
  );
}
