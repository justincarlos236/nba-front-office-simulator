"use client";

import { TeamBadge } from "./TeamBadge";
import type { LotteryOverviewTeamDisplay } from "./types";

export function LotteryOverview({
  teams,
  headlineProspect,
  onStart,
  isStarting,
  errorMessage,
}: {
  /** Sorted worst record (seed 1) first - the same order the real lottery odds table reads. */
  teams: LotteryOverviewTeamDisplay[];
  headlineProspect: { fullName: string; position: string; potentialRating: number } | null;
  onStart: () => void;
  isStarting: boolean;
  errorMessage: string | null;
}) {
  // isUserTeam already means "the user currently owns this pick" - true for
  // both their own original slot and any lottery pick they've traded for,
  // so no separate lookup is needed to find the latter.
  const userTeams = teams.filter((t) => t.isUserTeam);
  const userOwnTeam = userTeams.find((t) => !t.ownedByAnotherTeam) ?? userTeams[0];

  return (
    <div>
      <div className="rounded-xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-6 text-center">
        <p className="text-xs font-semibold tracking-widest text-accent uppercase">
          NBA Draft Lottery
        </p>
        <h2 className="mt-1 text-2xl font-bold text-foreground">
          14 teams. One night. A whole draft order on the line.
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-muted">
          The three worst records are tied at a real 14.0% chance at the No. 1 pick - a flatter,
          fairer table than the old odds, straight from the real post-2019 reform. Everyone
          else&apos;s shot tapers off from there.
        </p>
        {userOwnTeam && (
          <p className="mt-3 text-sm text-foreground">
            Your odds at No. 1:{" "}
            <span className="font-mono font-bold text-accent">
              {(userOwnTeam.oddsForNumberOnePickPct * 100).toFixed(1)}%
            </span>{" "}
            (projected No. {userOwnTeam.projectedSeed} in the lottery order)
          </p>
        )}
        {headlineProspect && (
          <p className="mt-2 text-sm text-foreground">
            This year&apos;s presumptive top prospect:{" "}
            <span className="font-semibold text-accent-2">{headlineProspect.fullName}</span> (
            {headlineProspect.position}) - whoever lands No. 1 gets the first crack.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-1.5">
        {teams.map((t) => (
          <div
            key={t.currentOwnerTeamId + t.originalTeamId}
            className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition ${
              t.isUserTeam ? "border-accent bg-accent/5" : "border-border bg-surface"
            }`}
          >
            <span className="w-6 shrink-0 text-center font-mono text-xs text-muted">
              {t.projectedSeed}
            </span>
            <TeamBadge logoUrl={t.logoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {t.currentOwnerLabel}
                {t.isUserTeam && <span className="ml-2 text-xs text-accent">YOUR TEAM</span>}
              </p>
              {t.ownedByAnotherTeam && (
                <p className="truncate text-xs text-muted">via {t.originalTeamLabel}&apos;s pick</p>
              )}
            </div>
            <div className="w-32 shrink-0 text-right">
              <p className="font-mono text-sm font-semibold text-foreground">
                {(t.oddsForNumberOnePickPct * 100).toFixed(1)}%
              </p>
              <p className="text-[10px] tracking-wide text-muted uppercase">at No. 1</p>
            </div>
            <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, t.oddsForNumberOnePickPct * 100 * (100 / 14))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          type="button"
          disabled={isStarting}
          onClick={onStart}
          className="rounded-lg bg-accent px-6 py-3 text-base font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isStarting ? "Drawing the lottery..." : "Start the Lottery"}
        </button>
        {errorMessage && <p className="text-sm text-red-400">{errorMessage}</p>}
      </div>
    </div>
  );
}
