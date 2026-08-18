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
import { FanHappinessTrendChart } from "@/components/fans/FanHappinessTrendChart";
import { InSeasonSentimentTrendChart } from "@/components/fans/InSeasonSentimentTrendChart";
import { SentimentLedgerSection } from "@/components/fans/SentimentLedgerSection";
import { ReactionFeedSection } from "@/components/fans/ReactionFeedSection";
import { MoodSection } from "@/components/fans/MoodSection";
import { FanCultureSection } from "@/components/fans/FanCultureSection";
import { FanMandateSection } from "@/components/fans/FanMandateSection";
import { NarrativesSection } from "@/components/fans/NarrativesSection";
import { FranchiseMemorySection } from "@/components/fans/FranchiseMemorySection";
import { buildInSeasonTrend, recentTrendDelta } from "@/lib/fans/sentimentLedger";
import { curateFranchiseMemory, relocationMemoryEntry } from "@/lib/fans/franchiseMemory";
import { computeMoodLabel } from "@/lib/fans/moodLabel";
import { explainFanCulture } from "@/lib/fans/fanCulture";
import {
  explainFanMandate,
  LOTTERY_PICK_MAX,
  RECENT_LOTTERY_WINDOW_SEASONS,
} from "@/lib/fans/fanMandate";
import { computeFranchiseIconScore } from "@/lib/finances/franchiseIcon";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { ageFromBirthDate, resolvePlayerAge } from "@/lib/players/age";
import { buildFanCultureHistoryInputs } from "@/lib/actions/fanCulture";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const MARKET_SIZE_LABEL: Record<string, string> = {
  LARGE: "Large-market franchise",
  MID: "Mid-market franchise",
  SMALL: "Small-market franchise",
};

// Merchandise and Season Tickets cards were
// deleted (docs/FANS_PAGE_REDESIGN.md Part 2.1/5): both were the same
// popularity-tier number relabeled, not independent signals, and Season
// Tickets already has a real home on /finances/operations. Popularity's own
// buzz label survives as the one genuinely distinct secondary metric.
const BUZZ_LABEL: Record<FranchisePopularityTier, string> = {
  TRENDING: "Trending league-wide",
  STRONG: "Active buzz",
  STEADY: "Quiet buzz",
  SOFT: "Minimal chatter",
  WEAK: "Silent",
};

