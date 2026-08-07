import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveRotation } from "@/lib/rotation/resolveRotation";
import type { RotationPlayer } from "@/components/rotation/RotationBoard";
import { isHigherSeedHomeGame } from "@/lib/simulation/simulateSeries";
import { LiveGameExperience } from "@/components/playoffs/LiveGameExperience";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; seriesId: string }>;
}

export default async function LivePlayoffGamePage({ params }: PageProps) {
  const { id, seriesId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const userTeamId = league.userControlledTeamId;
  if (!userTeamId) notFound();

  const series = await prisma.playoffSeries.findUnique({ where: { id: seriesId } });
  // Deliberately doesn't 404 on `series.winnerTeamId` being set - Next.js
  // re-runs this Server Component in the background after the "Tip off"
  // server action resolves, and if that very game decided the series (e.g.
  // a sweep), this guard would otherwise yank the 404 UI in over the
  // client's own already-correct live/postgame view. Whether there's still
  // a game to play is enforced fresh, at click time, by
  // playLiveSeriesGameAction itself - the single source of truth for that,
  // not this page's own possibly-stale render.
  if (
    !series ||
    series.leagueId !== league.id ||
    series.season !== league.currentSeason ||
    (series.higherSeedTeamId !== userTeamId && series.lowerSeedTeamId !== userTeamId)
  ) {
    notFound();
  }

  const isHigherSeed = series.higherSeedTeamId === userTeamId;
  const opponentTeamId = isHigherSeed ? series.lowerSeedTeamId : series.higherSeedTeamId;
  const gameNumber = series.higherSeedWins + series.lowerSeedWins + 1;
  const isHome = isHigherSeedHomeGame(gameNumber) === isHigherSeed;
  const userWins = isHigherSeed ? series.higherSeedWins : series.lowerSeedWins;
  const opponentWins = isHigherSeed ? series.lowerSeedWins : series.higherSeedWins;

  const userLeagueTeam = league.teams.find((lt) => lt.id === userTeamId)!;
  const opponentLeagueTeam = league.teams.find((lt) => lt.id === opponentTeamId)!;

  const roster = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: userTeamId, isActive: true },
    include: { player: true },
    orderBy: { overallRating: "desc" },
  });
  const simRoster = roster.map((lp) => ({
    leaguePlayerId: lp.id,
    fullName: lp.player.fullName,
    overallRating: lp.overallRating,
    position: lp.player.position,
    realStat: null,
    rotationSlot: lp.rotationSlot,
    targetMinutesPerGame: lp.targetMinutesPerGame,
  }));
  const rankById = new Map(
    resolveRotation(simRoster).map((e) => [e.player.leaguePlayerId, e.rank]),
  );
  const rotationPlayers: RotationPlayer[] = roster.map((lp) => ({
    leaguePlayerId: lp.id,
    fullName: lp.player.fullName,
    photoUrl: lp.player.photoUrl,
    position: lp.player.position,
    overallRating: lp.overallRating,
    injuryStatus: lp.injuryStatus,
    rank: rankById.get(lp.id) ?? null,
    targetMinutesPerGame: lp.targetMinutesPerGame,
    morale: lp.morale,
    tradeRequestActive: lp.tradeRequestActive,
  }));

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <LiveGameExperience
        leagueId={league.id}
        seriesId={series.id}
        gameNumber={gameNumber}
        userTeam={{
          id: userTeamId,
          label: `${userLeagueTeam.team.city} ${userLeagueTeam.team.name}`,
          logoUrl: userLeagueTeam.team.logoUrl,
          primaryColor: userLeagueTeam.team.primaryColor,
        }}
        opponentTeam={{
          id: opponentTeamId,
          label: `${opponentLeagueTeam.team.city} ${opponentLeagueTeam.team.name}`,
          logoUrl: opponentLeagueTeam.team.logoUrl,
          primaryColor: opponentLeagueTeam.team.primaryColor,
        }}
        isHome={isHome}
        userWins={userWins}
        opponentWins={opponentWins}
        winsNeeded={series.winsNeeded}
        rotationPlayers={rotationPlayers}
      />
    </main>
  );
}
