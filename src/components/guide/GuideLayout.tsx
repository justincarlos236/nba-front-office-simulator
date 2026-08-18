import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for every /guide article (Onboarding Philosophy Phase 1 -
 * see docs/design/ONBOARDING_DESIGN.md Part 4.1). One canonical home per concept:
 * this is what every `HowDoesThisWork` link and Action Center `reasoning`
 * ultimately resolves to.
 */
export function GuideLayout({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro: ReactNode;
  sections: [href: string, label: string][];
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl flex-1 px-6 py-16">
      <p className="text-xs text-ink-muted">
        <Link href="/guide" className="hover:text-ink">
          &larr; Guide
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-ink-muted">{intro}</p>
      {sections.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2 text-sm">
          {sections.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-rule px-3 py-1 text-ink transition hover:border-team-accent/40"
            >
              {label}
            </a>
          ))}
        </nav>
      )}

      {children}

      <p className="mt-12 text-xs text-ink-muted">
        <Link href="/leagues" className="hover:text-ink">
          &larr; Back to My Leagues
        </Link>
      </p>
    </main>
  );
}

export function GuideSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-ink-muted">{children}</div>
    </section>
  );
}
