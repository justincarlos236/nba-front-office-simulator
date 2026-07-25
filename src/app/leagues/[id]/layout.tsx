import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeLeaguePhase } from "@/lib/league/leaguePhase";
import { getSubNavSections } from "@/lib/league/subNavSections";
import { LeagueSubNav } from "@/components/layout/LeagueSubNav";
import { CareerEndRecap } from "@/components/career/CareerEndRecap";
import { computeCareerTitle } from "@/lib/gm/careerRecord";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  // GM Career Mode - once a franchise has ended (fired or retired), the whole
  // league is locked to a read-only career-end recap; no playable sub-page is
  // reachable. The recap reads from the permanent CareerRecord snapshot, not
  // live league tables.
  if (league.endedAt) {
    const [record, owner] = await Promise.all([
      prisma.careerRecord.findFirst({
        where: { leagueId: league.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findUnique({
        where: { id: league.ownerId },
        select: { gmReputation: true },
      }),
    ]);
    if (record) {
      return (
        <CareerEndRecap
          endReason={record.endReason}
          teamLabel={record.teamLabel}
          seasons={record.seasons}
          wins={record.wins}
          losses={record.losses}
          championships={record.championships}
          playoffAppearances={record.playoffAppearances}
          bestPlayoffFinish={record.bestPlayoffFinish}
          careerEarningsCents={record.careerEarningsCents}
          notableTradeDescription={record.notableTradeDescription}
          finalOwnerConfidence={record.finalOwnerConfidence}
          reputationDelta={record.reputationDelta}
          newReputation={owner?.gmReputation ?? 50}
          title={computeCareerTitle(owner?.gmReputation ?? 50)}
        />
      );
    }
  }

  const userTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  const phase = await computeLeaguePhase(league.id, league.currentSeason);
  const { primary, secondary } = getSubNavSections(phase);

  return (
    <div className="flex-1">
      <div className="border-b border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-6 pt-4">
          <Link
            href={`/leagues/${league.id}`}
            prefetch={false}
            className="group flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
          >
            {userTeam?.team.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userTeam.team.logoUrl} alt="" className="h-6 w-6 object-contain" />
            )}
            <span className="font-medium text-foreground">
              {userTeam ? `${userTeam.team.city} ${userTeam.team.name}` : league.name}
            </span>
          </Link>

          <div className="mt-3">
            <LeagueSubNav leagueId={league.id} primary={primary} secondary={secondary} />
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}
