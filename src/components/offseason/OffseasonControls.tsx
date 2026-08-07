"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { advanceSeasonAction } from "@/lib/actions/offseason";
import type { LeaguePhase } from "@/lib/league/leaguePhase";

export function OffseasonControls({
  leagueId,
  phase,
  nextSeasonLabel,
}: {
  leagueId: string;
  phase: LeaguePhase;
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
      {phase === "pre-draft" && (
        <p className="text-sm text-muted">
          Scouting the class and running the draft lottery comes before advancing to the next season
          - head to the{" "}
          <Link href={`/leagues/${leagueId}/draft`} className="text-accent hover:underline">
            Draft page
          </Link>{" "}
          to scout prospects; the lottery is one click from there once you&apos;re ready.
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
