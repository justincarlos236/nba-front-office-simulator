import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlayoffControls } from "@/components/playoffs/PlayoffControls";
import { PlayoffBracket, type BracketSeries } from "@/components/playoffs/PlayoffBracket";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROUND_LABELS: Record<number, string> = {
  1: "Round 1",
  2: "Conference Semifinals",
  3: "Conference Finals",
  4: "NBA Finals",
};

function teamName(team: { city: string; name: string }): string {
  return `${team.city} ${team.name}`;
}

interface PlayoffGame {
  id: string;
  gameNumber: number;
  homeLeagueTeamId: string;
  awayLeagueTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export default async function PlayoffsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const userTeamId = league.userControlledTeamId;

  const [regularSeasonGamesRemaining, series, playInGames, playoffGames] = await Promise.all([
    prisma.game.count({
      where: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "REGULAR_SEASON",
        playedAt: null,
      },
    }),
    prisma.playoffSeries.findMany({
      where: { leagueId: league.id, season: league.currentSeason },
      include: {
        higherSeedTeam: { include: { team: true } },
        lowerSeedTeam: { include: { team: true } },
        winnerTeam: { include: { team: true } },
      },
      orderBy: [{ round: "asc" }, { conference: "asc" }, { bracketSlot: "asc" }],
    }),
    prisma.game.findMany({
      where: { leagueId: league.id, season: league.currentSeason, type: "PLAY_IN" },
      include: { homeTeam: { include: { team: true } }, awayTeam: { include: { team: true } } },
      orderBy: { gameNumber: "asc" },
    }),
    prisma.game.findMany({
      where: { leagueId: league.id, season: league.currentSeason, type: "PLAYOFF" },
      orderBy: { gameNumber: "asc" },
    }),
  ]);

  const hasStarted = series.length > 0;
  const isComplete = series.some((s) => s.round === 4 && s.winnerTeamId);
  const phase = !hasStarted
    ? regularSeasonGamesRemaining > 0
      ? ("regular-season" as const)
      : ("not-started" as const)
    : isComplete
      ? ("complete" as const)
      : ("in-progress" as const);

  const champion = series.find((s) => s.round === 4)?.winnerTeam;

  const gamesBySeries = new Map<string, PlayoffGame[]>();
  for (const g of playoffGames) {
    const list = gamesBySeries.get(g.seriesId!) ?? [];
    list.push(g);
    gamesBySeries.set(g.seriesId!, list);
  }

  const seriesByConferenceAndRound = new Map<string, typeof series>();
  for (const s of series) {
    const key = `${s.conference ?? "FINALS"}-${s.round}`;
    const list = seriesByConferenceAndRound.get(key) ?? [];
    list.push(s);
    seriesByConferenceAndRound.set(key, list);
  }

  const userStatus = describeUserStatus({ userTeamId, series, playInGames, champion });

  const pendingUserSeries = userTeamId
    ? series.find(
        (s) =>
          !s.winnerTeamId &&
          (s.higherSeedTeamId === userTeamId || s.lowerSeedTeamId === userTeamId),
      )
    : undefined;
  const pendingUserGame = pendingUserSeries
    ? {
        seriesId: pendingUserSeries.id,
        gameNumber: pendingUserSeries.higherSeedWins + pendingUserSeries.lowerSeedWins + 1,
      }
    : null;

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} Playoffs
      </h1>

      <p className="mt-2 max-w-2xl text-muted">
        Top 6 seeds per conference qualify directly; seeds 7-10 play into the final two spots via
        the play-in tournament. From there it&apos;s a fixed best-of-7 bracket, same as the real NBA
        - see docs/ARCHITECTURE.md.
      </p>

      {userStatus && (
        <div className="mt-4 max-w-2xl rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground">
          {userStatus}
        </div>
      )}

      {champion && (
        <div className="mx-auto mt-8 max-w-md rounded-xl border border-accent bg-accent/10 p-6 text-center">
          <p className="text-sm tracking-wide text-muted uppercase">League Champion</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{teamName(champion.team)}</p>
          <Link
            href={`/leagues/${league.id}/offseason`}
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Continue to the offseason &rarr;
          </Link>
        </div>
      )}

      <div className="mt-8">
        <PlayoffControls leagueId={league.id} phase={phase} pendingUserGame={pendingUserGame} />
      </div>

      {playInGames.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Play-In Tournament</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {playInGames.map((g) => (
              <div
                key={g.id}
                className={`rounded-lg border p-4 text-sm ${
                  g.homeLeagueTeamId === userTeamId || g.awayLeagueTeamId === userTeamId
                    ? "border-accent bg-accent/5"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      (g.homeScore ?? 0) > (g.awayScore ?? 0)
                        ? "font-semibold text-foreground"
                        : "text-muted"
                    }
                  >
                    {teamName(g.homeTeam.team)}
                  </span>
                  <span className="font-mono">{g.homeScore}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span
                    className={
                      (g.awayScore ?? 0) > (g.homeScore ?? 0)
                        ? "font-semibold text-foreground"
                        : "text-muted"
                    }
                  >
                    {teamName(g.awayTeam.team)}
                  </span>
                  <span className="font-mono">{g.awayScore}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasStarted && (
        <PlayoffBracket
          eastRounds={
            [
              seriesByConferenceAndRound.get("EAST-1") ?? [],
              seriesByConferenceAndRound.get("EAST-2") ?? [],
              seriesByConferenceAndRound.get("EAST-3") ?? [],
            ] as [BracketSeries[], BracketSeries[], BracketSeries[]]
          }
          westRounds={
            [
              seriesByConferenceAndRound.get("WEST-1") ?? [],
              seriesByConferenceAndRound.get("WEST-2") ?? [],
              seriesByConferenceAndRound.get("WEST-3") ?? [],
            ] as [BracketSeries[], BracketSeries[], BracketSeries[]]
          }
          finals={seriesByConferenceAndRound.get("FINALS-4") ?? []}
          gamesBySeriesId={gamesBySeries}
          userTeamId={userTeamId}
        />
      )}
    </main>
  );
}

function describeUserStatus({
  userTeamId,
  series,
  playInGames,
  champion,
}: {
  userTeamId: string | null;
  series: {
    round: number;
    higherSeedTeamId: string;
    lowerSeedTeamId: string;
    higherSeedWins: number;
    lowerSeedWins: number;
    winnerTeamId: string | null;
  }[];
  playInGames: { homeLeagueTeamId: string; awayLeagueTeamId: string }[];
  champion?: { id: string } | null;
}): string | null {
  if (!userTeamId) return null;
  if (series.length === 0 && playInGames.length === 0) return null;

  if (champion?.id === userTeamId) return "Your team is the League Champion!";

  const teamSeries = series
    .filter((s) => s.higherSeedTeamId === userTeamId || s.lowerSeedTeamId === userTeamId)
    .sort((a, b) => b.round - a.round);

  if (teamSeries.length > 0) {
    const latest = teamSeries[0];
    const isHigher = latest.higherSeedTeamId === userTeamId;
    const teamWins = isHigher ? latest.higherSeedWins : latest.lowerSeedWins;
    const oppWins = isHigher ? latest.lowerSeedWins : latest.higherSeedWins;
    if (!latest.winnerTeamId) {
      return `Your team is alive in the ${ROUND_LABELS[latest.round]} (${teamWins}-${oppWins}).`;
    }
    if (latest.winnerTeamId === userTeamId) {
      return `Your team won the ${ROUND_LABELS[latest.round]} and is advancing.`;
    }
    return `Your team was eliminated in the ${ROUND_LABELS[latest.round]} (${teamWins}-${oppWins}).`;
  }

  const wasInPlayIn = playInGames.some(
    (g) => g.homeLeagueTeamId === userTeamId || g.awayLeagueTeamId === userTeamId,
  );
  if (wasInPlayIn) return "Your team was eliminated in the play-in tournament.";

  return "Your team did not qualify for the playoffs this season.";
}
