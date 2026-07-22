"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { simulateGamesAction, type SimulateTarget } from "@/lib/actions/simulation";

export function SimulateControls({
  leagueId,
  gamesRemaining,
  allStarWeekendPending = false,
}: {
  leagueId: string;
  gamesRemaining: number;
  /** A PENDING AllStarWeekend already exists for the current season - mirrors the server-side block in simulateGamesAction so buttons don't invite a click that will just no-op. */
  allStarWeekendPending?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(gamesRemaining);
  const [weekendPending, setWeekendPending] = useState(allStarWeekendPending);

  function handleSimulate(target: SimulateTarget) {
    startTransition(async () => {
      const result = await simulateGamesAction(leagueId, target);
      setRemaining((r) => Math.max(0, r - result.userGamesCompleted));
      if (result.allStarWeekendTriggered) {
        setWeekendPending(true);
        setLastResult(
          result.userGamesCompleted > 0
            ? `Played ${result.userGamesCompleted} of your team's game${result.userGamesCompleted > 1 ? "s" : ""} before reaching the All-Star break.`
            : "The All-Star break is here - resolve the weekend to keep simulating.",
        );
        return;
      }
      setLastResult(
        result.userGamesCompleted === 0
          ? "Season complete - no games left to simulate."
          : `Played ${result.userGamesCompleted} of your team's game${result.userGamesCompleted > 1 ? "s" : ""} (${result.simulated} league-wide).`,
      );
    });
  }

  const disabled = isPending || remaining === 0 || weekendPending;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      {weekendPending && (
        <div className="mb-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm">
          <span className="text-foreground">All-Star Weekend has arrived.</span>{" "}
          <Link href={`/leagues/${leagueId}/all-star`} className="text-accent hover:underline">
            View the weekend
          </Link>{" "}
          <span className="text-muted">to continue the season.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSimulate("NEXT_GAME")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Simulating..." : "Sim next game"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSimulate("NEXT_10_GAMES")}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Simulating..." : "Sim next 10 games"}
        </button>
        <span className="text-sm text-muted">{remaining} games remaining on your schedule</span>
      </div>
      {lastResult && <p className="mt-3 text-sm text-accent">{lastResult}</p>}
    </div>
  );
}
