import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { formatCentsCompact } from "@/lib/money";
import { estimateAge } from "@/lib/players/age";
import { computeLeaguePhase } from "@/lib/league/leaguePhase";
import { getJobSecurityLevel } from "@/lib/gm/jobSecurity";
import { OffseasonControls } from "@/components/offseason/OffseasonControls";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";
import { PlayerChip } from "@/components/players/PlayerChip";
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
  DEFENSIVE_PLAYER_OF_THE_YEAR: "Defensive Player of the Year",
  SIXTH_MAN_OF_THE_YEAR: "Sixth Man of the Year",
};

const STAFF_AWARD_LABELS: Record<string, string> = {
  COACH_OF_THE_YEAR: "Coach of the Year",
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

  const [phase, lastSeasonAwards, lastSeasonStaffAwards, retirees, ownershipMessages] =
    await Promise.all([
      computeLeaguePhase(league.id, season),
      prisma.seasonAward.findMany({
        where: { leagueId: league.id, season: previousSeason },
        include: {
          leaguePlayer: { include: { player: true, leagueTeam: { include: { team: true } } } },
        },
      }),
      prisma.staffAward.findMany({
        where: { leagueId: league.id, season: previousSeason },
        include: { staff: { include: { leagueTeam: { include: { team: true } } } } },
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

  const currentCap = getSeasonCapRules(season);
  const nextCap = getSeasonCapRules(season + 1);

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">
        {seasonLabel(season)} Offseason
      </h1>

      <p className="mt-2 max-w-2xl text-ink-muted">
        Players age, develop or decline, and sometimes retire between seasons; contracts that
        expired become free agents; the salary cap grows. See docs/SYSTEMS.md for exactly how each
        of these is modeled.
      </p>

      {phase === "ready" && (
        <div className="mt-4 rounded-[2px] border border-rule bg-field px-4 py-3 text-sm text-ink">
          Salary cap: {formatCentsCompact(currentCap.salaryCapCents)} &rarr;{" "}
          {formatCentsCompact(nextCap.salaryCapCents)} next season
        </div>
      )}

      <div className="mt-8">
        <OffseasonControls
          leagueId={league.id}
          phase={phase}
          nextSeasonLabel={seasonLabel(season + 1)}
          ownerConfidence={league.ownerConfidence}
          jobSecurityLevel={getJobSecurityLevel(league.ownerConfidence)}
        />
      </div>

      {ownershipMessages.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Ownership</h2>
          <div className="mt-3 space-y-3">
            {ownershipMessages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-[2px] border border-rule bg-raised p-4 text-sm text-ink"
              >
                {msg.description}
              </div>
            ))}
          </div>
          <HowDoesThisWork
            topic="owner-confidence"
            className="mt-2 inline-block text-xs text-ink-muted underline hover:text-ink"
          />
        </section>
      )}

      {(lastSeasonAwards.length > 0 || lastSeasonStaffAwards.length > 0) && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">
            {seasonLabel(previousSeason)} Season Awards
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {lastSeasonAwards.map((award) => {
              const isUserTeam = award.leaguePlayer.leagueTeam?.id === userTeamId;
              return (
                <div
                  key={award.id}
                  className={`rounded-[2px] border p-4 text-sm ${
                    isUserTeam ? "border-team-accent bg-team-accent/5" : "border-rule bg-field"
                  }`}
                >
                  <p className="text-xs tracking-wide text-ink-muted uppercase">
                    {AWARD_LABELS[award.category] ?? award.category}
                  </p>
                  <p className="mt-1 font-semibold text-ink">
                    <PlayerChip
                      identity={{
                        kind: "league",
                        leagueId: league.id,
                        leaguePlayerId: award.leaguePlayerId,
                      }}
                      fullName={award.leaguePlayer.player.fullName}
                      photoUrl={award.leaguePlayer.player.photoUrl}
                      teamPrimaryColor={award.leaguePlayer.leagueTeam?.team.primaryColor}
                    />
                  </p>
                  <p className="text-xs text-ink-muted">
                    {award.leaguePlayer.leagueTeam
                      ? `${award.leaguePlayer.leagueTeam.team.city} ${award.leaguePlayer.leagueTeam.team.name}`
                      : "Free agent"}
                  </p>
                </div>
              );
            })}
            {lastSeasonStaffAwards.map((award) => {
              const isUserTeam = award.staff.leagueTeam?.id === userTeamId;
              return (
                <div
                  key={award.id}
                  className={`rounded-[2px] border p-4 text-sm ${
                    isUserTeam ? "border-team-accent bg-team-accent/5" : "border-rule bg-field"
                  }`}
                >
                  <p className="text-xs tracking-wide text-ink-muted uppercase">
                    {STAFF_AWARD_LABELS[award.category] ?? award.category}
                  </p>
                  <p className="mt-1 flex items-center gap-2 font-semibold text-ink">
                    <PlayerAvatar photoUrl={null} fullName={award.staff.fullName} size="xs" />
                    {award.staff.fullName}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {award.staff.leagueTeam
                      ? `${award.staff.leagueTeam.team.city} ${award.staff.leagueTeam.team.name}`
                      : "Unemployed"}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {retirees.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-ink">Retirements</h2>
          <div className="mt-3 space-y-2">
            {retirees.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-[2px] border border-rule bg-field p-4 text-sm"
              >
                <span className="font-medium text-ink">
                  <PlayerChip
                    identity={{ kind: "league", leagueId: league.id, leaguePlayerId: r.id }}
                    fullName={r.player.fullName}
                    photoUrl={r.player.photoUrl}
                  />
                </span>
                <span className="text-ink-muted">
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
