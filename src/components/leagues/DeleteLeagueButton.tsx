"use client";

import { useState, useTransition } from "react";
import { deleteLeagueAction } from "@/lib/actions/league";

/**
 * Deleting a franchise is permanent and destroys real save progress, so
 * this requires an explicit inline confirmation step rather than firing
 * on the first click - a native `window.confirm()` would work but reads
 * jarringly inconsistent against the rest of this app's custom UI.
 */
export function DeleteLeagueButton({
  leagueId,
  franchiseName,
}: {
  leagueId: string;
  franchiseName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteLeagueAction(leagueId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  if (confirming) {
    return (
      <div
        className="absolute top-3 right-3 z-10 flex items-center gap-2 rounded-[2px] border border-negative/40 bg-field p-2 text-xs"
        onClick={(e) => e.preventDefault()}
      >
        {error ? (
          <span className="text-negative">{error}</span>
        ) : (
          <>
            <span className="text-ink-muted">Delete {franchiseName}?</span>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDelete}
              className="rounded-[2px] bg-negative/90 px-2 py-1 font-semibold text-ground transition hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming(false)}
              className="rounded-[2px] border border-rule px-2 py-1 text-ink transition hover:bg-raised"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        setConfirming(true);
      }}
      aria-label={`Delete ${franchiseName}`}
      className="absolute top-3 right-3 z-10 rounded-[2px] border border-rule bg-field/80 p-1.5 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:border-negative/40 hover:text-negative"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  );
}
