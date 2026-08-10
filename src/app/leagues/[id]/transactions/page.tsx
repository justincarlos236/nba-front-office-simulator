import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NewsFeed } from "@/components/news/NewsFeed";
import { Label } from "@/components/ui/primitives";
import { computeLeaguePulse, type PulseInjury, type PulseTeam } from "@/lib/news/leaguePulse";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TransactionsPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  // The feed reads events; the pulse reads standings and roster state. Keeping
  // them on different sources is what stops the sidebar from becoming a second
  // copy of the same headlines - see src/lib/news/leaguePulse.ts.
  const [transactions, teams, injured] = await Promise.all([
    prisma.leagueTransaction.findMany({
      where: { leagueId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.leagueTeam.findMany({
      where: { leagueId: id },
      select: {
        id: true,
        wins: true,
        losses: true,
        currentStreak: true,
        team: { select: { city: true, name: true } },
      },
    }),
    prisma.leaguePlayer.findMany({
      where: { leagueId: id, isActive: true, injuryStatus: { not: "HEALTHY" } },
      select: {
        id: true,
        overallRating: true,
        injuryReturnsAtGamesPlayed: true,
        leagueTeamId: true,
        player: { select: { fullName: true } },
        leagueTeam: {
          select: { wins: true, losses: true, team: { select: { city: true, name: true } } },
        },
      },
    }),
  ]);

  const pulseTeams: PulseTeam[] = teams.map((t) => ({
    leagueTeamId: t.id,
    label: `${t.team.city} ${t.team.name}`,
    wins: t.wins,
    losses: t.losses,
    currentStreak: t.currentStreak,
  }));

  const pulseInjuries: PulseInjury[] = injured
    .filter((p) => p.leagueTeamId && p.leagueTeam)
    .map((p) => {
      // `injuryReturnsAtGamesPlayed` is an absolute mark on the team's own
      // schedule, so the remaining count is relative to games they've played.
      const played = (p.leagueTeam!.wins ?? 0) + (p.leagueTeam!.losses ?? 0);
      const remaining =
        p.injuryReturnsAtGamesPlayed === null
          ? null
          : Math.max(0, p.injuryReturnsAtGamesPlayed - played);
      return {
        leaguePlayerId: p.id,
        playerName: p.player.fullName,
        teamLabel: `${p.leagueTeam!.team.city} ${p.leagueTeam!.team.name}`,
        leagueTeamId: p.leagueTeamId!,
        overallRating: p.overallRating,
        gamesRemaining: remaining,
      };
    });

  const pulse = computeLeaguePulse(pulseTeams, pulseInjuries, league.userControlledTeamId);

  return (
    // Ledger container - the wire needs the width the old max-w-4xl denied it,
    // which is what left the right side of this page empty.
    <main className="mx-auto max-w-350 flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <div className="border-b border-rule-strong pb-6">
        <Label tone="accent">The wire</Label>
        <h1 className="mt-3 text-[clamp(1.75rem,3.5vw,2.5rem)] leading-tight font-bold tracking-[-0.02em] text-ink">
          Transactions &amp; News
        </h1>
        <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-ink-muted">
          What is happening across the league, told biggest first - and then the complete record,
          filed day by day, with the routine traffic folded away rather than thrown out.
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="mt-10 rounded-[2px] border border-rule bg-field p-8 text-center">
          <p className="text-ink-muted">
            Nothing on the wire yet - make a move yourself, or simulate some games and let the rest
            of the league start making theirs.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <NewsFeed
            transactions={transactions}
            userTeamId={league.userControlledTeamId}
            leagueId={league.id}
            pulse={pulse}
          />
        </div>
      )}
    </main>
  );
}
