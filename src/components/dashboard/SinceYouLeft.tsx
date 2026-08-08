import Link from "next/link";
import { Label } from "@/components/ui/primitives";
import type { SaveContinuity } from "@/lib/league/saveContinuity";

/**
 * The dispatch: what happened in the league while the user was away.
 *
 * The audit's returning-player finding was that a five-day absence looked
 * identical to a five-minute one - the Action Center answers "what should I
 * do" but structurally cannot answer "what changed", because it reads current
 * state rather than a diff. This reads the diff, against the `lastSeenAt`
 * boundary added in the continuity migration.
 *
 * Renders nothing on a first visit or when genuinely nothing happened, rather
 * than showing an empty shell - a dispatch with no news is noise.
 */
export function SinceYouLeft({
  continuity,
  leagueId,
}: {
  continuity: SaveContinuity;
  leagueId: string;
}) {
  if (continuity.since.length === 0) return null;

  const { daysAway } = continuity;
  const window =
    daysAway === null
      ? "Since your last session"
      : daysAway <= 0
        ? "Since earlier today"
        : daysAway === 1
          ? "Since yesterday"
          : `While you were away · ${daysAway} days`;

  return (
    <section className="border-t border-rule bg-field p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Label>{window}</Label>
        <Link
          href={`/leagues/${leagueId}/transactions`}
          className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
        >
          {continuity.unreadCount > 0 ? `${continuity.unreadCount} unread` : "Full wire"}
        </Link>
      </div>

      <ul className="mt-4 space-y-0">
        {continuity.since.map((row) => (
          <li
            key={row.id}
            className="flex items-baseline gap-4 border-b border-hairline py-2.5 last:border-b-0"
          >
            <span
              className={`shrink-0 text-[11px] font-semibold tracking-[0.09em] uppercase ${
                row.importance === "BREAKING" ? "text-signal-red" : "text-ink-muted"
              }`}
            >
              {row.importance === "BREAKING" ? "Breaking" : "Wire"}
            </span>
            <p className="text-[15px] leading-snug text-ink">{row.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
