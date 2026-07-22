import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getLeagueLeaders, type LeagueLeaderEntry } from "@/lib/stats/leagueLeaders";
import { PlayerChip } from "@/components/players/PlayerChip";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function LeaderboardCard({
  title,
  suffix,
  entries,
  leagueId,
  decimals = 1,
}: {
  title: string;
  suffix: string;
  entries: LeagueLeaderEntry[];
  leagueId: string;
  decimals?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 font-semibold text-foreground">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Not enough games played yet.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry, i) => (
            <div
              key={entry.leaguePlayerId}
              className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-2"
            >
              <span className="flex items-center gap-3">
                <span className="w-4 text-xs text-muted">{i + 1}</span>
                <PlayerChip
                  identity={{ kind: "league", leagueId, leaguePlayerId: entry.leaguePlayerId }}
                  fullName={entry.fullName}
                  photoUrl={entry.photoUrl}
                  teamPrimaryColor={entry.teamPrimaryColor}
                  size="sm"
                />
                {entry.teamAbbreviation && (
                  <span className="text-xs text-muted">{entry.teamAbbreviation}</span>
                )}
              </span>
              <span className="font-mono text-accent">
                {entry.value.toFixed(decimals)}
                {suffix}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function LeadersPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const leaders = await getLeagueLeaders(league.id, league.currentSeason);
  const percentEntries = (entries: LeagueLeaderEntry[]) =>
    entries.map((e) => ({ ...e, value: e.value * 100 }));

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
        &larr; Back to team
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
        {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} League Leaders
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Live leaders from this league&apos;s own simulated games - not the real 2023-24 season.
        Updates as more games are simulated.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <LeaderboardCard
          title="Points per game"
          suffix=" PPG"
          entries={leaders.pointsPerGame}
          leagueId={league.id}
        />
        <LeaderboardCard
          title="Rebounds per game"
          suffix=" RPG"
          entries={leaders.reboundsPerGame}
          leagueId={league.id}
        />
        <LeaderboardCard
          title="Assists per game"
          suffix=" APG"
          entries={leaders.assistsPerGame}
          leagueId={league.id}
        />
        <LeaderboardCard
          title="Steals per game"
          suffix=" SPG"
          entries={leaders.stealsPerGame}
          leagueId={league.id}
        />
        <LeaderboardCard
          title="Blocks per game"
          suffix=" BPG"
          entries={leaders.blocksPerGame}
          leagueId={league.id}
        />
        <LeaderboardCard
          title="Field goal %"
          suffix="%"
          entries={percentEntries(leaders.fieldGoalPct)}
          leagueId={league.id}
        />
        <LeaderboardCard
          title="3-point %"
          suffix="%"
          entries={percentEntries(leaders.threePointPct)}
          leagueId={league.id}
        />
      </div>
    </main>
  );
}
