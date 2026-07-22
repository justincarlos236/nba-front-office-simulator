"use client";

import { useState, useTransition } from "react";
import { simulateGamesAction, type SimulateTarget } from "@/lib/actions/simulation";

export function SimulateControls({
  leagueId,
  gamesRemaining,
}: {
  leagueId: string;
  gamesRemaining: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(gamesRemaining);

  function handleSimulate(target: SimulateTarget) {
    startTransition(async () => {
      const result = await simulateGamesAction(leagueId, target);
      setRemaining((r) => Math.max(0, r - result.userGamesCompleted));
      setLastResult(
        result.userGamesCompleted === 0
          ? "Season complete - no games left to simulate."
          : `Played ${result.userGamesCompleted} of your team's game${result.userGamesCompleted > 1 ? "s" : ""} (${result.simulated} league-wide).`,
      );
    });
  }

  const disabled = isPending || remaining === 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
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