export default async function FansPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id } });
  if (!league || league.ownerId !== session.user.id) notFound();

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) notFound();

  const [
    myLeagueTeam,
    bestPlayer,
    snapshots,
    sentimentEvents,
    recentReactionEvents,
    roster,
    recentLotteryPickCount,
    narratives,
    memoryTransactions,
  ] = await Promise.all([
    prisma.leagueTeam.findUniqueOrThrow({
      where: { id: myLeagueTeamId },
      include: {
        team: true,
        fanCulture: true,
        fanMandate: { include: { keepOurGuyPlayer: { include: { player: true } } } },
      },
    }),
    prisma.leaguePlayer.findFirst({
      where: { leagueTeamId: myLeagueTeamId, isActive: true },
      orderBy: { overallRating: "desc" },
    }),
    prisma.fanHappinessSnapshot.findMany({
      where: { leagueId: league.id, leagueTeamId: myLeagueTeamId },
      orderBy: { season: "asc" },
    }),
    // this season's sentiment ledger, for
    // "Why They Feel This Way" and the in-season trend reconstruction.
    prisma.fanSentimentEvent.findMany({
      where: { leagueId: league.id, leagueTeamId: myLeagueTeamId, season: league.currentSeason },
      orderBy: { dayIndex: "asc" },
    }),
    // "Fan Reactions," ordered by recency
    // rather than season, so a trade from just before a season flip
    // doesn't vanish from the feed the moment the season turns over.
    prisma.fanSentimentEvent.findMany({
      where: { leagueId: league.id, leagueTeamId: myLeagueTeamId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    // roster strength/age for explaining
    // the mandate with the same signals the derivation used.
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId: myLeagueTeamId, isActive: true },
      select: { overallRating: true, player: { select: { birthDate: true, draftYear: true } } },
    }),
    prisma.draftPick.count({
      where: {
        leagueId: league.id,
        currentOwnerId: myLeagueTeamId,
        originalTeamId: myLeagueTeamId,
        season: {
          gt: league.currentSeason - RECENT_LOTTERY_WINDOW_SEASONS,
          lte: league.currentSeason,
        },
        overallPickNumber: { lte: LOTTERY_PICK_MAX, not: null },
        selectedProspectId: { not: null },
      },
    }),
    // "The Conversation." Open narratives
    // plus anything resolved this season, so a just-closed story's
    // resolution beat is still visible for one season rather than
    // vanishing the instant it closes.
    prisma.fanNarrative.findMany({
      where: {
        leagueTeamId: myLeagueTeamId,
        OR: [{ status: "OPEN" }, { resolvedSeason: league.currentSeason }],
      },
      orderBy: { openedSeason: "desc" },
    }),
    // "Franchise Memory." Read-only over
    // the existing news log, per the design's "nearly free" framing - no
    // new derivation, just a curated view.
    prisma.leagueTransaction.findMany({
      where: {
        leagueId: league.id,
        teamIds: { has: myLeagueTeamId },
        importance: { in: ["MAJOR", "BREAKING"] },
      },
      orderBy: { season: "desc" },
      select: { id: true, season: true, type: true, description: true, importance: true },
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

  // the two comparison points Section 1's
  // mood label needs. "This stretch" is a real, recent window from the
  // sentiment ledger; "vs. last season" is the prior FanHappinessSnapshot,
  // null for a franchise's first season (nothing to compare against yet).
  const RECENT_TREND_WINDOW_DAYS = 20;
  const trendDelta = recentTrendDelta(sentimentEvents, RECENT_TREND_WINDOW_DAYS);
  const lastSeasonSnapshot = snapshots.at(-1) ?? null;
  const seasonOverSeasonDelta = lastSeasonSnapshot
    ? myLeagueTeam.fanHappiness - lastSeasonSnapshot.fanHappiness
    : null;
  const moodLabel = computeMoodLabel({
    fanHappiness: myLeagueTeam.fanHappiness,
    recentTrendDelta: trendDelta,
    seasonOverSeasonDelta,
  });

  // "who this city has become," explained
  // with the same real facts recomputeFanCultures already used to set the
  // trait numbers (never a second opinion on the derivation).
  const iconScore = bestPlayer
    ? computeFranchiseIconScore({
        starTier: starPowerTier ?? "MINIMUM",
        tenureSeasons:
          bestPlayer.joinedTeamSeason != null
            ? Math.max(0, league.currentSeason - bestPlayer.joinedTeamSeason)
            : 0,
        homegrown: bestPlayer.homegrown,
        careerAwards: 0,
      })
    : 0;
  const cultureHistoryByTeam = await buildFanCultureHistoryInputs(league.id, league.currentSeason, [
    {
      leagueTeamId: myLeagueTeamId,
      marketSize: myLeagueTeam.team.marketSize,
      ticketPricingPosture: myLeagueTeam.ticketPricingPosture,
      hasRelocated: myLeagueTeam.relocatedCityName != null,
      iconScore,
    },
  ]);
  const cultureHistory = cultureHistoryByTeam.get(myLeagueTeamId)!;
  const cultureFacts = explainFanCulture(cultureHistory);

  // "why it's the mandate," reading the same
  // signals recomputeFanMandates used to set it, for whichever mandate is
  // currently persisted on this team.
  const teamStrength = computeTeamStrength(roster.map((p) => p.overallRating));
  const ages = roster.map(
    (p) =>
      ageFromBirthDate(p.player.birthDate, league.currentSeason) ??
      resolvePlayerAge(p.player, league.currentSeason),
  );
  const averageRosterAge = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 26;
  const mandateFacts = myLeagueTeam.fanMandate
    ? explainFanMandate(
        {
          marketSize: myLeagueTeam.team.marketSize,
          seasonOutcomes: cultureHistory.seasonOutcomes,
          teamStrength,
          averageRosterAge,
          recentLotteryPicks: recentLotteryPickCount,
          franchisePopularity,
          patience: myLeagueTeam.fanCulture?.patience ?? 50,
          expectationCeiling: myLeagueTeam.fanCulture?.expectationCeiling ?? 50,
        },
        myLeagueTeam.fanMandate.primary,
      )
    : [];

  // Franchise Memory. The relocation entry
  // (if any) is prepended unconditionally - it outranks the cap.
  const memoryEntries = curateFranchiseMemory(memoryTransactions);
  const relocationEntry = relocationMemoryEntry({
    relocatedCityName: myLeagueTeam.relocatedCityName,
    relocatedAtSeason: myLeagueTeam.relocatedAtSeason,
  });
  const franchiseMemory = relocationEntry ? [relocationEntry, ...memoryEntries] : memoryEntries;

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">Fan Hub</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        {MARKET_SIZE_LABEL[myLeagueTeam.team.marketSize]} - your decisions shape how the fanbase
        feels about the franchise, not just the win column.
      </p>

      <MoodSection
        fanHappiness={myLeagueTeam.fanHappiness}
        moodLabel={moodLabel}
        recentTrendDelta={trendDelta}
        seasonOverSeasonDelta={seasonOverSeasonDelta}
        franchisePopularity={franchisePopularity}
        popularityBuzzLabel={BUZZ_LABEL[popularityTier]}
        attendanceEvidenceLine={`The building is ${Math.round(attendancePct * 100)}% full - fans voting with their wallets, not a metric this page owns (see Finances).`}
      />

      <FanCultureSection
        patience={myLeagueTeam.fanCulture?.patience ?? 50}
        expectationCeiling={myLeagueTeam.fanCulture?.expectationCeiling ?? 50}
        loyalty={myLeagueTeam.fanCulture?.loyalty ?? 50}
        facts={cultureFacts}
      />

      {myLeagueTeam.fanMandate && (
        <FanMandateSection
          mandate={myLeagueTeam.fanMandate.primary}
          satisfaction={myLeagueTeam.fanMandate.satisfaction}
          facts={mandateFacts}
          keepOurGuyPlayerName={
            myLeagueTeam.fanMandate.keepOurGuy
              ? (myLeagueTeam.fanMandate.keepOurGuyPlayer?.player.fullName ?? null)
              : null
          }
        />
      )}

      <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Fan Happiness by season</h2>
          <div className="mt-3 rounded-[2px] border border-rule bg-field p-4">
            <FanHappinessTrendChart
              points={snapshots.map((s) => ({ season: s.season, fanHappiness: s.fanHappiness }))}
            />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">This season, day by day</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Reconstructed from every real event this season - a once-a-year snapshot can&apos;t show
            an in-season collapse or hot streak; this can.
          </p>
          <div className="mt-3 rounded-[2px] border border-rule bg-field p-4">
            <InSeasonSentimentTrendChart
              points={buildInSeasonTrend(sentimentEvents, myLeagueTeam.fanHappiness)}
            />
          </div>
        </div>
      </section>

      <SentimentLedgerSection events={sentimentEvents} />

      <NarrativesSection
        narratives={narratives.map((n) => ({
          id: n.id,
          headline: n.headline,
          body: n.body,
          status: n.status,
          resolutionBeat: n.resolutionBeat,
        }))}
      />

      <ReactionFeedSection events={recentReactionEvents} />

      <FranchiseMemorySection memories={franchiseMemory} />
    </main>
  );
}
