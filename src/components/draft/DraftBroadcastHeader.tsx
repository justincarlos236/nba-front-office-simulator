"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TeamBadge } from "@/components/draft/lottery/TeamBadge";
import { resolveTeamAccent } from "@/lib/design/teamAccent";
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
  // Sizing and colour come from the Broadcast frame this sits inside, so the
  // clock inherits the drafting team's ink rather than fighting it.
  return (
    <span>
      {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
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
      <div className="border-t-2 border-team-accent bg-field p-8 text-center">
        <p className="text-[11px] font-semibold tracking-[0.09em] text-team-accent uppercase">
          Draft complete
        </p>
        <p className="mt-3 text-[clamp(1.5rem,3vw,2rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
          Every pick is in the books.
        </p>
        <Link
          href={`/leagues/${leagueId}/offseason`}
          className="mt-6 inline-flex rounded-[2px] bg-team-accent px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] text-team-accent-ink uppercase transition-opacity duration-120 hover:opacity-[0.88]"
        >
          Continue to the offseason
        </Link>
      </div>
    );
  }

  if (!pick) return null;

  const team = teamsById[pick.leagueTeamId];
  const context = teamContextById[pick.leagueTeamId];
  // THE WIRE - Broadcast. The team on the clock owns the frame, so the tension
  // of watching a rival's colour fill the screen before your pick is real.
  const accent = resolveTeamAccent(team?.primaryColor, team?.secondaryColor);

  return (
    <div
      className="relative -mx-6 overflow-hidden px-6 py-8 sm:-mx-8 sm:px-8 sm:py-12"
      style={{ backgroundColor: accent.hex, color: accent.inkHex }}
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-5">
          <TeamBadge logoUrl={team?.logoUrl ?? null} size="lg" />
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold tracking-[0.09em] uppercase"
              style={{ opacity: 0.75 }}
            >
              {ROUND_LABEL[pick.round]} &middot; Pick {pick.overallPickNumber}
            </p>
            <p className="mt-2 text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-bold tracking-[-0.02em]">
              {team ? `${team.city} ${team.name}` : "Unknown team"}
            </p>
            {isUserTurn && (
              <p className="mt-3 text-[11px] font-semibold tracking-[0.18em] uppercase">
                You&apos;re on the clock
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          <div className="font-mono text-[clamp(2.5rem,5vw,3.5rem)] leading-none font-medium tabular-nums tracking-[-0.03em]">
            <CosmeticClock key={pick.id} />
          </div>
          {context && (
            <div
              className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold tracking-[0.09em] uppercase sm:justify-end"
              style={{ opacity: 0.75 }}
            >
              <span>{TEAM_IDENTITY_LABEL[context.identity]}</span>
              {context.needs.slice(0, 2).map((need) => (
                <span key={need}>Needs {TEAM_NEED_LABEL[need]}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
