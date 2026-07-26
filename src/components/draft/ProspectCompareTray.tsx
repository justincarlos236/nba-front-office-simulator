"use client";

import type { DraftProspectInfo } from "./types";

export function ProspectCompareTray({
  selectedProspects,
  onRemove,
  onClear,
  onCompare,
}: {
  selectedProspects: DraftProspectInfo[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onCompare: () => void;
}) {
  if (selectedProspects.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 py-3 shadow-xl backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <span className="text-xs font-semibold tracking-wide text-muted uppercase">Comparing</span>
        {selectedProspects.map((p) => (
          <span
            key={p.id}
            className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-foreground"
          >
            {p.fullName}
            <button
              type="button"
              onClick={() => onRemove(p.id)}
              aria-label={`Remove ${p.fullName} from comparison`}
              className="text-muted transition hover:text-foreground"
            >
              ✕
            </button>
          </span>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-muted transition hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={selectedProspects.length < 2}
            onClick={onCompare}
            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compare ({selectedProspects.length})
          </button>
        </div>
      </div>
    </div>
  );
}
