"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TeamBadge } from "@/components/draft/lottery/TeamBadge";
import { TEAM_IDENTITY_LABEL } from "@/lib/gm/teamIdentity";
import { TEAM_NEED_LABEL } from "@/lib/gm/teamNeeds";
import type { DraftPickInfo, DraftTeamInfo, DraftTeamContextInfo } from "./types";

const ROUND_LABEL: Record<number, string> = { 1: "Round 1", 2: "Round 2" };

// A purely cosmetic countdown - resets whenever the on-the-clock pick
// changes, but never triggers any consequence on timeout. This is a
// single-player game; a real countdown that force-picks for the user
// would be hostile UX, not exciting, so this exists for atmosphere only.
const COSMETIC_CLOCK_SECONDS = 90;

// A separate, remount-keyed component (see the parent's `key={pick.id}`) -
// keying it forces a fresh `useState` initial value whenever the pick
// changes, so there's no need to synchronously reset state inside an
// effect body (which `react-hooks/set-state-in-effect` flags).
function CosmeticClock() {
  const [secondsLeft, setSecondsLeft] = useState(COSMETIC_CLOCK_SECONDS);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return (
    <div className="font-mono text-3xl font-bold tabular-nums text-foreground">
      {minutes}:{seconds.toString().padStart(2, "0")}
    </div>
  );
}

export function DraftBroadcastHeader({
  leagueId,
  pick,
  teamsById,
  teamContextById,
  isUserTurn,
  draftComplete,
}: {
  leagueId: string;
  pick: DraftPickInfo | null;
  teamsById: Record<string, DraftTeamInfo>;
  teamContextById: Record<string, DraftTeamContextInfo>;
  isUserTurn: boolean;
  draftComplete: boolean;
}) {
  if (draftComplete) {
    return (
      <div className="rounded-xl border border-accent/30 bg-gradient-to-b from-accent/10 to-transparent p-6 text-center">
        <p className="text-xs font-semibold tracking-widest text-accent uppercase">
          Draft Complete
        </p>
        <p className="mt-1 text-lg font-bold text-foreground">Every pick is in the books.</p>
        <Link
          href={`/leagues/${leagueId}/offseason`}
          className="mt-4 inline-block rounded-lg bg-accent px-6 py-3 text-base font-bold text-black transition hover:opacity-90"
        >
          Continue to the offseason &rarr;
        </Link>
      </div>
    );
  }

  if (!pick) return null;

  const team = teamsById[pick.leagueTeamId];
  const context = teamContextById[pick.leagueTeamId];

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-6 ${
        isUserTurn ? "border-accent bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div className="flex items-center gap-4">
          <TeamBadge logoUrl={team?.logoUrl ?? null} size="lg" />
          <div>
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">
              {ROUND_LABEL[pick.round]} &middot; Pick {pick.overallPickNumber}
            </p>
            <p className="text-xl font-bold text-foreground">
              {team ? `${team.city} ${team.name}` : "Unknown team"}
            </p>
            {isUserTurn && (
              <span className="mt-1 inline-block rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent">
                YOU&apos;RE ON THE CLOCK
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 sm:items-end">
          <CosmeticClock key={pick.id} />
          {context && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                {TEAM_IDENTITY_LABEL[context.identity]}
              </span>
              {context.needs.slice(0, 2).map((need) => (
                <span
                  key={need}
                  className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
                >
                  Needs: {TEAM_NEED_LABEL[need]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
