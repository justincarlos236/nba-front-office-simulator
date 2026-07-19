"use client";

import { useState, useTransition } from "react";
import { simulateRoundAction, startPlayoffsAction } from "@/lib/actions/playoffs";

type Phase = "regular-season" | "not-started" | "in-progress" | "complete";

export function PlayoffControls({ leagueId, phase }: { leagueId: string; phase: Phase }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleStart() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await startPlayoffsAction(leagueId);
        setMessage("Play-in tournament simulated. Round 1 matchups are set.");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  function handleSimulateRound() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await simulateRoundAction(leagueId);
        setMessage(
          result.champion
            ? "The championship series is decided - see the champion below."
            : `Round ${result.roundCompleted} complete. The bracket has advanced.`,
        );
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      {phase === "regular-season" && (
        <p className="text-sm text-muted">
          Finish the regular season on the standings page before the playoffs can begin.
        </p>
      )}
      {phase === "not-started" && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleStart}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Simulating play-in..." : "Start playoffs (simulate play-in)"}
        </button>
      )}
      {phase === "in-progress" && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleSimulateRound}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Simulating..." : "Simulate next round"}
        </button>
      )}
      {phase === "complete" && (
        <p className="text-sm text-muted">The playoffs are complete for this season.</p>
      )}
      {message && <p className="mt-3 text-sm text-accent">{message}</p>}
      {errorMessage && <p className="mt-3 text-sm text-red-400">{errorMessage}</p>}
    </div>
  );
}
