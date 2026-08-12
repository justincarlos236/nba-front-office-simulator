import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { computePerformanceScore, scoreToCapFraction } from "@/lib/valuation/playerValue";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { computeReSigningMaxOfferCents } from "@/lib/freeagency/reSigningRights";
import { contractQualityScore, priceContractCents } from "@/lib/contracts/priceContract";
import { resolvePlayerAge, resolvePlayerExperience } from "@/lib/players/age";
import { getSigningExceptionUsage } from "@/lib/actions/signingException";
import { SignOfferForm } from "@/components/freeagency/SignOfferForm";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";

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
  const faAge = resolvePlayerAge(freeAgent.player, league.currentSeason);
  const faExperience = resolvePlayerExperience(freeAgent.player, league.currentSeason);
  const reSigningMaxOfferCents = computeReSigningMaxOfferCents(
    freeAgent.overallRating,
    league.currentSeason,
    faAge,
    faExperience,
    freeAgent.player.position,
  );

  // The number quoted to the user is the number a rival would pay - same
  // pricing function, same inputs. It used to be a raw performance score run
  // through the cap curve with no age term and no rating anchor, so the board
  // could suggest a figure no other club in the league would have offered.
  const stat = freeAgent.player.seasonStats[0];
  const rules = getSeasonCapRules(league.currentSeason);
  const suggestedSalaryCents = BigInt(
    priceContractCents({
      season: league.currentSeason,
      quality: contractQualityScore({
        overallRating: freeAgent.overallRating,
        performanceScore: stat
          ? computePerformanceScore({ ...stat, trueShootingPct: stat.trueShootingPct ?? 0.56 })
          : null,
        gamesPlayed: stat?.gamesPlayed ?? 0,
      }),
      age: faAge,
      yearsOfExperience: faExperience,
      position: freeAgent.player.position,
    }),
  );

  return (
    <main className="mx-auto max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <Link
        href={`/leagues/${league.id}/free-agents`}
        className="text-sm text-ink-muted hover:text-ink"
      >
        &larr; All free agents
      </Link>
      <div className="mt-4 flex items-center gap-4">
        <PlayerAvatar
          photoUrl={freeAgent.player.photoUrl}
          fullName={freeAgent.player.fullName}
          size="lg"
        />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Offer a contract to {freeAgent.player.fullName}
          </h1>
          <p className="mt-2 text-ink-muted">
            {freeAgent.player.position} &middot; Rating {freeAgent.overallRating}
            {stat ? ` · ${stat.pointsPerGame.toFixed(1)} PPG in 2023-24` : ""}
          </p>
        </div>
      </div>
      {hasReSigningRights && (
        <p className="mt-3 inline-block rounded-full bg-positive/15 px-3 py-1 text-xs font-semibold text-positive">
          You hold this player&apos;s Re-Signing Rights - you can exceed the cap to keep them
        </p>
      )}

      <div className="mt-8">
        <SignOfferForm
          season={league.currentSeason}
          leagueId={league.id}
          leaguePlayerId={freeAgent.id}
          playerName={freeAgent.player.fullName}
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
