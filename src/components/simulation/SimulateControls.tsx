"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { simulateGamesAction, type SimulateTarget } from "@/lib/actions/simulation";
import { Button, Label } from "@/components/ui/primitives";

/**
 * Advancing time - the main verb of a season simulator.
 *
 * The audit found this lived only on Standings and Schedule: two clicks from
 * the page a returning player lands on, discoverable through an Action Center
 * hint that deleted itself after the first game ever simulated. It now also
 * renders on the dashboard, next to "what needs you".
 */
export function SimulateControls({
  leagueId,
  gamesRemaining,
  allStarWeekendPending = false,
  businessDecisionPending = false,
}: {
  leagueId: string;
  gamesRemaining: number;
  /** A PENDING AllStarWeekend already exists for the current season - mirrors the server-side block in simulateGamesAction so buttons don't invite a click that will just no-op. */
  allStarWeekendPending?: boolean;
  /** A BREAKING BusinessDecision already sits PENDING - mirrors simulateGamesAction's own gate. */
  businessDecisionPending?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(gamesRemaining);
  const [weekendPending, setWeekendPending] = useState(allStarWeekendPending);
  const [decisionPending, setDecisionPending] = useState(businessDecisionPending);

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
      if (result.businessDecisionPending) {
        setDecisionPending(true);
        setLastResult(
          result.userGamesCompleted > 0
            ? `Played ${result.userGamesCompleted} of your team's game${result.userGamesCompleted > 1 ? "s" : ""} - the front office needs your call on something.`
            : "Ownership needs your call on something before the season continues.",
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

  const blocked = weekendPending || decisionPending;
  const disabled = isPending || remaining === 0 || blocked;

  return (
    <section className="border-t border-rule bg-field p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <Label>Advance the season</Label>
      </div>

      {/* The main verb of a season simulator deserves more than a label and
          two buttons. The count is the thing the player actually tracks down
          toward zero, so it carries the weight rather than sitting in the
          corner as an 11px aside. */}
      <p className="mt-3 font-mono text-[clamp(2rem,4vw,3rem)] leading-none font-medium tracking-[-0.03em] text-ink tabular-nums">
        {remaining}
        <span className="ml-3 font-sans text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
          games to play
        </span>
      </p>

      {weekendPending && (
        <p className="mt-4 border-l-2 border-l-caution bg-raised px-4 py-3 text-[15px] text-ink">
          All-Star Weekend has arrived.{" "}
          <Link
            href={`/leagues/${leagueId}/all-star`}
            className="text-team-accent underline underline-offset-4"
          >
            View the weekend
          </Link>{" "}
          <span className="text-ink-muted">to continue the season.</span>
        </p>
      )}
      {!weekendPending && decisionPending && (
        <p className="mt-4 border-l-2 border-l-caution bg-raised px-4 py-3 text-[15px] text-ink">
          The front office needs your call on something.{" "}
          <Link
            href={`/leagues/${leagueId}/finances/inbox`}
            className="text-team-accent underline underline-offset-4"
          >
            Open the inbox
          </Link>{" "}
          <span className="text-ink-muted">to continue the season.</span>
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={disabled} onClick={() => handleSimulate("NEXT_GAME")}>
          {isPending ? "Simulating..." : "Sim next game"}
        </Button>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => handleSimulate("NEXT_10_GAMES")}
        >
          Sim next 10
        </Button>
      </div>

      {lastResult && (
        <p aria-live="polite" className="mt-3 text-[15px] text-ink-muted">
          {lastResult}
        </p>
      )}
    </section>
  );
}
