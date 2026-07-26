import Link from "next/link";
import { TeamBadge } from "./TeamBadge";
import type { LotteryResultPayload } from "@/lib/actions/draftLottery";

const NOTABLE_MOVEMENT_THRESHOLD = 4;

function pickSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function LotteryResults({
  leagueId,
  results,
  headlineProspect,
}: {
  leagueId: string;
  /** Sorted pick 1 first. */
  results: LotteryResultPayload[];
  headlineProspect: { fullName: string; position: string; potentialRating: number } | null;
}) {
  const winner = results[0];
  const biggestJump = results.reduce<LotteryResultPayload | null>(
    (best, r) => (r.movement > (best?.movement ?? -Infinity) ? r : best),
    null,
  );
  const biggestFall = results.reduce<LotteryResultPayload | null>(
    (worst, r) => (r.movement < (worst?.movement ?? Infinity) ? r : worst),
    null,
  );
  const userResult = results.find((r) => r.isUserTeam);

  return (
    <div>
      <div className="rounded-xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-6 text-center">
        <p className="text-xs font-semibold tracking-widest text-accent uppercase">
          Lottery Complete
        </p>
        <div className="mt-3 flex flex-col items-center gap-2">
          <TeamBadge logoUrl={winner?.logoUrl ?? null} size="lg" />
          <h2 className="text-2xl font-bold text-foreground">
            {winner?.currentOwnerLabel} win the No. 1 pick
          </h2>
          {winner && winner.oddsForNumberOnePickPct < 0.3 && (
            <p className="text-sm text-muted">
              A {(winner.oddsForNumberOnePickPct * 100).toFixed(1)}% shot came through.
            </p>
          )}
        </div>
        {headlineProspect && (
          <p className="mx-auto mt-3 max-w-xl text-sm text-foreground">
            They&apos;ll have the first crack at{" "}
            <span className="font-semibold text-accent-2">{headlineProspect.fullName}</span> (
            {headlineProspect.position}), this class&apos;s presumptive top prospect.
          </p>
        )}
        {userResult && (
          <p className="mt-3 text-sm text-foreground">
            Your pick landed at{" "}
            <span className="font-mono font-bold text-accent">
              No. {userResult.resultPickNumber}
            </span>{" "}
            (projected No. {userResult.projectedSeed})
          </p>
        )}
      </div>

      {(biggestJump?.movement ?? 0) >= NOTABLE_MOVEMENT_THRESHOLD ||
      (biggestFall?.movement ?? 0) <= -NOTABLE_MOVEMENT_THRESHOLD ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {biggestJump && biggestJump.movement >= NOTABLE_MOVEMENT_THRESHOLD && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-xs font-semibold tracking-wide text-emerald-400 uppercase">
                Biggest Riser
              </p>
              <div className="mt-2 flex items-center gap-3">
                <TeamBadge logoUrl={biggestJump.logoUrl} size="md" />
                <div>
                  <p className="font-semibold text-foreground">{biggestJump.currentOwnerLabel}</p>
                  <p className="text-xs text-muted">
                    Projected No. {biggestJump.projectedSeed}
                    {pickSuffix(biggestJump.projectedSeed)} → No. {biggestJump.resultPickNumber}
                  </p>
                </div>
              </div>
            </div>
          )}
          {biggestFall && biggestFall.movement <= -NOTABLE_MOVEMENT_THRESHOLD && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-xs font-semibold tracking-wide text-red-400 uppercase">
                Biggest Faller
              </p>
              <div className="mt-2 flex items-center gap-3">
                <TeamBadge logoUrl={biggestFall.logoUrl} size="md" />
                <div>
                  <p className="font-semibold text-foreground">{biggestFall.currentOwnerLabel}</p>
                  <p className="text-xs text-muted">
                    Projected No. {biggestFall.projectedSeed}
                    {pickSuffix(biggestFall.projectedSeed)} → No. {biggestFall.resultPickNumber}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-6 space-y-1.5">
        {results.map((r) => (
          <div
            key={r.currentOwnerTeamId + r.originalTeamId}
            className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
              r.isUserTeam ? "border-accent bg-accent/5" : "border-border bg-surface"
            }`}
          >
            <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-foreground">
              {r.resultPickNumber}
            </span>
            <TeamBadge logoUrl={r.logoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {r.currentOwnerLabel}
                {r.isUserTeam && <span className="ml-2 text-xs text-accent">YOUR TEAM</span>}
              </p>
              {r.ownedByAnotherTeam && (
                <p className="truncate text-xs text-muted">via {r.originalTeamLabel}&apos;s pick</p>
              )}
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-xs text-muted">
              proj. {r.projectedSeed}
            </span>
            <span
              className={`w-16 shrink-0 text-right font-mono text-xs ${
                r.movement > 0 ? "text-emerald-400" : r.movement < 0 ? "text-red-400" : "text-muted"
              }`}
            >
              {r.movement === 0 ? "—" : `${r.movement > 0 ? "▲" : "▼"} ${Math.abs(r.movement)}`}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href={`/leagues/${leagueId}/draft`}
          className="rounded-lg bg-accent px-6 py-3 text-base font-bold text-black transition hover:opacity-90"
        >
          Go to the Draft
        </Link>
      </div>
    </div>
  );
}
