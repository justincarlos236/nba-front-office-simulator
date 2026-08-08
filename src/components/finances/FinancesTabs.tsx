"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FINANCES_TABS } from "@/lib/finances/financesTabs";

/**
 * Like LeagueSubNav, every tab is always directly clickable - nothing is ever
 * hidden behind a disclosure. The Inbox tab carries a live count badge so a
 * pending decision stays visible from any tab in the section.
 */
export function FinancesTabs({
  leagueId,
  pendingDecisionCount,
}: {
  leagueId: string;
  pendingDecisionCount: number;
}) {
  const pathname = usePathname();
  const base = `/leagues/${leagueId}/finances`;

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-rule">
      {FINANCES_TABS.map((tab) => {
        const href = `${base}${tab.path}`;
        // The index route must match exactly, or it would light up on every
        // nested tab. Nested routes match their own subtree.
        const active = tab.path === "" ? pathname === href : pathname.startsWith(href);
        const showBadge = tab.id === "inbox" && pendingDecisionCount > 0;

        return (
          <Link
            key={tab.id}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              active
                ? "border-team-accent text-team-accent"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
            {showBadge && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-negative/15 px-1.5 text-xs font-bold text-negative tabular-nums">
                {pendingDecisionCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
