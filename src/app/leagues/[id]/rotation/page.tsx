import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveRotation } from "@/lib/rotation/resolveRotation";
import { RotationBoard, type RotationPlayer } from "@/components/rotation/RotationBoard";
import { formatCentsCompact } from "@/lib/money";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RotationPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const userLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  if (!userLeagueTeam) notFound();

  const roster = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: userLeagueTeam.id, isActive: true },
    include: {
      player: true,
      // Contract terms belong here too: this is the one surface that answers
      // "tell me about my team", and a player's role is inseparable from what
      // he costs and how long he is signed for.
      contract: { include: { years: { where: { season: league.currentSeason } } } },
    },
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

  const players: RotationPlayer[] = roster.map((lp) => ({
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
    potentialRating: lp.potentialRating,
    salary: lp.contract?.years[0] ? formatCentsCompact(lp.contract.years[0].salaryCents) : null,
    contractEndSeason: lp.contract?.endSeason ?? null,
  }));

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Roster</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Every player under contract, with their role, their terms and how they feel about both. Set
        your starting five, bench order, and expected minutes - the simulation guides actual playing
        time toward these targets, with natural game-to-game variance from matchups, blowouts, and
        your coaching staff. Drag to reorder; a player left out of the rotation entirely falls to
        the bottom.
      </p>

      <div className="mt-8">
        <RotationBoard
          leagueId={league.id}
          teamPrimaryColor={userLeagueTeam.team.primaryColor}
          players={players}
        />
      </div>
    </main>
  );
}
