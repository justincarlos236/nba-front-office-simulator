"use client";

import { useState, useTransition } from "react";
import { simulateGamesAction, type SimulateBatchSize } from "@/lib/actions/simulation";

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

  function handleSimulate(batchSize: SimulateBatchSize) {
    startTransition(async () => {
      const result = await simulateGamesAction(leagueId, batchSize);
      setRemaining(result.remaining);
      setLastResult(
        result.simulated === 0
          ? "Season complete - no games left to simulate."
          : `Simulated ${result.simulated} game${result.simulated > 1 ? "s" : ""}. ${result.remaining} remaining.`,
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
          onClick={() => handleSimulate(1)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Simulate next game
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSimulate(10)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Simulate next 10
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => handleSimulate(50)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Simulate next 50
        </button>
        <span className="text-sm text-muted">
          {remaining} games remaining league-wide this season
        </span>
      </div>
      {lastResult && <p className="mt-3 text-sm text-accent">{lastResult}</p>}
      {isPending && <p className="mt-3 text-sm text-muted">Simulating...</p>}
    </div>
  );
}
