import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  computeAttendancePct,
  computeFranchisePopularity,
  getFranchisePopularityTier,
  type FranchisePopularityTier,
} from "@/lib/fans/fanHappiness";
import { describeFanReaction } from "@/lib/fans/fanReactions";
import { FanHappinessTrendChart } from "@/components/fans/FanHappinessTrendChart";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const MARKET_SIZE_LABEL: Record<string, string> = {
  LARGE: "Large-market franchise",
  MID: "Mid-market franchise",
  SMALL: "Small-market franchise",
};

// One tier drives three labeled facets - see fanHappiness.ts's
// getFranchisePopularityTier doc comment for why these aren't
// independently tracked numbers.
const MERCHANDISE_LABEL: Record<FranchisePopularityTier, string> = {
  TRENDING: "Flying off shelves",
  STRONG: "Strong demand",
  STEADY: "Steady sales",
  SOFT: "Soft demand",
  WEAK: "Struggling",
};
const TICKET_DEMAND_LABEL: Record<FranchisePopularityTier, string> = {
  TRENDING: "Sold out",
  STRONG: "High demand",
  STEADY: "Steady",
  SOFT: "Lagging",
  WEAK: "Wide open",
};
const BUZZ_LABEL: Record<FranchisePopularityTier, string> = {
  TRENDING: "Trending league-wide",
  STRONG: "Active buzz",
  STEADY: "Quiet buzz",
  SOFT: "Minimal chatter",
  WEAK: "Silent",
};

const REACTION_TONE_CLASS: Record<string, string> = {
  POSITIVE: "border-l-4 border-l-emerald-500",
  NEGATIVE: "border-l-4 border-l-red-500",
  NEUTRAL: "",
};

export default async function FansPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) notFound();

  const [myLeagueTeam, bestPlayer, snapshots, transactions] = await Promise.all([
    prisma.leagueTeam.findUniqueOrThrow({
      where: { id: myLeagueTeamId },
      include: { team: true },
    }),
    prisma.leaguePlayer.findFirst({
      where: { leagueTeamId: myLeagueTeamId, isActive: true },
      orderBy: { overallRating: "desc" },
    }),
    prisma.fanHappinessSnapshot.findMany({
      where: { leagueId: league.id, leagueTeamId: myLeagueTeamId },
      orderBy: { season: "asc" },
    }),
    prisma.leagueTransaction.findMany({
      where: { leagueId: league.id, teamIds: { has: myLeagueTeamId } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const starPowerTier = bestPlayer ? getPlayerValueTier(bestPlayer.overallRating) : null;
  const franchisePopularity = computeFranchisePopularity(
    myLeagueTeam.fanHappiness,
    starPowerTier,
    myLeagueTeam.team.marketSize,
  );
  const attendancePct = computeAttendancePct(
    myLeagueTeam.fanHappiness,
    myLeagueTeam.team.marketSize,
  );
  const popularityTier = getFranchisePopularityTier(franchisePopularity);

  const reactions = transactions
    .map((t) => {
      const reaction = describeFanReaction(t);
      return reaction ? { id: t.id, ...reaction } : null;
    })
    .filter((r) => r !== null)
    .slice(0, 25);

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <Link href={`/leagues/${league.id}`} className="text-sm text-muted hover:text-foreground">
        &larr; Back to your team
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Fan Hub</h1>
      <p className="mt-2 max-w-2xl text-muted">
        {MARKET_SIZE_LABEL[myLeagueTeam.team.marketSize]} - your decisions shape how the fanbase
        feels about the franchise, not just the win column.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs tracking-wide text-muted uppercase">Fan Happiness</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{myLeagueTeam.fanHappiness}</p>
          <p className="mt-1 text-xs text-muted">out of 100</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-xs tracking-wide text-muted uppercase">Franchise Popularity</p>
          <p className="mt-1 text-3xl font-bold text-foreground">{franchisePopularity}</p>
          <p className="mt-1 text-xs text-muted">{BUZZ_LABEL[popularityTier]}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Attendance</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {Math.round(attendancePct * 100)}% capacity
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Merchandise</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {MERCHANDISE_LABEL[popularityTier]}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs tracking-wide text-muted uppercase">Season Tickets</p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {TICKET_DEMAND_LABEL[popularityTier]}
          </p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Fan Happiness over time</h2>
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <FanHappinessTrendChart
            points={snapshots.map((s) => ({ season: s.season, fanHappiness: s.fanHappiness }))}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Fan Reactions</h2>
        <p className="mt-1 text-sm text-muted">
          What the fanbase is saying about your recent moves and results.
        </p>
        {reactions.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-surface p-8 text-center text-muted">
            No fan reactions yet - they&apos;ll show up here as your season unfolds.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {reactions.map((r) => (
              <div
                key={r.id}
                className={`rounded-lg border border-border bg-surface p-3 text-sm text-foreground ${REACTION_TONE_CLASS[r.tone]}`}
              >
                {r.text}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
