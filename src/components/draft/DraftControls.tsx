"use client";

import { useState, useTransition } from "react";
import { advanceDraftAction, makeDraftPickAction, startDraftAction } from "@/lib/actions/draft";

export type DraftPhase =
  "regular-season" | "playoffs-incomplete" | "not-started" | "user-turn" | "cpu-turn" | "complete";

export interface AvailableProspect {
  id: string;
  fullName: string;
  position: string;
  age: number;
  overallRating: number;
  potentialRating: number;
}

export function DraftControls({
  leagueId,
  phase,
  onClockPickNumber,
  availableProspects,
}: {
  leagueId: string;
  phase: DraftPhase;
  onClockPickNumber: number | null;
  availableProspects: AvailableProspect[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleStart() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await startDraftAction(leagueId);
        setMessage("The lottery is in and the draft class is set.");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleAdvance() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await advanceDraftAction(leagueId);
        setMessage(
          result.done && result.resolved === 0
            ? "The draft is complete."
            : `Resolved ${result.resolved} pick${result.resolved === 1 ? "" : "s"}.`,
        );
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleDraft(prospectId: string, fullName: string) {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await makeDraftPickAction(leagueId, prospectId);
        setMessage(`You selected ${fullName}.`);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      {phase === "regular-season" && (
        <p className="text-sm text-muted">
          Finish the regular season on the standings page before the draft.
        </p>
      )}
      {phase === "playoffs-incomplete" && (
        <p className="text-sm text-muted">Crown a champion in the playoffs before the draft.</p>
      )}
      {phase === "not-started" && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleStart}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Running the lottery..." : "Start the draft"}
        </button>
      )}
      {phase === "cpu-turn" && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleAdvance}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Simulating..." : "Simulate to your next pick"}
        </button>
      )}
      {phase === "user-turn" && (
        <div>
          <p className="text-sm font-semibold text-foreground">
            You&apos;re on the clock - pick {onClockPickNumber}.
          </p>
          <div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {availableProspects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{p.fullName}</p>
                  <p className="text-xs text-muted">
                    {p.position} &middot; Age {p.age} &middot; Rating {p.overallRating} &middot;
                    Potential {p.potentialRating}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDraft(p.id, p.fullName)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Draft
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {phase === "complete" && (
        <p className="text-sm text-muted">The draft is complete for this season.</p>
      )}
      {message && <p className="mt-3 text-sm text-accent">{message}</p>}
      {errorMessage && <p className="mt-3 text-sm text-red-400">{errorMessage}</p>}
    </div>
  );
}
