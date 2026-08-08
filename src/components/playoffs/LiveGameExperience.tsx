"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { playLiveSeriesGameAction } from "@/lib/actions/playoffs";
import { RotationBoard, type RotationPlayer } from "@/components/rotation/RotationBoard";
import { LiveGameScoreboard } from "@/components/playoffs/LiveGameScoreboard";
import { PostgameSummary } from "@/components/playoffs/PostgameSummary";

export type LiveGameResult = Awaited<ReturnType<typeof playLiveSeriesGameAction>>;

export interface LiveTeamInfo {
  id: string;
  label: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

type Phase = "pregame" | "live" | "postgame";

export function LiveGameExperience({
  leagueId,
  seriesId,
  gameNumber,
  userTeam,
  opponentTeam,
  isHome,
  userWins,
  opponentWins,
  winsNeeded,
  rotationPlayers,
}: {
  leagueId: string;
  seriesId: string;
  gameNumber: number;
  userTeam: LiveTeamInfo;
  opponentTeam: LiveTeamInfo;
  isHome: boolean;
  userWins: number;
  opponentWins: number;
  winsNeeded: number;
  rotationPlayers: RotationPlayer[];
}) {
  const [phase, setPhase] = useState<Phase>("pregame");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<LiveGameResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const homeTeam = isHome ? userTeam : opponentTeam;
  const awayTeam = isHome ? opponentTeam : userTeam;

  function handleTipOff() {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const gameResult = await playLiveSeriesGameAction(leagueId);
        setResult(gameResult);
        setPhase("live");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const seriesStatus =
    userWins === 0 && opponentWins === 0
      ? `Game ${gameNumber} of the series`
      : userWins === opponentWins
        ? `Series tied ${userWins}-${opponentWins}`
        : userWins > opponentWins
          ? `You lead ${userWins}-${opponentWins}`
          : `${opponentTeam.label} leads ${opponentWins}-${userWins}`;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-center gap-6">
        <TeamHeader team={homeTeam} align="right" />
        <div className="text-center">
          <p className="text-xs tracking-wide text-ink-muted uppercase">Game {gameNumber}</p>
          <p className="text-lg font-bold text-ink">vs</p>
        </div>
        <TeamHeader team={awayTeam} align="left" />
      </div>
      <p className="mt-2 text-center text-sm text-ink-muted">{seriesStatus}</p>

      {phase === "pregame" && (
        <div className="mt-8 space-y-4">
          <div className="rounded-[2px] border border-team-accent/40 bg-team-accent/5 p-4 text-center text-sm text-ink">
            Set your rotation for Game {gameNumber} vs {opponentTeam.label}, then tip off - this is
            a live playoff game, so possessions, scoring, and player stats will play out for real as
            you watch.
          </div>
          <RotationBoard
            leagueId={leagueId}
            teamPrimaryColor={userTeam.primaryColor}
            players={rotationPlayers}
          />
          <div className="flex flex-col items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleTipOff}
              className="rounded-[2px] bg-team-accent px-6 py-3 text-base font-bold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Tipping off..." : "Tip off"}
            </button>
            {errorMessage && <p className="text-sm text-negative">{errorMessage}</p>}
          </div>
        </div>
      )}

      {phase === "live" && result && (
        <LiveGameScoreboard
          result={result}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          onComplete={() => setPhase("postgame")}
        />
      )}

      {phase === "postgame" && result && (
        <PostgameSummary
          leagueId={leagueId}
          seriesId={seriesId}
          result={result}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          userTeamId={userTeam.id}
        />
      )}
    </div>
  );
}

function TeamHeader({ team, align }: { team: LiveTeamInfo; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "flex-row-reverse" : ""}`}>
      {team.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logoUrl} alt="" className="h-16 w-16 object-contain" />
      )}
      <p className="max-w-[10rem] text-lg font-bold text-ink">{team.label}</p>
    </div>
  );
}
