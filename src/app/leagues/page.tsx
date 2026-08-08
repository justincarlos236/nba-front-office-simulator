import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_LEAGUES_PER_USER } from "@/lib/league/constants";
import { computeLeaguePhase, type LeaguePhase } from "@/lib/league/leaguePhase";
import { DeleteLeagueButton } from "@/components/leagues/DeleteLeagueButton";

export const dynamic = "force-dynamic";

const STATUS_BADGE_CLASS: Record<string, string> = {
  "Regular season in progress": "bg-raised text-ink-muted",
  "Playoffs underway": "bg-team-accent/15 text-team-accent",
  "Draft pending": "bg-raised text-ink-muted",
  "Ready for next season": "bg-positive/15 text-positive",
};

const TXN_TYPE_LABEL: Record<string, string> = {
  TRADE: "Trade",
  SIGNING: "Signing",
  RETIREMENT: "Retirement",
  INJURY: "Injury",
  OWNERSHIP_MESSAGE: "Ownership",
};

const TXN_TYPE_BADGE_CLASS: Record<string, string> = {
  TRADE: "bg-team-accent/15 text-team-accent",
  SIGNING: "bg-positive/15 text-positive",
  RETIREMENT: "bg-ink-muted/20 text-ink-muted",
  INJURY: "bg-negative/15 text-negative",
  OWNERSHIP_MESSAGE: "bg-raised text-ink-muted",
};

const PHASE_LABEL: Record<LeaguePhase, string> = {
  "regular-season": "Regular season in progress",
  "playoffs-incomplete": "Playoffs underway",
  "pre-draft": "Pre-draft scouting",
  "draft-incomplete": "Draft pending",
  ready: "Ready for next season",
};

async function describeStatus(leagueId: string, season: number): Promise<string> {
  const phase = await computeLeaguePhase(leagueId, season);
  return PHASE_LABEL[phase];
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
    <main className="mx-auto max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">Welcome back</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink">
            {session.user.name ?? "Dashboard"}
          </h1>
        </div>
        {leagues.length < MAX_LEAGUES_PER_USER && (
          <Link
            href="/leagues/new"
            className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90"
          >
            Start a new franchise
          </Link>
        )}
      </div>

      {leagueSummaries.length === 0 ? (
        <div className="mt-10 rounded-[2px] border border-rule bg-field p-8 text-center">
          <p className="text-ink-muted">You haven&apos;t started a franchise yet.</p>
          <Link
            href="/leagues/new"
            className="mt-4 inline-block rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90"
          >
            Start your first franchise
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-ink">
              Your franchises
              <span className="ml-2 text-sm font-normal text-ink-muted">
                {leagues.length}/{MAX_LEAGUES_PER_USER}
              </span>
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {leagueSummaries.map(({ league, userTeam, status }) => {
                const franchiseName = userTeam
                  ? `${userTeam.team.city} ${userTeam.team.name}`
                  : league.name;
                return (
                  <div
                    key={league.id}
                    className="group relative rounded-[2px] border border-rule bg-field p-5 transition hover:border-team-accent/40"
                    style={
                      userTeam
                        ? { borderLeftColor: userTeam.team.primaryColor, borderLeftWidth: "4px" }
                        : undefined
                    }
                  >
                    <DeleteLeagueButton leagueId={league.id} franchiseName={franchiseName} />
                    <Link href={`/leagues/${league.id}`}>
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
                            <h3 className="font-semibold text-ink transition group-hover:text-team-accent">
                              {franchiseName}
                            </h3>
                            <p className="text-xs text-ink-muted">
                              {league.currentSeason}-
                              {(league.currentSeason + 1).toString().slice(-2)} season
                              {userTeam ? ` · ${userTeam.wins}-${userTeam.losses}` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`mt-4 inline-block rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${
                          STATUS_BADGE_CLASS[status] ?? "bg-ink-muted/20 text-ink-muted"
                        }`}
                      >
                        {status}
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>

          {recentActivity.length > 0 && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold text-ink">Recent activity</h2>
              <p className="mt-1 text-sm text-ink-muted">
                The latest trades, signings, injuries, and retirements across all your franchises.
              </p>
              <div className="mt-4 space-y-2">
                {recentActivity.map((txn) => (
                  <Link
                    key={txn.id}
                    href={`/leagues/${txn.leagueId}/transactions`}
                    className="flex items-center gap-3 rounded-[2px] border border-rule bg-field p-3 text-sm transition hover:border-team-accent/40"
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
                      <p className="truncate text-ink">{txn.description}</p>
                      <p className="text-xs text-ink-muted">
                        {franchiseLabelByLeagueId.get(txn.leagueId) ?? "Unknown franchise"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${
                        TXN_TYPE_BADGE_CLASS[txn.type] ?? "bg-ink-muted/20 text-ink-muted"
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
        <h2 className="text-lg font-semibold text-ink">Explore</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/teams"
            className="rounded-[2px] border border-rule bg-field p-5 transition hover:border-team-accent/40"
          >
            <h3 className="font-semibold text-ink">Browse NBA Teams</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Real 2023-24 rosters, ratings, and stats for all 30 teams - the same reference data
              every franchise is cloned from.
            </p>
          </Link>
          <Link
            href="/guide"
            className="rounded-[2px] border border-rule bg-field p-5 transition hover:border-team-accent/40"
          >
            <h3 className="font-semibold text-ink">Learn the Rules</h3>
            <p className="mt-1 text-sm text-ink-muted">
              How the salary cap, rotations, and the season actually work - the strategy behind the
              numbers.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
