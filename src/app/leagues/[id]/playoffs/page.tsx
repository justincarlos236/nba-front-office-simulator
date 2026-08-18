import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlayoffControls } from "@/components/playoffs/PlayoffControls";
import { PlayoffBracket, type BracketSeries } from "@/components/playoffs/PlayoffBracket";
import { ChampionBanner } from "@/components/playoffs/ChampionBanner";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";

/**
 * Playoff rounds simulate whole series at a time.
 *
 * Without this the route runs on the platform default, which is short enough
 * that a cold start on a contended database can end the request mid-write.
 * These actions are not transactional end to end, so a timeout does not roll
 * back - it leaves partial state.
 *
 * 60s is the ceiling on Vercel Hobby. If a plan change raises it, raising
 * this is safe; lowering it is not, and the literal must stay statically
 * analyzable (Next.js reads it at build time, so no imported constant).
 */
export const maxDuration = 60;

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
    <main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">
        {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} Playoffs
      </h1>

      <p className="mt-2 max-w-2xl text-ink-muted">
        Top 6 seeds per conference qualify directly; seeds 7-10 play into the final two spots via
        the play-in tournament. From there it&apos;s a fixed best-of-7 bracket, same as the real
        NBA.
      </p>
      {/* The in-product guide, not a file in the repository. */}
      <HowDoesThisWork
        topic="playoffs"
        className="mt-1 inline-block text-xs text-ink-muted underline hover:text-ink"
      />

      {userStatus && (
        <div className="mt-4 max-w-2xl rounded-[2px] border border-rule bg-field px-4 py-3 text-sm text-ink">
          {userStatus}
        </div>
      )}

      {champion && (
        <ChampionBanner
          leagueId={league.id}
          teamLabel={teamName(champion.team)}
          primaryColor={champion.team.primaryColor}
          secondaryColor={champion.team.secondaryColor}
          season={league.currentSeason}
          isUserTeam={champion.id === userTeamId}
        />
      )}

      <div className="mt-8">
        <PlayoffControls leagueId={league.id} phase={phase} pendingUserGame={pendingUserGame} />
      </div>

      {playInGames.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Play-In Tournament</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {playInGames.map((g) => (
              <div
                key={g.id}
                className={`rounded-[2px] border p-4 text-sm ${
                  g.homeLeagueTeamId === userTeamId || g.awayLeagueTeamId === userTeamId
                    ? "border-team-accent bg-team-accent/5"
                    : "border-rule bg-field"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      (g.homeScore ?? 0) > (g.awayScore ?? 0)
                        ? "font-semibold text-ink"
                        : "text-ink-muted"
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
                        ? "font-semibold text-ink"
                        : "text-ink-muted"
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
