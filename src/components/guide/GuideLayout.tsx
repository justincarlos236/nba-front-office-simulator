import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shell for every /guide article (Onboarding Philosophy Phase 1 -
 * see docs/ONBOARDING_DESIGN.md Part 4.1). One canonical home per concept:
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
      <p className="text-xs text-muted">
        <Link href="/guide" className="hover:text-foreground">
          &larr; Guide
        </Link>
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-muted">{intro}</p>
      {sections.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2 text-sm">
          {sections.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-border px-3 py-1 text-foreground transition hover:border-accent/40"
            >
              {label}
            </a>
          ))}
        </nav>
      )}

      {children}

      <p className="mt-12 text-xs text-muted">
        <Link href="/leagues" className="hover:text-foreground">
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
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-muted">{children}</div>
    </section>
  );
}
