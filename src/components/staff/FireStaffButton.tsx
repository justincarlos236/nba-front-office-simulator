"use client";

import { useState, useTransition } from "react";
import { fireStaffAction } from "@/lib/actions/staff";

export function FireStaffButton({ leagueId, staffId }: { leagueId: string; staffId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function handleFire() {
    setError(null);
    startTransition(async () => {
      try {
        await fireStaffAction({ leagueId, staffId });
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") {
          setError(err.message);
        }
      }
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-red-500/50 hover:text-red-400"
      >
        Fire
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Are you sure?</span>
        <button
          type="button"
          disabled={isPending}
          onClick={handleFire}
          className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/25 disabled:opacity-40"
        >
          {isPending ? "Firing..." : "Confirm fire"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
