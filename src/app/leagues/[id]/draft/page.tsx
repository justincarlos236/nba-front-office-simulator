import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DraftExperience } from "@/components/draft/DraftExperience";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DraftPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const userTeamId = league.userControlledTeamId;
  const season = league.currentSeason;

  const [regularSeasonGamesRemaining, finals, draftPicks, draftProspects] = await Promise.all([
    prisma.game.count({
      where: { leagueId: league.id, season, type: "REGULAR_SEASON", playedAt: null },
    }),
    prisma.playoffSeries.findFirst({ where: { leagueId: league.id, season, round: 4 } }),
    prisma.draftPick.findMany({
      where: { leagueId: league.id, season },
      orderBy: { overallPickNumber: "asc" },
    }),
    prisma.draftProspect.findMany({ where: { leagueId: league.id, season } }),
  ]);

  const gatePhase: "regular-season" | "playoffs-incomplete" | "active" =
    regularSeasonGamesRemaining > 0
      ? "regular-season"
      : !finals?.winnerTeamId
        ? "playoffs-incomplete"
        : "active";

  const teamsById: Record<string, { city: string; name: string }> = {};
  for (const lt of league.teams) {
    teamsById[lt.id] = { city: lt.team.city, name: lt.team.name };
  }

  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
            &larr; Back to team
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {season} NBA Draft
          </h1>
        </div>
        <Link
          href={`/leagues/${league.id}/offseason`}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
        >
          Offseason
        </Link>
      </div>

      <p className="mt-2 max-w-2xl text-muted">
        Picks 1-14 are decided by the real post-2019 lottery odds (the 3 worst records tied at
        14.0%); picks 15-30 go to playoff teams in reverse regular-season order; round 2 is a
        straight reverse-record sweep. Prospects are procedurally generated - no real future draft
        class exists yet. See docs/ARCHITECTURE.md.
      </p>

      {gatePhase === "regular-season" && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Finish the regular season on the standings page before the draft.
          </p>
        </div>
      )}
      {gatePhase === "playoffs-incomplete" && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">Crown a champion in the playoffs before the draft.</p>
        </div>
      )}
      {gatePhase === "active" && (
        <DraftExperience
          leagueId={league.id}
          userTeamId={userTeamId}
          teamsById={teamsById}
          initialPicks={draftPicks.map((p) => ({
            id: p.id,
            round: p.round,
            overallPickNumber: p.overallPickNumber!,
            leagueTeamId: p.currentOwnerId,
            selectedProspectId: p.selectedProspectId,
          }))}
          initialProspects={draftProspects.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            position: p.position,
            age: p.age,
            overallRating: p.overallRating,
            potentialRating: p.potentialRating,
          }))}
        />
      )}
    </main>
  );
}
