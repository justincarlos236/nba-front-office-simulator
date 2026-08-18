"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroup, NavSection } from "@/lib/league/subNavSections";
import {
  IconJersey,
  IconSeason,
  IconStandings,
  IconTrophy,
  type IconProps,
} from "@/components/ui/icons";
import type { AttentionCounts } from "@/lib/league/attention";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Glyphs for the four sections a user reaches for by reflex.
 *
 * Keyed by section id and deliberately partial - a section with no entry
 * renders exactly as it did before. Icons everywhere would flatten the row
 * back into undifferentiated noise and read as a generic admin dashboard,
 * which is the opposite of the point: these four are the ones worth finding
 * without reading.
 *
 * `IconSeason` and `IconTrophy` were already in the set. Standings and roster
 * needed drawing, in the same hand.
 */
const SECTION_ICON: Partial<Record<string, (props: IconProps) => React.ReactElement>> = {
  rotation: IconJersey,
  schedule: IconSeason,
  standings: IconStandings,
  playoffs: IconTrophy,
};

/**
 * Smaller than the set's 16px default and held below the label.
 *
 * The label is 11px, so a 16px glyph would outweigh the word it qualifies.
 * Colour is never set here: the icons draw in `currentColor`, so the active
 * and hover rules on the link already move icon and text as one. Only the
 * emphasis is separate, and it resolves in the same direction.
 */
const ICON_SIZE = 12;

/**
 * Every section is always directly clickable, whether it's "primary" for the
 * league's current phase or sits in a drawer - only the visual weight differs.
 * An earlier version hid secondary sections behind a collapsed disclosure, but
 * that turned "one click away" into "invisible until you find More first,"
 * which broke several e2e flows that click a section directly. Never hard-hide
 * a whole section; only de-emphasize it.
 *
 * THE WIRE: the secondary tier is now grouped (Team / League / Business)
 * rather than a flat 9-10 item muted row, and any section with pending work
 * carries a count - previously the product had exactly one badge, inside the
 * section it described.
 */
export function LeagueSubNav({
  leagueId,
  primary,
  groups,
  primaryAction,
  attention = {},
}: {
  leagueId: string;
  primary: NavSection[];
  groups: NavGroup[];
  /** The one loud action, chosen by phase rather than always "Propose a trade". */
  primaryAction: { label: string; path: string };
  attention?: AttentionCounts;
}) {
  const pathname = usePathname();
  const base = `/leagues/${leagueId}`;

  function Count({ n }: { n: number }) {
    return <span className="ml-1.5 font-mono text-[11px] tabular-nums text-team-accent">{n}</span>;
  }

  return (
    <nav className="flex flex-col gap-3 pb-3">
      {/* Primary: what this phase is about. */}
      <div className="flex flex-wrap items-center gap-2">
        {primary.map((section) => {
          const href = `${base}${section.path}`;
          const active = isActive(pathname, href);
          const count = attention[section.id as keyof AttentionCounts];
          return (
            <Link
              key={section.id}
              href={href}
              prefetch={false}
              className={`group inline-flex items-center gap-1.5 rounded-[2px] border px-3 py-1.5 text-[11px] font-semibold tracking-[0.09em] uppercase transition-colors duration-120 ${
                active
                  ? "border-team-accent bg-team-accent text-team-accent-ink"
                  : "border-rule text-ink hover:bg-raised"
              }`}
            >
              {(() => {
                const SectionIcon = SECTION_ICON[section.id];
                return SectionIcon ? (
                  <SectionIcon
                    size={ICON_SIZE}
                    className={`shrink-0 transition-opacity duration-120 ${
                      active ? "opacity-100" : "opacity-60 group-hover:opacity-100"
                    }`}
                  />
                ) : null;
              })()}
              {section.label}
              {!active && count ? <Count n={count} /> : null}
            </Link>
          );
        })}

        <Link
          href={`${base}${primaryAction.path}`}
          prefetch={false}
          className="ml-auto rounded-[2px] border border-rule px-3 py-1.5 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase transition-colors duration-120 hover:bg-raised"
        >
          {primaryAction.label}
        </Link>
      </div>

      {/* Secondary: grouped drawers, so 10 links read as three ideas. */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {groups
          .filter((group) => group.sections.length > 0)
          .map((group) => (
            <div key={group.id} className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-[11px] font-semibold tracking-[0.09em] text-rule uppercase">
                {group.label}
              </span>
              {group.sections.map((section) => {
                const href = `${base}${section.path}`;
                const active = isActive(pathname, href);
                const count = attention[section.id as keyof AttentionCounts];
                return (
                  <Link
                    key={section.id}
                    href={href}
                    prefetch={false}
                    className={`text-[15px] transition-colors duration-120 ${
                      active ? "font-semibold text-team-accent" : "text-ink-muted hover:text-ink"
                    }`}
                  >
                    {section.label}
                    {!active && count ? <Count n={count} /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
      </div>
    </nav>
  );
}
