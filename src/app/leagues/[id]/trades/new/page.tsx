import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { TradeBuilder } from "@/components/trades/TradeBuilder";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}

async function loadRoster(leagueTeamId: string, season: number) {
  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId },
    include: {
      player: true,
      contract: { include: { years: { where: { season } } } },
    },
    orderBy: { overallRating: "desc" },
  });

  const capSheet = computeCapSheet({
    season,
    contracts: leaguePlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({ playerId: lp.playerId, salaryCents: lp.contract!.years[0].salaryCents })),
  });

  const players = leaguePlayers
    .filter((lp) => lp.contract?.years[0])
    .map((lp) => ({
      leaguePlayerId: lp.id,
      fullName: lp.player.fullName,
      position: lp.player.position,
      overallRating: lp.overallRating,
      salaryCents: lp.contract!.years[0].salaryCents.toString(),
      noTradeClause: lp.contract!.noTradeClause,
    }));

  return { players, capSheet };
}

export default async function NewTradePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { with: otherLeagueTeamId } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  if (!myLeagueTeam) notFound();

  if (!otherLeagueTeamId) {
    const otherTeams = league.teams.filter((lt) => lt.id !== myLeagueTeam.id);
    return (
      <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
        <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
          &larr; Back to your team
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Propose a trade with...
        </h1>
        <p className="mt-2 text-muted">
          Player-only trades for now - draft pick trading needs a pick inventory that isn&apos;t
          generated yet (see docs/ROADMAP.md).
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {otherTeams.map((lt) => (
            <Link
              key={lt.id}
              href={`/leagues/${league.id}/trades/new?with=${lt.id}`}
              className="rounded-xl border border-border bg-surface p-5 transition hover:border-accent/40"
              style={{ borderLeftColor: lt.team.primaryColor, borderLeftWidth: "4px" }}
            >
              <p className="text-xs text-muted">{lt.team.division}</p>
              <h3 className="font-semibold text-foreground">
                {lt.team.city} {lt.team.name}
              </h3>
            </Link>
          ))}
        </div>
      </main>
    );
  }

  const otherLeagueTeam = league.teams.find((lt) => lt.id === otherLeagueTeamId);
  if (!otherLeagueTeam) notFound();

  const [mine, theirs] = await Promise.all([
    loadRoster(myLeagueTeam.id, league.currentSeason),
    loadRoster(otherLeagueTeam.id, league.currentSeason),
  ]);

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <Link
        href={`/leagues/${league.id}/trades/new`}
        className="text-sm text-muted hover:text-foreground"
      >
        &larr; Choose a different team
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
        {myLeagueTeam.team.name} &harr; {otherLeagueTeam.team.name}
      </h1>
      <p className="mt-2 text-muted">
        Select players on each side. Legality is checked live against real 2023 CBA salary matching,
        apron, and no-trade-clause rules.
      </p>

      <div className="mt-10">
        <TradeBuilder
          season={league.currentSeason}
          leagueId={league.id}
          myTeam={{
            leagueTeamId: myLeagueTeam.id,
            name: `${myLeagueTeam.team.city} ${myLeagueTeam.team.name}`,
            apronLevel: mine.capSheet.apronLevel,
            capSpaceCents: mine.capSheet.capSpaceCents.toString(),
            players: mine.players,
          }}
          theirTeam={{
            leagueTeamId: otherLeagueTeam.id,
            name: `${otherLeagueTeam.team.city} ${otherLeagueTeam.team.name}`,
            apronLevel: theirs.capSheet.apronLevel,
            capSpaceCents: theirs.capSheet.capSpaceCents.toString(),
            players: theirs.players,
          }}
        />
      </div>
    </main>
  );
}
