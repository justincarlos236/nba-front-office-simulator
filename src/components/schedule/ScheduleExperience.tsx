"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { simulateGamesAction, type SimulateTarget } from "@/lib/actions/simulation";
import { dayIndexToDate, isSameDate, type SeasonMonth } from "@/lib/calendar/seasonCalendar";
import {
  MonthlyScheduleCalendar,
  defaultMonthIndex,
  type ScheduleGame,
} from "@/components/schedule/MonthlyScheduleCalendar";

// Same reveal pacing the draft's pick-by-pick animation already uses
// (src/components/draft/DraftExperience.tsx) - a short, snappy pause per
// result rather than either an instant dump or a sluggish crawl.
const REVEAL_DELAY_MS = 260;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function ScheduleExperience({
  leagueId,
  season,
  initialGames,
  initialToday,
  monthRange,
  gamesRemaining,
  allStarWeekendPending,
  businessDecisionPending = false,
}: {
  leagueId: string;
  season: number;
  initialGames: ScheduleGame[];
  initialToday: Date;
  monthRange: SeasonMonth[];
  gamesRemaining: number;
  allStarWeekendPending: boolean;
  /** A BREAKING BusinessDecision already sits PENDING - mirrors simulateGamesAction's own gate. */
  businessDecisionPending?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [isRevealing, setIsRevealing] = useState(false);
  const [games, setGames] = useState(initialGames);
  const [today, setToday] = useState(initialToday);
  const [monthIndex, setMonthIndex] = useState(() => defaultMonthIndex(monthRange, initialToday));
  const [remaining, setRemaining] = useState(gamesRemaining);
  const [weekendPending, setWeekendPending] = useState(allStarWeekendPending);
  const [decisionPending, setDecisionPending] = useState(businessDecisionPending);
  const [lastResult, setLastResult] = useState<string | null>(null);

  function handleSimulate(target: SimulateTarget) {
    startTransition(async () => {
      const result = await simulateGamesAction(leagueId, target);
      setRemaining(result.remaining);

      setIsRevealing(true);
      for (const g of result.myCompletedGames) {
        const gameDate = dayIndexToDate(season, g.dayIndex);
        setGames((prev) =>
          prev.map((existing) =>
            isSameDate(existing.date, gameDate)
              ? { ...existing, won: g.won, teamScore: g.teamScore, opponentScore: g.opponentScore }
              : existing,
          ),
        );
        setToday(gameDate);
        setMonthIndex((current) => {
          const targetIndex = monthRange.findIndex(
            (m) => m.year === gameDate.getFullYear() && m.month === gameDate.getMonth(),
          );
          return targetIndex >= 0 ? targetIndex : current;
        });
        await sleep(REVEAL_DELAY_MS);
      }
      setIsRevealing(false);

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

  const disabled = isPending || isRevealing || remaining === 0 || weekendPending || decisionPending;

  return (
    <div>
      <div className="rounded-[2px] border border-rule bg-field p-6">
        {weekendPending && (
          <div className="mb-4 rounded-[2px] border border-rule/30 bg-raised p-3 text-sm">
            <span className="text-ink">All-Star Weekend has arrived.</span>{" "}
            <Link
              href={`/leagues/${leagueId}/all-star`}
              className="text-team-accent hover:underline"
            >
              View the weekend
            </Link>{" "}
            <span className="text-ink-muted">to continue the season.</span>
          </div>
        )}
        {!weekendPending && decisionPending && (
          <div className="mb-4 rounded-[2px] border border-caution/30 bg-caution/5 p-3 text-sm">
            <span className="text-ink">The front office needs your call on something.</span>{" "}
            <Link
              href={`/leagues/${leagueId}/finances`}
              className="text-team-accent hover:underline"
            >
              Open the inbox
            </Link>{" "}
            <span className="text-ink-muted">to continue the season.</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleSimulate("NEXT_GAME")}
            className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRevealing ? "Simulating..." : "Sim next game"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => handleSimulate("NEXT_10_GAMES")}
            className="rounded-[2px] border border-rule px-4 py-2 text-sm font-semibold text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRevealing ? "Simulating..." : "Sim next 10 games"}
          </button>
          <span className="text-sm text-ink-muted">
            {remaining} games remaining on your schedule
          </span>
        </div>
        {lastResult && !isRevealing && (
          <p className="mt-3 text-sm text-team-accent">{lastResult}</p>
        )}
      </div>

      <div className="mt-6 rounded-[2px] border border-rule bg-field p-5">
        <MonthlyScheduleCalendar
          games={games}
          today={today}
          monthRange={monthRange}
          monthIndex={monthIndex}
          onMonthChange={setMonthIndex}
        />
      </div>
    </div>
  );
}
