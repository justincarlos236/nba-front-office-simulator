import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { computePerformanceScore, scoreToCapFraction } from "@/lib/valuation/playerValue";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { computeReSigningMaxOfferCents } from "@/lib/freeagency/reSigningRights";
import { getSigningExceptionUsage } from "@/lib/actions/signingException";
import { SignOfferForm } from "@/components/freeagency/SignOfferForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; leaguePlayerId: string }>;
}

export default async function SignFreeAgentPage({ params }: PageProps) {
  const { id, leaguePlayerId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  if (!myLeagueTeam) notFound();

  const freeAgent = await prisma.leaguePlayer.findUnique({
    where: { id: leaguePlayerId },
    include: {
      player: { include: { seasonStats: { where: { season: league.currentSeason } } } },
    },
  });
  if (
    !freeAgent ||
    freeAgent.leagueId !== league.id ||
    freeAgent.leagueTeamId !== null ||
    !freeAgent.isActive
  ) {
    notFound();
  }

  const [myPlayers, signingExceptionUsedCents] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId: myLeagueTeam.id },
      include: { contract: { include: { years: { where: { season: league.currentSeason } } } } },
    }),
    getSigningExceptionUsage(myLeagueTeam.id, league.currentSeason),
  ]);
  const capSheet = computeCapSheet({
    season: league.currentSeason,
    contracts: myPlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({ playerId: lp.playerId, salaryCents: lp.contract!.years[0].salaryCents })),
  });

  const hasReSigningRights = freeAgent.reSigningTeamId === myLeagueTeam.id;
  const reSigningMaxOfferCents = computeReSigningMaxOfferCents(
    freeAgent.overallRating,
    league.currentSeason,
  );

  const stat = freeAgent.player.seasonStats[0];
  const rules = getSeasonCapRules(league.currentSeason);
  const suggestedSalaryCents = stat
    ? BigInt(
        Math.round(
          Number(rules.salaryCapCents) *
            scoreToCapFraction(
              computePerformanceScore({ ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 }),
            ),
        ),
      )
    : rules.emptyRosterChargeCents;

  return (
    <main className="mx-auto max-w-2xl flex-1 px-6 py-16">
      <Link
        href={`/leagues/${league.id}/free-agents`}
        className="text-sm text-muted hover:text-foreground"
      >
        &larr; All free agents
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
        Offer a contract to {freeAgent.player.fullName}
      </h1>
      <p className="mt-2 text-muted">
        {freeAgent.player.position} &middot; Rating {freeAgent.overallRating}
        {stat ? ` · ${stat.pointsPerGame.toFixed(1)} PPG in 2023-24` : ""}
      </p>
      {hasReSigningRights && (
        <p className="mt-3 inline-block rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400">
          You hold this player&apos;s Re-Signing Rights - you can exceed the cap to keep them
        </p>
      )}

      <div className="mt-8">
        <SignOfferForm
          season={league.currentSeason}
          leagueId={league.id}
          leaguePlayerId={freeAgent.id}
          suggestedSalaryCents={suggestedSalaryCents.toString()}
          team={{
            apronLevel: capSheet.apronLevel,
            capSpaceCents: capSheet.capSpaceCents.toString(),
            signingExceptionUsedCents: signingExceptionUsedCents.toString(),
          }}
          reSigningRights={{
            held: hasReSigningRights,
            maxOfferCents: reSigningMaxOfferCents.toString(),
          }}
        />
      </div>
    </main>
  );
}
