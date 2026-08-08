import Link from "next/link";
import { Label } from "@/components/ui/primitives";

/**
 * THE WIRE - your last ten, as a form line.
 *
 * The dashboard's decision column held two blocks against a five-fact rail,
 * which is why it read as empty no matter how the container was stretched.
 * The imbalance was in content, not padding: the surface had nothing to say
 * about the thing a GM actually glances at first, which is how the team is
 * playing right now.
 *
 * This is the standard form strip every real standings table carries - W/L
 * squares, most recent last - plus the margin, so a run of one-point wins
 * reads differently from a run of blowouts. All of it from games already
 * played; nothing here is new simulation state.
 */

export interface FormGame {
  id: string;
  won: boolean;
  /** Positive when the user's team won by that many. */
  margin: number;
  opponentAbbreviation: string;
  home: boolean;
}

export function FormLine({
  games,
  leagueId,
  className = "",
}: {
  /** Oldest first; the strip reads left to right into the present. */
  games: FormGame[];
  leagueId: string;
  className?: string;
}) {
  if (games.length === 0) return null;

  const wins = games.filter((g) => g.won).length;

  return (
    <section className={`border-t border-rule bg-field p-6 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Label>Recent form</Label>
        <Link
          href={`/leagues/${leagueId}/schedule`}
          className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
        >
          Full schedule
        </Link>
      </div>

      <p className="mt-3 font-mono text-[clamp(1.5rem,3vw,2rem)] leading-none font-medium tracking-[-0.03em] text-ink tabular-nums">
        {wins}&ndash;{games.length - wins}
        <span className="ml-3 font-sans text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
          last {games.length}
        </span>
      </p>

      {/* The strip. Height carries margin, so a run of narrow wins looks
          different from a run of blowouts without adding a second chart. */}
      <div className="mt-4 flex items-end gap-1">
        {games.map((g) => {
          const magnitude = Math.min(Math.abs(g.margin), 25);
          const height = 14 + Math.round((magnitude / 25) * 26);
          return (
            <div
              key={g.id}
              title={`${g.won ? "W" : "L"} by ${Math.abs(g.margin)} ${
                g.home ? "vs" : "at"
              } ${g.opponentAbbreviation}`}
              style={{ height: `${height}px` }}
              className={`min-w-0 flex-1 border-t-2 ${
                g.won ? "border-positive bg-positive/20" : "border-negative bg-negative/20"
              }`}
            />
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[11px] tracking-[0.09em] text-ink-muted uppercase">
        <span>Older</span>
        <span>Latest</span>
      </div>
    </section>
  );
}
