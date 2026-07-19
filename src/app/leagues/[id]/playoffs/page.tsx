import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PlayoffControls } from "@/components/playoffs/PlayoffControls";

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

export default async function PlayoffsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const [regularSeasonGamesRemaining, series, playInGames] = await Promise.all([
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

  const seriesByConferenceAndRound = new Map<string, typeof series>();
  for (const s of series) {
    const key = `${s.conference ?? "FINALS"}-${s.round}`;
    const list = seriesByConferenceAndRound.get(key) ?? [];
    list.push(s);
    seriesByConferenceAndRound.set(key, list);
  }

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
            &larr; Back to team
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} Playoffs
          </h1>
        </div>
        <Link
          href={`/leagues/${league.id}/standings`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
        >
          Standings
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-muted">
        Top 6 seeds per conference qualify directly; seeds 7-10 play into the final two spots via
        the play-in tournament. From there it&apos;s a fixed best-of-7 bracket, same as the real NBA
        - see docs/ARCHITECTURE.md.
      </p>

      {champion && (
        <div className="mt-8 rounded-xl border border-accent bg-accent/10 p-6 text-center">
          <p className="text-sm tracking-wide text-muted uppercase">League Champion</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{teamName(champion.team)}</p>
        </div>
      )}

      <div className="mt-8">
        <PlayoffControls leagueId={league.id} phase={phase} />
      </div>

      {playInGames.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Play-In Tournament</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {playInGames.map((g) => (
              <div key={g.id} className="rounded-lg border border-border bg-surface p-4 text-sm">
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

      {[1, 2, 3].map((round) => {
        const eastSeries = seriesByConferenceAndRound.get(`EAST-${round}`) ?? [];
        const westSeries = seriesByConferenceAndRound.get(`WEST-${round}`) ?? [];
        if (eastSeries.length === 0 && westSeries.length === 0) return null;
        return (
          <section key={round} className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">{ROUND_LABELS[round]}</h2>
            <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-xs tracking-wide text-muted uppercase">Eastern Conference</p>
                {eastSeries.map((s) => (
                  <SeriesCard key={s.id} series={s} />
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-xs tracking-wide text-muted uppercase">Western Conference</p>
                {westSeries.map((s) => (
                  <SeriesCard key={s.id} series={s} />
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {(seriesByConferenceAndRound.get("FINALS-4") ?? []).length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">{ROUND_LABELS[4]}</h2>
          <div className="mt-3 max-w-sm">
            {(seriesByConferenceAndRound.get("FINALS-4") ?? []).map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function SeriesCard({
  series,
}: {
  series: {
    id: string;
    higherSeedTeam: { team: { city: string; name: string } };
    lowerSeedTeam: { team: { city: string; name: string } };
    higherSeedWins: number;
    lowerSeedWins: number;
    winnerTeamId: string | null;
    higherSeedTeamId: string;
  };
}) {
  const decided = Boolean(series.winnerTeamId);
  const higherWon = series.winnerTeamId === series.higherSeedTeamId;
  return (
    <div className="rounded-lg border border-border bg-surface p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className={decided && higherWon ? "font-semibold text-foreground" : "text-muted"}>
          {teamName(series.higherSeedTeam.team)}
        </span>
        <span className="font-mono">{series.higherSeedWins}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className={decided && !higherWon ? "font-semibold text-foreground" : "text-muted"}>
          {teamName(series.lowerSeedTeam.team)}
        </span>
        <span className="font-mono">{series.lowerSeedWins}</span>
      </div>
      {!decided && <p className="mt-2 text-xs text-muted">Series in progress</p>}
    </div>
  );
}
