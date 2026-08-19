"use client";

import { useState, useTransition } from "react";
import { deleteLeagueAction } from "@/lib/actions/league";
import { isActionFailure } from "@/lib/errors/actionResult";
import { toUserFacingError } from "@/lib/errors/userFacing";

/**
 * Deleting a franchise destroys real save progress, so it asks first. A native
 * `window.confirm()` would do the job and reads jarringly against the rest of
 * the interface, hence an in-place step.
 *
 * **It confirms over the card, not beside it.** The first version laid the
 * question out horizontally in the card's top-right corner - "Delete the
 * Boston Celtics?" plus two buttons - which grew wide enough to sit across the
 * franchise name it was asking about. Covering the one piece of information
 * that identifies what is being destroyed is the worst possible place for that
 * strip to land.
 *
 * The card is small enough to be the dialog. Taking the whole surface means the
 * name can be stated plainly, the consequence gets a line of its own, and
 * nothing is obscured because nothing is competing.
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
  const [error, setError] = useState<unknown>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteLeagueAction(leagueId);
        if (isActionFailure(result)) setError(result.error);
      } catch (err) {
        if (err instanceof Error && err.message !== "NEXT_REDIRECT") setError(err);
      }
    });
  }

  if (confirming) {
    return (
      // Stops the click reaching the card's own link to the league.
      <div
        role="alertdialog"
        aria-label={`Delete ${franchiseName}`}
        className="absolute inset-0 z-20 flex flex-col justify-center gap-3 overflow-auto bg-ground/95 p-5"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div>
          <p className="text-[15px] leading-snug font-semibold text-ink">Delete {franchiseName}?</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Every season, trade and contract goes with it. This cannot be undone.
          </p>
        </div>

        {error != null && (
          <p className="text-sm leading-snug text-negative">{toUserFacingError(error).summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="rounded-[2px] bg-negative px-3 py-1.5 text-xs font-semibold text-ground transition hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Deleting..." : "Delete save"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            className="rounded-[2px] border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-raised disabled:opacity-50"
          >
            Keep it
          </button>
        </div>
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
      className="absolute top-3 right-3 z-10 rounded-[2px] border border-rule bg-field/80 p-1.5 text-ink-muted opacity-0 transition group-hover:opacity-100 hover:border-negative/40 hover:text-negative focus-visible:opacity-100"
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
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </button>
  );
}
