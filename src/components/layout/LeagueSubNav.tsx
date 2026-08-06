"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavSection } from "@/lib/league/subNavSections";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Every section is always directly clickable, whether it's "primary" or
 * "secondary" for the league's current phase - only the visual weight
 * differs (bordered pill vs. plain muted text). An earlier version hid
 * secondary sections behind a collapsed disclosure, but that turned "one
 * click away" into "invisible until you find More first," which broke
 * several e2e flows that click a section directly (e.g. Free Agents mid-
 * offseason) - the same friction a real user would hit. Never hard-hide a
 * whole section; only de-emphasize it.
 */
export function LeagueSubNav({
  leagueId,
  primary,
  secondary,
}: {
  leagueId: string;
  primary: NavSection[];
  secondary: NavSection[];
}) {
  const pathname = usePathname();
  const base = `/leagues/${leagueId}`;

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {primary.map((section) => {
          const href = `${base}${section.path}`;
          const active = isActive(pathname, href);
          return (
            <Link
              key={section.id}
              href={href}
              prefetch={false}
              className={`rounded-lg border px-3 py-1.5 font-semibold transition ${
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-foreground hover:bg-surface"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </div>

      {secondary.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {secondary.map((section) => {
            const href = `${base}${section.path}`;
            const active = isActive(pathname, href);
            return (
              <Link
                key={section.id}
                href={href}
                prefetch={false}
                className={`transition ${active ? "font-semibold text-accent" : "text-muted hover:text-foreground"}`}
              >
                {section.label}
              </Link>
            );
          })}
        </div>
      )}

      <Link
        href={`${base}/trades/new`}
        prefetch={false}
        className="ml-auto rounded-lg bg-accent px-3 py-1.5 font-semibold text-black transition hover:opacity-90"
      >
        Propose a trade
      </Link>
    </nav>
  );
}
