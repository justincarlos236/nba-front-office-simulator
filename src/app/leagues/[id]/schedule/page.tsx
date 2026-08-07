import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dayIndexToDate, getSeasonMonthRange } from "@/lib/calendar/seasonCalendar";
import type { ScheduleGame } from "@/components/schedule/MonthlyScheduleCalendar";
import { ScheduleExperience } from "@/components/schedule/ScheduleExperience";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SchedulePage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) notFound();

  const [myGames, gamesRemaining, pendingWeekend, pendingBreakingDecision] = await Promise.all([
    prisma.game.findMany({
      where: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "REGULAR_SEASON",
        OR: [{ homeLeagueTeamId: myLeagueTeamId }, { awayLeagueTeamId: myLeagueTeamId }],
      },
      include: { homeTeam: { include: { team: true } }, awayTeam: { include: { team: true } } },
      orderBy: { gameNumber: "asc" },
    }),
    prisma.game.count({
      where: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "REGULAR_SEASON",
        playedAt: null,
        OR: [{ homeLeagueTeamId: myLeagueTeamId }, { awayLeagueTeamId: myLeagueTeamId }],
      },
    }),
    prisma.allStarWeekend.findUnique({
      where: { leagueId_season: { leagueId: league.id, season: league.currentSeason } },
    }),
    // Finances as a Gameplay Pillar (Phase 1) - mirrors the All-Star-weekend
    // pending check, see standings/page.tsx.
    prisma.businessDecision.findFirst({
      where: {
        leagueId: league.id,
        leagueTeamId: myLeagueTeamId,
        status: "PENDING",
        severity: "BREAKING",
      },
      select: { id: true },
    }),
  ]);

  const dayIndexedGames = myGames.filter((g) => g.dayIndex !== null);

  const scheduleGames: ScheduleGame[] = dayIndexedGames.map((g) => {
    const isHome = g.homeLeagueTeamId === myLeagueTeamId;
    const opponent = isHome ? g.awayTeam : g.homeTeam;
    const myScore = isHome ? g.homeScore : g.awayScore;
    const opponentScore = isHome ? g.awayScore : g.homeScore;
    return {
      date: dayIndexToDate(league.currentSeason, g.dayIndex!),
      opponentLabel: `${opponent.team.city} ${opponent.team.name}`,
      opponentLogoUrl: opponent.team.logoUrl,
      isHome,
      won: myScore !== null && opponentScore !== null ? myScore > opponentScore : null,
      teamScore: myScore,
      opponentScore,
    };
  });

  // "Today" - the day of this team's earliest still-unplayed game, or the
  // day after their last game if the season is fully done for them.
  const nextUnplayed = dayIndexedGames.find((g) => g.playedAt === null);
  const today = nextUnplayed
    ? dayIndexToDate(league.currentSeason, nextUnplayed.dayIndex!)
    : dayIndexedGames.length > 0
      ? (() => {
          const lastDayIndex = Math.max(...dayIndexedGames.map((g) => g.dayIndex!));
          const d = dayIndexToDate(league.currentSeason, lastDayIndex);
          d.setDate(d.getDate() + 1);
          return d;
        })()
      : dayIndexToDate(league.currentSeason, 1);

  const monthRange = getSeasonMonthRange(
    dayIndexedGames.map((g) => ({ dayIndex: g.dayIndex! })),
    league.currentSeason,
  );

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} Schedule
      </h1>
      <p className="mt-2 max-w-2xl text-muted">
        Every game on your team&apos;s regular-season calendar - faded opponent logos for games yet
        to be played, a W or L once they&apos;re simulated.
      </p>

      <div className="mt-8">
        <ScheduleExperience
          leagueId={league.id}
          season={league.currentSeason}
          initialGames={scheduleGames}
          initialToday={today}
          monthRange={monthRange}
          gamesRemaining={gamesRemaining}
          allStarWeekendPending={pendingWeekend?.status === "PENDING"}
          businessDecisionPending={!!pendingBreakingDecision}
        />
      </div>
    </main>
  );
}
