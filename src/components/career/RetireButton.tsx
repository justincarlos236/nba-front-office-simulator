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
        className="text-xs text-ink-muted underline transition hover:text-ink"
      >
        Retire as GM
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-[2px] border border-rule bg-raised p-3">
      <p className="text-sm text-ink">
        Retire and end this franchise for good? It becomes a permanent, read-only record and can
        never be played again. Your career reputation is kept.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => retireFromLeagueAction(leagueId))}
          className="rounded-[2px] bg-negative/90 px-3 py-1.5 text-sm font-semibold text-ground transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Retiring..." : "Confirm retirement"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="rounded-[2px] border border-rule px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
