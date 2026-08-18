"use client";

import { TeamLogo } from "@/components/teams/TeamLogo";
import { useState, useTransition } from "react";
import Link from "next/link";
import { playLiveSeriesGameAction } from "@/lib/actions/playoffs";
import { RotationBoard, type RotationPlayer } from "@/components/rotation/RotationBoard";
import { LiveGameScoreboard } from "@/components/playoffs/LiveGameScoreboard";
import { PostgameSummary } from "@/components/playoffs/PostgameSummary";
import { isSeriesDecided } from "@/lib/playoffs/seriesDecided";

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

  /**
   * Whether the series is already decided. `winsNeeded` was being passed in and
   * never read, which is exactly how a 4-3 series ended up rendering a
   * pre-game header for "Game 8": the page derives `gameNumber` as
   * wins + wins + 1 unconditionally, so a finished best-of-seven produced a
   * game that cannot exist, above a "You lead 4-3" line describing a series
   * that was already over.
   *
   * The page deliberately does not 404 on a decided series (see its own
   * comment - it would yank the UI out from under a game that just ended), so
   * the check has to live here, where the postgame view is.
   */
  const seriesDecided = isSeriesDecided(userWins, opponentWins, winsNeeded);
  const userWonSeries = userWins >= winsNeeded;

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

  const seriesStatus = seriesDecided
    ? userWonSeries
      ? `You win the series ${userWins}-${opponentWins}`
      : `${opponentTeam.label} wins the series ${opponentWins}-${userWins}`
    : userWins === 0 && opponentWins === 0
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
          {/* A decided series has no next game, so naming one would be stating
              something false - "Game 8" of a best-of-seven. */}
          <p className="text-xs tracking-wide text-ink-muted uppercase">
            {seriesDecided ? "Series over" : `Game ${gameNumber}`}
          </p>
          <p className="text-lg font-bold text-ink">vs</p>
        </div>
        <TeamHeader team={awayTeam} align="left" />
      </div>
      <p className="mt-2 text-center text-sm text-ink-muted">{seriesStatus}</p>

      {/* A decided series must not offer another game. The server action is the
          real gate and would reject the click, but presenting "Tip off" for a
          series that is already won invites an error rather than stating the
          outcome. */}
      {phase === "pregame" && seriesDecided && (
        <div className="mt-8 border border-rule bg-field p-6 text-center">
          <p className="text-[clamp(1.125rem,2vw,1.5rem)] leading-snug text-ink">
            {userWonSeries ? "You advance." : `${opponentTeam.label} advance.`}
          </p>
          <p className="mx-auto mt-2 max-w-[48ch] text-[15px] leading-relaxed text-ink-muted">
            This series is finished {Math.max(userWins, opponentWins)}-
            {Math.min(userWins, opponentWins)}. There is no next game to play.
          </p>
          <Link
            href={`/leagues/${leagueId}/playoffs`}
            className="mt-5 inline-block border border-rule px-4 py-2 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase transition hover:border-rule-strong"
          >
            Back to the bracket
          </Link>
        </div>
      )}

      {phase === "pregame" && !seriesDecided && (
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
        <TeamLogo logoUrl={team.logoUrl} size={64} />
      )}
      <p className="max-w-[10rem] text-lg font-bold text-ink">{team.label}</p>
    </div>
  );
}
