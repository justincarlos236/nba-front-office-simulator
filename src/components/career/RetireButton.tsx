"use client";

import { useState, useTransition } from "react";
import { retireFromLeagueAction } from "@/lib/actions/careerActions";

export function RetireButton({ leagueId }: { leagueId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-muted underline transition hover:text-foreground"
      >
        Retire as GM
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-sm text-foreground">
        Retire and end this franchise for good? It becomes a permanent, read-only record and can
        never be played again. Your career reputation is kept.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => retireFromLeagueAction(leagueId))}
          className="rounded-lg bg-red-500/90 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
        >
          {isPending ? "Retiring..." : "Confirm retirement"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
