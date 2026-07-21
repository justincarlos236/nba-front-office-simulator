import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { TradeBuilder } from "@/components/trades/TradeBuilder";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { computeTeamIdentity } from "@/lib/gm/teamIdentity";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import { estimateAge } from "@/lib/players/age";

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
      potentialRating: lp.potentialRating,
      age: estimateAge(lp.player.draftYear, season),
      salaryCents: lp.contract!.years[0].salaryCents.toString(),
      noTradeClause: lp.contract!.noTradeClause,
      injuryStatus: lp.injuryStatus,
      careerGamesMissedToInjury: lp.careerGamesMissedToInjury,
    }));

  // Team identity/needs (Phase 11b/11c) - active roster, not just the
  // subset with a valid current-season contract the trade UI itself uses.
  const activeRoster = leaguePlayers.filter((lp) => lp.isActive);
  const avgAge =
    activeRoster.length > 0
      ? activeRoster.reduce((sum, lp) => sum + estimateAge(lp.player.draftYear, season), 0) /
        activeRoster.length
      : 27;
  const needs = computeTeamNeeds(
    activeRoster.map((lp) => ({ position: lp.player.position, overallRating: lp.overallRating })),
  );

  return { players, capSheet, avgAge, needs };
}

/** Every pick this team currently owns and hasn't used yet - tradeable regardless of whether that season's own draft has happened. */
async function loadTradeablePicks(leagueTeamId: string) {
  const picks = await prisma.draftPick.findMany({
    where: { currentOwnerId: leagueTeamId, selectedProspectId: null },
    orderBy: [{ season: "asc" }, { round: "asc" }],
  });
  return picks;
}

/**
 * Future seasons this team currently owns its OWN round-1 pick for - the
 * Stepien-rule input `validateTrade` needs. Deliberately scoped to the
 * team's own original pick (not others it holds via trade), since the rule
 * is about not leaving a team without a first-rounder of its own in
 * back-to-back years.
 */
async function loadOwnedFutureFirstRoundSeasons(leagueTeamId: string, currentSeason: number) {
  const picks = await prisma.draftPick.findMany({
    where: {
      originalTeamId: leagueTeamId,
      currentOwnerId: leagueTeamId,
      round: 1,
      selectedProspectId: null,
      season: { gte: currentSeason },
    },
    select: { season: true },
  });
  return picks.map((p) => p.season);
}

export default async function NewTradePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { with: otherLeagueTeamId } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      teams: {
        include: { team: true },
        // Postgres doesn't guarantee row order without an explicit
        // orderBy - this list is directly user-visible, so it needs a
        // deterministic order rather than incidental physical row order.
        orderBy: [
          { team: { conference: "asc" } },
          { team: { division: "asc" } },
          { team: { city: "asc" } },
        ],
      },
    },
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
          Trade players and future draft picks with any other team in the league.
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

  const teamLabelById = new Map(
    league.teams.map((lt) => [lt.id, `${lt.team.city} ${lt.team.name}`]),
  );

  const [
    mine,
    theirs,
    minePicks,
    theirPicks,
    mineOwnedFirstRoundSeasons,
    theirOwnedFirstRoundSeasons,
    competitivenessPercentiles,
  ] = await Promise.all([
    loadRoster(myLeagueTeam.id, league.currentSeason),
    loadRoster(otherLeagueTeam.id, league.currentSeason),
    loadTradeablePicks(myLeagueTeam.id),
    loadTradeablePicks(otherLeagueTeam.id),
    loadOwnedFutureFirstRoundSeasons(myLeagueTeam.id, league.currentSeason),
    loadOwnedFutureFirstRoundSeasons(otherLeagueTeam.id, league.currentSeason),
    computeCompetitivenessPercentiles(league.teams),
  ]);

  const myIdentity = computeTeamIdentity(
    competitivenessPercentiles.get(myLeagueTeam.id) ?? 0.5,
    mine.avgAge,
  );
  const theirIdentity = computeTeamIdentity(
    competitivenessPercentiles.get(otherLeagueTeam.id) ?? 0.5,
    theirs.avgAge,
  );

  const toPickDTO = (picks: Awaited<ReturnType<typeof loadTradeablePicks>>) =>
    picks.map((p) => ({
      draftPickId: p.id,
      season: p.season,
      round: p.round,
      overallPickNumber: p.overallPickNumber,
      originalTeamCompetitivenessPercentile:
        competitivenessPercentiles.get(p.originalTeamId) ?? 0.5,
      originalTeamLabel:
        p.originalTeamId === p.currentOwnerId
          ? null
          : (teamLabelById.get(p.originalTeamId) ?? null),
    }));

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
        Select players and draft picks on each side. Legality is checked live against real 2023 CBA
        salary matching, apron, no-trade-clause, and Stepien-rule draft-pick rules.
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
            picks: toPickDTO(minePicks),
            ownedFutureFirstRoundPickSeasons: mineOwnedFirstRoundSeasons,
            identity: myIdentity,
            needs: mine.needs,
            personality: myLeagueTeam.gmPersonality,
            roster: mine.players.map((p) => ({ overallRating: p.overallRating, age: p.age })),
          }}
          theirTeam={{
            leagueTeamId: otherLeagueTeam.id,
            name: `${otherLeagueTeam.team.city} ${otherLeagueTeam.team.name}`,
            apronLevel: theirs.capSheet.apronLevel,
            capSpaceCents: theirs.capSheet.capSpaceCents.toString(),
            players: theirs.players,
            picks: toPickDTO(theirPicks),
            ownedFutureFirstRoundPickSeasons: theirOwnedFirstRoundSeasons,
            identity: theirIdentity,
            needs: theirs.needs,
            personality: otherLeagueTeam.gmPersonality,
            roster: theirs.players.map((p) => ({ overallRating: p.overallRating, age: p.age })),
          }}
        />
      </div>
    </main>
  );
}
