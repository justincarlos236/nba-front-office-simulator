"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { advanceSeasonAction } from "@/lib/actions/offseason";

type Phase = "regular-season" | "playoffs-incomplete" | "draft-incomplete" | "ready";

export function OffseasonControls({
  leagueId,
  phase,
  nextSeasonLabel,
}: {
  leagueId: string;
  phase: Phase;
  nextSeasonLabel: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleAdvance() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const result = await advanceSeasonAction(leagueId);
        setMessage(
          result.retiredCount > 0
            ? `Welcome to the ${nextSeasonLabel} season. ${result.retiredCount} player${
                result.retiredCount > 1 ? "s" : ""
              } retired this offseason.`
            : `Welcome to the ${nextSeasonLabel} season.`,
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
          Finish the regular season on the standings page before the offseason can begin.
        </p>
      )}
      {phase === "playoffs-incomplete" && (
        <p className="text-sm text-muted">
          Crown a champion in the playoffs before advancing to the next season.
        </p>
      )}
      {phase === "draft-incomplete" && (
        <p className="text-sm text-muted">
          Finish the{" "}
          <Link href={`/leagues/${leagueId}/draft`} className="text-accent hover:underline">
            draft
          </Link>{" "}
          before advancing to the next season.
        </p>
      )}
      {phase === "ready" && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleAdvance}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Advancing..." : `Advance to the ${nextSeasonLabel} season`}
        </button>
      )}
      {message && <p className="mt-3 text-sm text-accent">{message}</p>}
      {errorMessage && <p className="mt-3 text-sm text-red-400">{errorMessage}</p>}
    </div>
  );
}
