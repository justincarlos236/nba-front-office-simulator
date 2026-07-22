import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SimulateControls } from "@/components/simulation/SimulateControls";
import { SeasonCalendar, type CalendarGame } from "@/components/simulation/SeasonCalendar";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function gamesBack(leaderWins: number, leaderLosses: number, wins: number, losses: number) {
  // Clamped at 0: with an uneven number of games played (common mid-batch,
  // since games are simulated in a random order), the raw formula can go
  // slightly negative for the nominal "leader" itself or a team that's
  // actually ahead on winning percentage despite fewer wins. Real
  // standings never display a negative games-back.
  return Math.max(0, (leaderWins - wins + (losses - leaderLosses)) / 2);
}

function StandingsTable({
  title,
  teams,
  userTeamId,
}: {
  title: string;
  teams: { id: string; name: string; wins: number; losses: number }[];
  userTeamId: string | null;
}) {
  const sorted = [...teams].sort((a, b) => {
    const pctA = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
    const pctB = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
    return pctB - pctA;
  });
  const leader = sorted[0];

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
          <tr>
            <th className="px-4 py-3" colSpan={2}>
              {title}
            </th>
            <th className="px-4 py-3 text-right">W</th>
            <th className="px-4 py-3 text-right">L</th>
            <th className="px-4 py-3 text-right">PCT</th>
            <th className="px-4 py-3 text-right">GB</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((team, i) => {
            const gp = team.wins + team.losses;
            const pct = gp > 0 ? team.wins / gp : 0;
            const gb = leader ? gamesBack(leader.wins, leader.losses, team.wins, team.losses) : 0;
            return (
              <tr
                key={team.id}
                className={`border-t border-border ${team.id === userTeamId ? "bg-accent/10" : ""}`}
              >
                <td className="px-4 py-3 text-muted">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-foreground">{team.name}</td>
                <td className="px-4 py-3 text-right text-foreground">{team.wins}</td>
                <td className="px-4 py-3 text-right text-muted">{team.losses}</td>
                <td className="px-4 py-3 text-right font-mono text-muted">{pct.toFixed(3)}</td>
                <td className="px-4 py-3 text-right font-mono text-muted">
                  {gb === 0 ? "-" : gb.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function StandingsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;

  const [gamesRemaining, recentResults, myGames] = await Promise.all([
    prisma.game.count({
      where: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "REGULAR_SEASON",
        playedAt: null,
        ...(myLeagueTeamId
          ? { OR: [{ homeLeagueTeamId: myLeagueTeamId }, { awayLeagueTeamId: myLeagueTeamId }] }
          : {}),
      },
    }),
    prisma.game.findMany({
      where: { leagueId: league.id, season: league.currentSeason, playedAt: { not: null } },
      include: { homeTeam: { include: { team: true } }, awayTeam: { include: { team: true } } },
      orderBy: { playedAt: "desc" },
      take: 10,
    }),
    myLeagueTeamId
      ? prisma.game.findMany({
          where: {
            leagueId: league.id,
            season: league.currentSeason,
            type: "REGULAR_SEASON",
            OR: [{ homeLeagueTeamId: myLeagueTeamId }, { awayLeagueTeamId: myLeagueTeamId }],
          },
          include: { homeTeam: { include: { team: true } }, awayTeam: { include: { team: true } } },
          orderBy: { gameNumber: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const calendarGames: CalendarGame[] = myGames
    .filter((g) => g.dayIndex !== null)
    .map((g) => {
      const isHome = g.homeLeagueTeamId === myLeagueTeamId;
      const opponent = isHome ? g.awayTeam : g.homeTeam;
      const myScore = isHome ? g.homeScore : g.awayScore;
      const opponentScore = isHome ? g.awayScore : g.homeScore;
      return {
        dayIndex: g.dayIndex!,
        opponentLabel: `${opponent.team.city} ${opponent.team.name}`,
        isHome,
        won: myScore !== null && opponentScore !== null ? myScore > opponentScore : null,
        teamScore: myScore,
        opponentScore: opponentScore,
      };
    });

  const eastTeams = league.teams
    .filter((lt) => lt.team.conference === "EAST")
    .map((lt) => ({
      id: lt.id,
      name: `${lt.team.city} ${lt.team.name}`,
      wins: lt.wins,
      losses: lt.losses,
    }));
  const westTeams = league.teams
    .filter((lt) => lt.team.conference === "WEST")
    .map((lt) => ({
      id: lt.id,
      name: `${lt.team.city} ${lt.team.name}`,
      wins: lt.wins,
      losses: lt.losses,
    }));

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} Standings
        </h1>
        <Link
          href={`/leagues/${league.id}/playoffs`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
        >
          Playoffs
        </Link>
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        A simplified, strength-based simulation (not possession-by-possession) - each team&apos;s
        rotation ratings determine a win probability per game, with a small home-court edge. See
        docs/ARCHITECTURE.md for the exact model.
      </p>

      <div className="mt-8">
        <SimulateControls leagueId={league.id} gamesRemaining={gamesRemaining} />
      </div>

      {myLeagueTeamId && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Your Schedule</h2>
          <div className="mt-3">
            <SeasonCalendar games={calendarGames} />
          </div>
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <StandingsTable
          title="Eastern Conference"
          teams={eastTeams}
          userTeamId={league.userControlledTeamId}
        />
        <StandingsTable
          title="Western Conference"
          teams={westTeams}
          userTeamId={league.userControlledTeamId}
        />
      </div>

      {recentResults.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Recent Results</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recentResults.map((g) => (
              <div key={g.id} className="rounded-lg border border-border bg-surface p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span
                    className={
                      (g.homeScore ?? 0) > (g.awayScore ?? 0)
                        ? "font-semibold text-foreground"
                        : "text-muted"
                    }
                  >
                    {g.homeTeam.team.city} {g.homeTeam.team.name}
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
                    {g.awayTeam.team.city} {g.awayTeam.team.name}
                  </span>
                  <span className="font-mono">{g.awayScore}</span>
                </div>
                {g.type !== "REGULAR_SEASON" && (
                  <p className="mt-1 text-xs tracking-wide text-muted uppercase">
                    {g.type === "PLAY_IN" ? "Play-in" : "Playoffs"}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
