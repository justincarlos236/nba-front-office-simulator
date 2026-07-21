import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_LEAGUES_PER_USER } from "@/lib/league/constants";

export const dynamic = "force-dynamic";

const STATUS_BADGE_CLASS: Record<string, string> = {
  "Regular season in progress": "bg-sky-500/15 text-sky-400",
  "Playoffs underway": "bg-accent/15 text-accent",
  "Draft pending": "bg-purple-500/15 text-purple-400",
  "Ready for next season": "bg-emerald-500/15 text-emerald-400",
};

const TXN_TYPE_LABEL: Record<string, string> = {
  TRADE: "Trade",
  SIGNING: "Signing",
  RETIREMENT: "Retirement",
  INJURY: "Injury",
  OWNERSHIP_MESSAGE: "Ownership",
};

const TXN_TYPE_BADGE_CLASS: Record<string, string> = {
  TRADE: "bg-accent/15 text-accent",
  SIGNING: "bg-emerald-500/15 text-emerald-400",
  RETIREMENT: "bg-muted/20 text-muted",
  INJURY: "bg-red-500/15 text-red-400",
  OWNERSHIP_MESSAGE: "bg-purple-500/15 text-purple-400",
};

async function describeStatus(leagueId: string, season: number): Promise<string> {
  const [gamesRemaining, champion, pendingDraftPicks, totalDraftPicks] = await Promise.all([
    prisma.game.count({
      where: { leagueId, season, type: "REGULAR_SEASON", playedAt: null },
    }),
    prisma.playoffSeries.findFirst({
      where: { leagueId, season, round: 4, winnerTeamId: { not: null } },
    }),
    // A future-pick placeholder always exists by now (Phase 11a);
    // `overallPickNumber` is the real "draft started" signal.
    prisma.draftPick.count({
      where: { leagueId, season, overallPickNumber: { not: null }, selectedProspectId: null },
    }),
    prisma.draftPick.count({ where: { leagueId, season, overallPickNumber: { not: null } } }),
  ]);

  if (gamesRemaining > 0) return "Regular season in progress";
  if (!champion) return "Playoffs underway";
  if (totalDraftPicks === 0 || pendingDraftPicks > 0) return "Draft pending";
  return "Ready for next season";
}

export default async function DashboardPage() {
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

  // A quick "what's changed since I was last here" pulse across every
  // franchise at once - nothing else on the site aggregates activity
  // across leagues, since every other transaction/news view is scoped to
  // a single league.
  const recentActivity =
    leagues.length > 0
      ? await prisma.leagueTransaction.findMany({
          where: { leagueId: { in: leagues.map((l) => l.id) } },
          orderBy: { createdAt: "desc" },
          take: 8,
        })
      : [];
  const franchiseLabelByLeagueId = new Map(
    leagueSummaries.map(({ league, userTeam }) => [
      league.id,
      userTeam ? `${userTeam.team.city} ${userTeam.team.name}` : league.name,
    ]),
  );
  const franchiseLogoByLeagueId = new Map(
    leagueSummaries.map(({ league, userTeam }) => [league.id, userTeam?.team.logoUrl ?? null]),
  );

  return (
    <main className="mx-auto max-w-5xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Welcome back</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
            {session.user.name ?? "Dashboard"}
          </h1>
        </div>
        {leagues.length < MAX_LEAGUES_PER_USER && (
          <Link
            href="/leagues/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Start a new franchise
          </Link>
        )}
      </div>

      {leagueSummaries.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">You haven&apos;t started a franchise yet.</p>
          <Link
            href="/leagues/new"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90"
          >
            Start your first franchise
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">
              Your franchises
              <span className="ml-2 text-sm font-normal text-muted">
                {leagues.length}/{MAX_LEAGUES_PER_USER}
              </span>
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {leagueSummaries.map(({ league, userTeam, status }) => (
                <Link
                  key={league.id}
                  href={`/leagues/${league.id}`}
                  className="group rounded-xl border border-border bg-surface p-5 transition hover:border-accent/40"
                  style={
                    userTeam
                      ? { borderLeftColor: userTeam.team.primaryColor, borderLeftWidth: "4px" }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {userTeam?.team.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={userTeam.team.logoUrl}
                          alt=""
                          width={40}
                          height={40}
                          className="shrink-0"
                        />
                      )}
                      <div>
                        <h3 className="font-semibold text-foreground transition group-hover:text-accent">
                          {userTeam ? `${userTeam.team.city} ${userTeam.team.name}` : league.name}
                        </h3>
                        <p className="text-xs text-muted">
                          {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)}{" "}
                          season
                          {userTeam ? ` · ${userTeam.wins}-${userTeam.losses}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`mt-4 inline-block rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${
                      STATUS_BADGE_CLASS[status] ?? "bg-muted/20 text-muted"
                    }`}
                  >
                    {status}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {recentActivity.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
              <p className="mt-1 text-sm text-muted">
                The latest trades, signings, injuries, and retirements across all your franchises.
              </p>
              <div className="mt-4 space-y-2">
                {recentActivity.map((txn) => (
                  <Link
                    key={txn.id}
                    href={`/leagues/${txn.leagueId}/transactions`}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm transition hover:border-accent/40"
                  >
                    {franchiseLogoByLeagueId.get(txn.leagueId) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={franchiseLogoByLeagueId.get(txn.leagueId)!}
                        alt=""
                        width={20}
                        height={20}
                        className="shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">{txn.description}</p>
                      <p className="text-xs text-muted">
                        {franchiseLabelByLeagueId.get(txn.leagueId) ?? "Unknown franchise"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${
                        TXN_TYPE_BADGE_CLASS[txn.type] ?? "bg-muted/20 text-muted"
                      }`}
                    >
                      {TXN_TYPE_LABEL[txn.type] ?? txn.type}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Explore</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/teams"
            className="rounded-xl border border-border bg-surface p-5 transition hover:border-accent/40"
          >
            <h3 className="font-semibold text-foreground">Browse NBA Teams</h3>
            <p className="mt-1 text-sm text-muted">
              Real 2023-24 rosters, ratings, and stats for all 30 teams - the same reference data
              every franchise is cloned from.
            </p>
          </Link>
          <Link
            href="/#engineering"
            className="rounded-xl border border-border bg-surface p-5 transition hover:border-accent/40"
          >
            <h3 className="font-semibold text-foreground">How this is built</h3>
            <p className="mt-1 text-sm text-muted">
              The cap engine, simulation model, and data sourcing decisions behind the simulator.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
