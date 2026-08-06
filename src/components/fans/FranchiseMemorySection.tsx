/**
 * Fans Page Redesign (Phase 5), Section 5 - "Franchise Memory"
 * (docs/FANS_PAGE_REDESIGN.md Part 3.5). The short, permanent list of
 * moments this fanbase will not forget. What makes a 20-season save's
 * fanbase feel different from a fresh one.
 */

export interface MemoryItem {
  id: string;
  season: number;
  description: string;
}

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
}

export function FranchiseMemorySection({ memories }: { memories: MemoryItem[] }) {
  if (memories.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Franchise Memory</h2>
        <div className="mt-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted">
          This franchise hasn&apos;t made history yet - the defining moments will show up here as
          they happen.
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">Franchise Memory</h2>
      <p className="mt-1 text-sm text-muted">
        The moments this fanbase will not forget - the permanent record.
      </p>
      <div className="mt-4 space-y-2">
        {memories.map((m) => (
          <div
            key={m.id}
            className="flex items-baseline gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
              {seasonLabel(m.season)}
            </span>
            <span className="text-sm text-foreground">{m.description}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
