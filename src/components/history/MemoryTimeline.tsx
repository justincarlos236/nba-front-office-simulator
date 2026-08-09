import { Label } from "@/components/ui/primitives";
import type { FranchiseMemoryEntry } from "@/lib/fans/franchiseMemory";

/**
 * THE WIRE - Record. The franchise's defining moments, on a spine.
 *
 * `curateFranchiseMemory` already does the hard part: it is a deliberate
 * allowlist rather than every BREAKING row, so a routine major signing never
 * sits beside a championship. That curation was rendering as a bulleted list,
 * which is the one shape that makes a fifteen-season history look like eight
 * unrelated sentences.
 *
 * A timeline is the honest shape for it. The spine carries the years; a
 * heavier moment gets a heavier mark, using the weight the curation already
 * assigns rather than a new one.
 */
export function MemoryTimeline({
  entries,
  className = "",
}: {
  /** Newest first, as `curateFranchiseMemory` returns them. */
  entries: FranchiseMemoryEntry[];
  className?: string;
}) {
  if (entries.length === 0) return null;

  // The curation weights BREAKING above MAJOR; the heaviest moments in this
  // franchise's own history get the accent, rather than a fixed threshold
  // that would light up every entry on a dramatic save and none on a quiet one.
  const heaviest = Math.max(...entries.map((e) => e.weight));

  return (
    <section className={className}>
      <div className="border-b border-rule-strong pb-3">
        <Label tone="ink">Franchise memory</Label>
      </div>

      <ol className="mt-6">
        {entries.map((entry) => {
          const defining = entry.weight >= heaviest;
          return (
            <li key={entry.id} className="flex gap-5">
              {/* The spine. A continuous rule through the whole history, with
                  each moment marked on it. */}
              <div className="flex w-16 shrink-0 flex-col items-end">
                <span
                  className={`font-mono text-[15px] tabular-nums ${
                    defining ? "text-team-accent" : "text-ink-muted"
                  }`}
                >
                  {entry.season}
                </span>
              </div>

              <div className="relative flex flex-col items-center">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 ${
                    defining ? "bg-team-accent" : "border border-rule bg-ground"
                  }`}
                  aria-hidden="true"
                />
                <span className="w-px flex-1 bg-hairline" aria-hidden="true" />
              </div>

              <p
                className={`min-w-0 flex-1 pb-8 leading-relaxed ${
                  defining
                    ? "text-[clamp(1rem,1.6vw,1.125rem)] font-medium text-ink"
                    : "text-[15px] text-ink-muted"
                }`}
              >
                {entry.description}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
