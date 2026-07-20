import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_LEAGUES_PER_USER } from "@/lib/league/constants";

export const dynamic = "force-dynamic";

async function describeStatus(leagueId: string, season: number): Promise<string> {
  const [gamesRemaining, champion, pendingDraftPicks, totalDraftPicks] = await Promise.all([
    prisma.game.count({
      where: { leagueId, season, type: "REGULAR_SEASON", playedAt: null },
    }),
    prisma.playoffSeries.findFirst({
      where: { leagueId, season, round: 4, winnerTeamId: { not: null } },
    }),
    prisma.draftPick.count({ where: { leagueId, season, selectedProspectId: null } }),
    prisma.draftPick.count({ where: { leagueId, season } }),
  ]);

  if (gamesRemaining > 0) return "Regular season in progress";
  if (!champion) return "Playoffs underway";
  if (totalDraftPicks === 0 || pendingDraftPicks > 0) return "Draft pending";
  return "Ready for next season";
}

export default async function LeaguesHubPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const leagues = await prisma.league.findMany({
    where: { ownerId: session.user.id },
    include: { teams: { include: { team: true } } },
    orderBy: { createdAt: "asc" },
  });

  const leagueSummaries = await Promise.all(
    leagues.map(async (league) => {
      const userTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
      const status = await describeStatus(league.id, league.currentSeason);
      return { league, userTeam, status };
    }),
  );

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">My Leagues</h1>
        {leagues.length < MAX_LEAGUES_PER_USER && (
          <Link
            href="/leagues/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Start a new franchise
          </Link>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-muted">
        Run up to {MAX_LEAGUES_PER_USER} independent franchises at once - each is its own save, with
        its own roster, cap sheet, standings, and history.
      </p>

      {leagueSummaries.length === 0 && (
        <div className="mt-10 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">You haven&apos;t started a franchise yet.</p>
          <Link
            href="/leagues/new"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Start your first franchise
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {leagueSummaries.map(({ league, userTeam, status }) => (
          <Link
            key={league.id}
            href={`/leagues/${league.id}`}
            className="rounded-xl border border-border bg-surface p-5 transition hover:border-accent/40"
            style={
              userTeam
                ? { borderLeftColor: userTeam.team.primaryColor, borderLeftWidth: "4px" }
                : undefined
            }
          >
            <div className="flex items-center gap-3">
              {userTeam?.team.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userTeam.team.logoUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="shrink-0"
                />
              )}
              <div>
                <h2 className="font-semibold text-foreground">
                  {userTeam ? `${userTeam.team.city} ${userTeam.team.name}` : league.name}
                </h2>
                <p className="text-xs text-muted">
                  {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} season
                  {userTeam ? ` · ${userTeam.wins}-${userTeam.losses}` : ""}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs tracking-wide text-muted uppercase">{status}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
