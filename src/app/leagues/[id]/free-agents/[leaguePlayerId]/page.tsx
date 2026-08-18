import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { currentSeasonSalaryCents } from "@/lib/contracts/currentSeasonSalary";
import { prisma } from "@/lib/prisma";
import { computeReSigningMaxOfferCents } from "@/lib/freeagency/reSigningRights";
import { resolveFreeAgentMarket } from "@/lib/freeagency/freeAgentMarket";
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
      .map((lp) => ({
        playerId: lp.playerId,
        salaryCents: currentSeasonSalaryCents(lp.contract, league.currentSeason),
      })),
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

  // The quoted figure is the figure he is held to - literally the same call
  // `signFreeAgentAction` makes to decide whether he signs.
  //
  // These were two separate computations, and they disagreed. The page priced
  // him off his in-sim production while the action priced him off his rating
  // alone, and only the action moved the price for rival demand or scaled it
  // into a salary he would actually accept. A user typing the number this page
  // suggested was refused, with no explanation, on every free agent he tried.
  const market = await resolveFreeAgentMarket({
    leagueId: league.id,
    season: league.currentSeason,
    userLeagueTeamId: myLeagueTeam.id,
    freeAgent,
  });
  const suggestedSalaryCents = market.requiredSalaryCents;

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
            {/* The season is read from the record the price was taken off,
                not hardcoded - this said "in 2023-24" for every player,
                including production from a save's tenth season. */}
            {market.pricedOn
              ? ` · ${market.pricedOn.pointsPerGame.toFixed(1)} PPG in ${market.pricedOn.season}-${String((market.pricedOn.season + 1) % 100).padStart(2, "0")}`
              : ""}
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
