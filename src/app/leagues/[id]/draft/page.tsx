import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DraftControls, type DraftPhase } from "@/components/draft/DraftControls";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROUND_LABELS: Record<number, string> = { 1: "Round 1", 2: "Round 2" };

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
      include: {
        currentOwner: { include: { team: true } },
        selectedProspect: true,
      },
      orderBy: { overallPickNumber: "asc" },
    }),
    prisma.draftProspect.findMany({ where: { leagueId: league.id, season } }),
  ]);

  const nextPick = draftPicks.find((p) => !p.selectedProspectId);
  const phase: DraftPhase =
    regularSeasonGamesRemaining > 0
      ? "regular-season"
      : !finals?.winnerTeamId
        ? "playoffs-incomplete"
        : draftPicks.length === 0
          ? "not-started"
          : !nextPick
            ? "complete"
            : nextPick.currentOwnerId === userTeamId
              ? "user-turn"
              : "cpu-turn";

  const draftedProspectIds = new Set(
    draftPicks.filter((p) => p.selectedProspectId).map((p) => p.selectedProspectId as string),
  );
  const availableProspects = draftProspects
    .filter((p) => !draftedProspectIds.has(p.id))
    .sort((a, b) => b.overallRating - a.overallRating);

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
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

      <div className="mt-8">
        <DraftControls
          leagueId={league.id}
          phase={phase}
          onClockPickNumber={nextPick?.overallPickNumber ?? null}
          availableProspects={availableProspects.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            position: p.position,
            age: p.age,
            overallRating: p.overallRating,
            potentialRating: p.potentialRating,
          }))}
        />
      </div>

      {draftPicks.some((p) => p.selectedProspectId) && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Draft Board</h2>
          <div className="mt-3 max-h-[40rem] space-y-2 overflow-y-auto pr-1">
            {draftPicks
              .filter((p) => p.selectedProspectId)
              .map((pick) => {
                const isUserPick = pick.currentOwnerId === userTeamId;
                return (
                  <div
                    key={pick.id}
                    className={`flex items-center justify-between rounded-lg border p-3 text-sm ${
                      isUserPick ? "border-accent bg-accent/5" : "border-border bg-surface"
                    }`}
                  >
                    <div>
                      <p className="text-xs tracking-wide text-muted uppercase">
                        Pick {pick.overallPickNumber} &middot; {ROUND_LABELS[pick.round]} &middot;{" "}
                        {pick.currentOwner.team.city} {pick.currentOwner.team.name}
                      </p>
                      <p className="font-medium text-foreground">
                        {pick.selectedProspect?.fullName}
                      </p>
                    </div>
                    <span className="font-mono text-xs text-muted">
                      {pick.selectedProspect?.position} &middot; OVR{" "}
                      {pick.selectedProspect?.overallRating}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </main>
  );
}
