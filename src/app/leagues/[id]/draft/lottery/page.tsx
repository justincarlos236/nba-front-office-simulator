import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeLeaguePhase } from "@/lib/league/leaguePhase";
import { getSeededLotteryTeams } from "@/lib/draft/draftOrder";
import { getLotteryOverview, detectHeadlineProspect } from "@/lib/draft/lotteryPresentation";
import { DraftLotteryExperience } from "@/components/draft/lottery/DraftLotteryExperience";
import type { DraftLotteryResult, LotteryResultPayload } from "@/lib/actions/draftLottery";
import type { LotteryOverviewTeamDisplay } from "@/components/draft/lottery/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DraftLotteryPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) notFound();

  const season = league.currentSeason;
  const userTeamId = league.userControlledTeamId;
  const phase = await computeLeaguePhase(league.id, season);
  const gatePhase: "regular-season" | "playoffs-incomplete" | "active" =
    phase === "regular-season" || phase === "playoffs-incomplete" ? phase : "active";

  const teamLabelById = new Map(league.teams.map((t) => [t.id, `${t.team.city} ${t.team.name}`]));

  let overviewTeams: LotteryOverviewTeamDisplay[] = [];
  let initialResult: DraftLotteryResult | null = null;

  if (gatePhase === "active") {
    const existingLotteryRows = await prisma.lotteryResult.findMany({
      where: { leagueId: league.id, season },
    });

    if (existingLotteryRows.length > 0) {
      const prospects = await prisma.draftProspect.findMany({
        where: { leagueId: league.id, season },
      });
      const headlineProspect = detectHeadlineProspect(prospects);

      const results: LotteryResultPayload[] = existingLotteryRows
        .map((r) => {
          const currentOwnerTeam = league.teams.find((t) => t.id === r.currentOwnerId)!;
          return {
            currentOwnerTeamId: r.currentOwnerId,
            currentOwnerLabel: teamLabelById.get(r.currentOwnerId) ?? "Unknown",
            logoUrl: currentOwnerTeam.team.logoUrl,
            primaryColor: currentOwnerTeam.team.primaryColor,
            isUserTeam: r.currentOwnerId === userTeamId,
            originalTeamId: r.originalTeamId,
            originalTeamLabel: teamLabelById.get(r.originalTeamId) ?? "Unknown",
            ownedByAnotherTeam: r.originalTeamId !== r.currentOwnerId,
            projectedSeed: r.projectedSeed,
            oddsForNumberOnePickPct: r.oddsForNumberOnePickPct,
            resultPickNumber: r.resultPickNumber,
            movement: r.projectedSeed - r.resultPickNumber,
          };
        })
        .sort((a, b) => a.resultPickNumber - b.resultPickNumber);

      initialResult = { results, headlineProspect };
    } else {
      const round1Series = await prisma.playoffSeries.findMany({
        where: { leagueId: league.id, season, round: 1 },
      });
      const playoffTeamIds = new Set<string>();
      for (const s of round1Series) {
        playoffTeamIds.add(s.higherSeedTeamId);
        playoffTeamIds.add(s.lowerSeedTeamId);
      }

      const seededLotteryTeams = getSeededLotteryTeams(
        league.teams.map((t) => ({ leagueTeamId: t.id, wins: t.wins, losses: t.losses })),
        playoffTeamIds,
      );
      const overview = getLotteryOverview(seededLotteryTeams);

      overviewTeams = overview.map((t) => {
        const team = league.teams.find((lt) => lt.id === t.leagueTeamId)!;
        return {
          currentOwnerTeamId: t.leagueTeamId,
          currentOwnerLabel: teamLabelById.get(t.leagueTeamId) ?? "Unknown",
          logoUrl: team.team.logoUrl,
          primaryColor: team.team.primaryColor,
          isUserTeam: t.leagueTeamId === userTeamId,
          originalTeamId: t.leagueTeamId,
          originalTeamLabel: teamLabelById.get(t.leagueTeamId) ?? "Unknown",
          ownedByAnotherTeam: false,
          projectedSeed: t.seed,
          oddsForNumberOnePickPct: t.oddsForNumberOnePickPct,
        };
      });
    }
  }

  return (
    <main className="mx-auto max-w-4xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {season} NBA Draft Lottery
      </h1>

      {gatePhase === "regular-season" && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Finish the regular season on the standings page before the draft lottery.
          </p>
        </div>
      )}
      {gatePhase === "playoffs-incomplete" && (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Crown a champion in the playoffs before the draft lottery.
          </p>
        </div>
      )}
      {gatePhase === "active" && (
        <div className="mt-8">
          <DraftLotteryExperience
            leagueId={league.id}
            overviewTeams={overviewTeams}
            headlineProspect={initialResult?.headlineProspect ?? null}
            initialResult={initialResult}
          />
        </div>
      )}
    </main>
  );
}
