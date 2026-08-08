import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getLeagueLeaders, type LeagueLeaderEntry } from "@/lib/stats/leagueLeaders";
import { getLiveAwardRace, type AwardRaceEntry } from "@/lib/stats/awardRace";
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
    <div className="rounded-[2px] border border-rule bg-field p-4">
      <h2 className="mb-3 font-semibold text-ink">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">Not enough games played yet.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry, i) => (
            <div
              key={entry.leaguePlayerId}
              className="flex items-center justify-between rounded-[2px] px-2 py-2 text-sm hover:bg-raised"
            >
              <span className="flex items-center gap-3">
                <span className="w-4 text-xs text-ink-muted">{i + 1}</span>
                <PlayerChip
                  identity={{ kind: "league", leagueId, leaguePlayerId: entry.leaguePlayerId }}
                  fullName={entry.fullName}
                  photoUrl={entry.photoUrl}
                  teamPrimaryColor={entry.teamPrimaryColor}
                  size="sm"
                />
                {entry.teamAbbreviation && (
                  <span className="text-xs text-ink-muted">{entry.teamAbbreviation}</span>
                )}
              </span>
              <span className="font-mono text-team-accent">
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

function AwardRaceCard({
  title,
  entry,
  leagueId,
}: {
  title: string;
  entry: AwardRaceEntry | null;
  leagueId: string;
}) {
  return (
    <div className="rounded-[2px] border border-team-accent/30 bg-team-accent/5 p-4">
      <h2 className="mb-3 text-xs tracking-wide text-ink-muted uppercase">{title}</h2>
      {entry ? (
        <PlayerChip
          identity={{ kind: "league", leagueId, leaguePlayerId: entry.leaguePlayerId }}
          fullName={entry.fullName}
          photoUrl={entry.photoUrl}
          teamPrimaryColor={entry.teamPrimaryColor}
          size="md"
        />
      ) : (
        <p className="text-sm text-ink-muted">Not enough games played yet.</p>
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

  const [leaders, awardRace] = await Promise.all([
    getLeagueLeaders(league.id, league.currentSeason),
    getLiveAwardRace(league.id, league.currentSeason),
  ]);
  const percentEntries = (entries: LeagueLeaderEntry[]) =>
    entries.map((e) => ({ ...e, value: e.value * 100 }));

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">
        {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} League Leaders
      </h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Live leaders from this league&apos;s own simulated games - not the real 2023-24 season.
        Updates as more games are simulated.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-ink">
        Award race - if the season ended today
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AwardRaceCard title="MVP" entry={awardRace.mvp} leagueId={league.id} />
        <AwardRaceCard
          title="Defensive Player of the Year"
          entry={awardRace.defensivePlayerOfTheYear}
          leagueId={league.id}
        />
        <AwardRaceCard
          title="Sixth Man of the Year"
          entry={awardRace.sixthManOfTheYear}
          leagueId={league.id}
        />
        <AwardRaceCard
          title="Rookie of the Year"
          entry={awardRace.rookieOfTheYear}
          leagueId={league.id}
        />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
