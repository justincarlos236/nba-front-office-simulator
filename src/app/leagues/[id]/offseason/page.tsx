import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { formatCentsCompact } from "@/lib/money";
import { estimateAge } from "@/lib/players/age";
import { OffseasonControls } from "@/components/offseason/OffseasonControls";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
}

const AWARD_LABELS: Record<string, string> = {
  MVP: "Most Valuable Player",
  ROOKIE_OF_THE_YEAR: "Rookie of the Year",
  MOST_IMPROVED_PLAYER: "Most Improved Player",
};

export default async function OffseasonPage({ params }: PageProps) {
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
  const previousSeason = season - 1;

  const [
    regularSeasonGamesRemaining,
    finals,
    totalDraftPicks,
    pendingDraftPicks,
    lastSeasonAwards,
    retirees,
    ownershipMessages,
  ] = await Promise.all([
    prisma.game.count({
      where: { leagueId: league.id, season, type: "REGULAR_SEASON", playedAt: null },
    }),
    prisma.playoffSeries.findFirst({ where: { leagueId: league.id, season, round: 4 } }),
    // A future-pick placeholder for `season` always exists by now (Phase
    // 11a); `overallPickNumber` is the real "draft started" signal.
    prisma.draftPick.count({
      where: { leagueId: league.id, season, overallPickNumber: { not: null } },
    }),
    prisma.draftPick.count({
      where: {
        leagueId: league.id,
        season,
        overallPickNumber: { not: null },
        selectedProspectId: null,
      },
    }),
    prisma.seasonAward.findMany({
      where: { leagueId: league.id, season: previousSeason },
      include: {
        leaguePlayer: { include: { player: true, leagueTeam: { include: { team: true } } } },
      },
    }),
    prisma.leaguePlayer.findMany({
      where: { leagueId: league.id, retiredSeason: previousSeason },
      include: { player: true },
      orderBy: { overallRating: "desc" },
    }),
    prisma.leagueTransaction.findMany({
      where: { leagueId: league.id, season, type: "OWNERSHIP_MESSAGE" },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const draftComplete = totalDraftPicks > 0 && pendingDraftPicks === 0;
  const phase = !finals?.winnerTeamId
    ? regularSeasonGamesRemaining > 0
      ? ("regular-season" as const)
      : ("playoffs-incomplete" as const)
    : !draftComplete
      ? ("draft-incomplete" as const)
      : ("ready" as const);

  const currentCap = getSeasonCapRules(season);
  const nextCap = getSeasonCapRules(season + 1);

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
            &larr; Back to team
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {seasonLabel(season)} Offseason
          </h1>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/leagues/${league.id}/playoffs`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            Playoffs
          </Link>
          <Link
            href={`/leagues/${league.id}/draft`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            Draft
          </Link>
        </div>
      </div>

      <p className="mt-2 max-w-2xl text-muted">
        Players age, develop or decline, and sometimes retire between seasons; contracts that
        expired become free agents; the salary cap grows. See docs/ARCHITECTURE.md for exactly how
        each of these is modeled.
      </p>

      {phase === "ready" && (
        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground">
          Salary cap: {formatCentsCompact(currentCap.salaryCapCents)} &rarr;{" "}
          {formatCentsCompact(nextCap.salaryCapCents)} next season
        </div>
      )}

      <div className="mt-8">
        <OffseasonControls
          leagueId={league.id}
          phase={phase}
          nextSeasonLabel={seasonLabel(season + 1)}
        />
      </div>

      {ownershipMessages.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Ownership</h2>
          <div className="mt-3 space-y-3">
            {ownershipMessages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 text-sm text-foreground"
              >
                {msg.description}
              </div>
            ))}
          </div>
          <Link
            href="/guide/finances#owner-confidence"
            className="mt-2 inline-block text-xs text-muted underline hover:text-foreground"
          >
            How does this work?
          </Link>
        </section>
      )}

      {lastSeasonAwards.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">
            {seasonLabel(previousSeason)} Season Awards
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {lastSeasonAwards.map((award) => {
              const isUserTeam = award.leaguePlayer.leagueTeam?.id === userTeamId;
              return (
                <div
                  key={award.id}
                  className={`rounded-lg border p-4 text-sm ${
                    isUserTeam ? "border-accent bg-accent/5" : "border-border bg-surface"
                  }`}
                >
                  <p className="text-xs tracking-wide text-muted uppercase">
                    {AWARD_LABELS[award.category] ?? award.category}
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-semibold text-foreground">
                    <PlayerAvatar
                      photoUrl={award.leaguePlayer.player.photoUrl}
                      fullName={award.leaguePlayer.player.fullName}
                      size="sm"
                      teamPrimaryColor={award.leaguePlayer.leagueTeam?.team.primaryColor}
                    />
                    {award.leaguePlayer.player.fullName}
                  </p>
                  <p className="text-xs text-muted">
                    {award.leaguePlayer.leagueTeam
                      ? `${award.leaguePlayer.leagueTeam.team.city} ${award.leaguePlayer.leagueTeam.team.name}`
                      : "Free agent"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {retirees.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Retirements</h2>
          <div className="mt-3 space-y-2">
            {retirees.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 text-sm"
              >
                <span className="flex items-center gap-3 font-medium text-foreground">
                  <PlayerAvatar
                    photoUrl={r.player.photoUrl}
                    fullName={r.player.fullName}
                    size="sm"
                  />
                  {r.player.fullName}
                </span>
                <span className="text-muted">
                  Retired at {estimateAge(r.player.draftYear, previousSeason)} &middot; final rating{" "}
                  {r.overallRating}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
