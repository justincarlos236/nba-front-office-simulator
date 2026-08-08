"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { advanceSeasonAction } from "@/lib/actions/offseason";
import type { LeaguePhase } from "@/lib/league/leaguePhase";
import type { JobSecurityLevel } from "@/lib/gm/jobSecurity";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

export function OffseasonControls({
  leagueId,
  phase,
  nextSeasonLabel,
  ownerConfidence,
  jobSecurityLevel,
}: {
  leagueId: string;
  phase: LeaguePhase;
  nextSeasonLabel: string;
  /** Current owner confidence (0-100). At the floor, advancing ends the tenure. */
  ownerConfidence: number;
  jobSecurityLevel: JobSecurityLevel;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /**
   * Advancing is the only mid-play action that can permanently end the save:
   * `advanceSeasonAction` fires the GM when owner confidence is at the floor,
   * which writes a permanent CareerRecord and sets `league.endedAt` (after
   * which the whole league is read-only). Firing is a deliberate, earned
   * endpoint - it takes several bad seasons to get here - so this doesn't
   * block it. It just refuses to let it happen as a surprise: at CRITICAL the
   * button asks once and names the stake first.
   */
  const atRiskOfFiring = jobSecurityLevel === "CRITICAL";

  function handleAdvance() {
    setErrorMessage(null);
    setConfirming(false);
    startTransition(async () => {
      try {
        const result = await advanceSeasonAction(leagueId);
        // The action reports the tenure ending. It already revalidated this
        // route, and the league layout swaps every sub-page for the career
        // recap once `league.endedAt` is set - so the correct behaviour is to
        // show nothing here and let that recap be the thing the user sees.
        // Printing "Welcome to the next season" (the old behaviour) announced
        // a new season at the exact moment the franchise ended.
        if (result.fired) {
          setMessage(null);
          return;
        }
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
    <div className="rounded-[2px] border border-rule bg-field p-6">
      {phase === "regular-season" && (
        <p className="text-sm text-ink-muted">
          Finish the regular season on the standings page before the offseason can begin.
        </p>
      )}
      {phase === "playoffs-incomplete" && (
        <p className="text-sm text-ink-muted">
          Crown a champion in the playoffs before advancing to the next season.
        </p>
      )}
      {phase === "pre-draft" && (
        <p className="text-sm text-ink-muted">
          Scouting the class and running the draft lottery comes before advancing to the next season
          - head to the{" "}
          <Link href={`/leagues/${leagueId}/draft`} className="text-team-accent hover:underline">
            Draft page
          </Link>{" "}
          to scout prospects; the lottery is one click from there once you&apos;re ready.
        </p>
      )}
      {phase === "draft-incomplete" && (
        <p className="text-sm text-ink-muted">
          Finish the{" "}
          <Link href={`/leagues/${leagueId}/draft`} className="text-team-accent hover:underline">
            draft
          </Link>{" "}
          before advancing to the next season.
        </p>
      )}
      {phase === "ready" && !confirming && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => (atRiskOfFiring ? setConfirming(true) : handleAdvance())}
          className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Advancing..." : `Advance to the ${nextSeasonLabel} season`}
        </button>
      )}

      {phase === "ready" && confirming && (
        <div>
          <p className="text-sm font-semibold text-ink">
            Ownership has seen enough. Your job may not survive this.
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Owner confidence is at {ownerConfidence}. If it stays at the floor when the season turns
            over, you are fired: the tenure is recorded permanently, your GM reputation moves, and
            this save becomes a read-only career recap. It cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={handleAdvance}
              className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Advancing..." : "Advance anyway"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming(false)}
              className="rounded-[2px] border border-rule px-4 py-2 text-sm font-semibold text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              Not yet
            </button>
          </div>
        </div>
      )}
      {message && <p className="mt-3 text-sm text-team-accent">{message}</p>}
      {errorMessage && (
        <div className="mt-3">
          <ErrorNotice error={errorMessage} />
        </div>
      )}
    </div>
  );
}
