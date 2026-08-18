"use client";

import { isActionFailure } from "@/lib/errors/actionResult";
import { useState, useTransition } from "react";
import { simulateRoundAction, startPlayoffsAction } from "@/lib/actions/playoffs";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

type Phase = "regular-season" | "not-started" | "in-progress" | "complete";

export function PlayoffControls({
  leagueId,
  phase,
  pendingUserGame,
}: {
  leagueId: string;
  phase: Phase;
  pendingUserGame: { seriesId: string; gameNumber: number } | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  // `unknown` because it holds either a returned failure or a caught Error;
  // `ErrorNotice` accepts both.
  const [errorMessage, setErrorMessage] = useState<unknown>(null);

  function handleStart() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await startPlayoffsAction(leagueId);
        if (isActionFailure(result)) {
          setErrorMessage(result.error);
          return;
        }
        setMessage("Play-in tournament simulated. Round 1 matchups are set.");
      } catch (err) {
        setErrorMessage(err);
      }
    });
  }

  function handleSimulateRound() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await simulateRoundAction(leagueId);
        if (isActionFailure(result)) {
          setErrorMessage(result.error);
          return;
        }
        setMessage(
          result.champion
            ? "The championship series is decided - see the champion below."
            : result.seriesResults.length === 0
              ? "No other series left to simulate this round - play your own game above to continue."
              : `Round ${result.roundCompleted} complete. The bracket has advanced.`,
        );
      } catch (err) {
        setErrorMessage(err);
      }
    });
  }

  return (
    <div className="rounded-[2px] border border-rule bg-field p-6">
      {phase === "regular-season" && (
        <p className="text-sm text-ink-muted">
          Finish the regular season on the standings page before the playoffs can begin.
        </p>
      )}
      {phase === "not-started" && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleStart}
          className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Simulating play-in..." : "Start playoffs (simulate play-in)"}
        </button>
      )}
      {phase === "in-progress" && (
        <div className="flex flex-wrap items-center gap-3">
          {pendingUserGame && (
            // A plain anchor, not next/link - every game in a series shares
            // the same seriesId-scoped URL (see PostgameSummary's "Play next
            // game" link, fixed for the identical reason), so a client-side
            // Link risks the router cache serving a stale snapshot from an
            // earlier game in this same series instead of refetching fresh.
            <a
              href={`/leagues/${leagueId}/playoffs/live/${pendingUserGame.seriesId}`}
              className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90"
            >
              Play Game {pendingUserGame.gameNumber} &rarr;
            </a>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={handleSimulateRound}
            className={`rounded-[2px] px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
              pendingUserGame
                ? "border border-rule text-ink hover:bg-raised"
                : "bg-team-accent text-team-accent-ink hover:opacity-90"
            }`}
          >
            {isPending
              ? "Simulating..."
              : pendingUserGame
                ? "Simulate other series"
                : "Simulate next round"}
          </button>
        </div>
      )}
      {phase === "complete" && (
        <p className="text-sm text-ink-muted">The playoffs are complete for this season.</p>
      )}
      {message && <p className="mt-3 text-sm text-team-accent">{message}</p>}
      {errorMessage != null && (
        <div className="mt-3">
          <ErrorNotice error={errorMessage} />
        </div>
      )}
    </div>
  );
}
