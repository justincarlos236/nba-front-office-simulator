import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeLeaguePhase } from "@/lib/league/leaguePhase";
import { ensureDraftClassGenerated } from "@/lib/actions/draftClass";
import { getScoutingBudgetSummary } from "@/lib/actions/scoutingAssignments";
import { computeTeamDraftContexts } from "@/lib/gm/teamDraftContext";
import { DraftExperience } from "@/components/draft/DraftExperience";
import { PreDraftScoutingView } from "@/components/draft/PreDraftScoutingView";
import type { DraftTeamContextInfo, DraftTeamInfo } from "@/components/draft/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DraftPage({ params }: PageProps) {
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

  const phase = await computeLeaguePhase(league.id, season);

  // self-heals a save reaching the
  // pre-draft window (or, for a save created before this shipped, the
  // draft itself) without the class having been generated yet. Same
  // lazy-generation convention as `ensureStaffGenerated` on the Staff
  // page. A no-op once the class already exists.
  if (phase === "pre-draft" || phase === "draft-incomplete") {
    await ensureDraftClassGenerated(league.id, season);
  }

  const [draftPicks, draftProspects, bookmarks, scoutingBudget] = await Promise.all([
    // A future-pick placeholder always exists by now; filter to
    // only this season's actually-started picks, which is what
    // `DraftExperience` uses to decide whether the draft has begun.
    prisma.draftPick.findMany({
      where: { leagueId: league.id, season, overallPickNumber: { not: null } },
      orderBy: { overallPickNumber: "asc" },
    }),
    prisma.draftProspect.findMany({ where: { leagueId: league.id, season } }),
    prisma.draftProspectBookmark.findMany({
      where: { leagueId: league.id, season },
      orderBy: { boardRank: "asc" },
    }),
    // only meaningful once the class
    // exists, but cheap enough (one extra query) to just always fetch
    // alongside everything else rather than branching the Promise.all.
    getScoutingBudgetSummary(league.id, season),
  ]);

  const gatePhase: "regular-season" | "playoffs-incomplete" | "active" =
    phase === "regular-season" || phase === "playoffs-incomplete" ? phase : "active";

  const prospectDTOs = draftProspects.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    position: p.position,
    age: p.age,
    overallRating: p.overallRating,
    potentialRating: p.potentialRating,
    heightInches: p.heightInches,
    weightLbs: p.weightLbs,
    collegeOrTeam: p.collegeOrTeam,
    isInternational: p.isInternational,
    nationality: p.nationality,
    pathway: p.pathway,
    comparisonPlayerName: p.comparisonPlayerName,
    scoutingDepth: p.scoutingDepth,
    resolvedHiddenTraits: p.resolvedHiddenTraits,
    classCharacter: p.classCharacter,
  }));

  const teamsById: Record<string, DraftTeamInfo> = {};
  for (const lt of league.teams) {
    teamsById[lt.id] = {
      city: lt.team.city,
      name: lt.team.name,
      logoUrl: lt.team.logoUrl,
      primaryColor: lt.team.primaryColor,
      secondaryColor: lt.team.secondaryColor,
    };
  }

  // Every team's identity (contend/rebuild) and positional needs, for the
  // broadcast header/order rail/team-needs overview - only worth computing
  // once the draft is actually active, not during the earlier gates.
  const teamContextById: Record<string, DraftTeamContextInfo> = {};
  if (gatePhase === "active") {
    const contexts = await computeTeamDraftContexts(
      league.id,
      season,
      league.teams.map((t) => ({ id: t.id, wins: t.wins, losses: t.losses })),
    );
    for (const [teamId, context] of contexts) teamContextById[teamId] = context;
  }

  return (
    <main className="mx-auto max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{season} NBA Draft</h1>

      {gatePhase === "regular-season" && (
        <div className="mt-8 rounded-[2px] border border-rule bg-field p-6">
          <p className="text-sm text-ink-muted">
            Finish the regular season on the standings page before the draft.
          </p>
        </div>
      )}
      {gatePhase === "playoffs-incomplete" && (
        <div className="mt-8 rounded-[2px] border border-rule bg-field p-6">
          <p className="text-sm text-ink-muted">
            Crown a champion in the playoffs before the draft.
          </p>
        </div>
      )}
      {gatePhase === "active" && draftPicks.length === 0 && (
        <>
          <PreDraftScoutingView
            leagueId={league.id}
            teamsById={teamsById}
            initialProspects={prospectDTOs}
            initialBookmarkedProspectIds={bookmarks.map((b) => b.prospectId)}
            scoutingCapacity={scoutingBudget.capacity}
            initialScoutingAssignmentsRemaining={scoutingBudget.remaining}
          />

          {/* Below the scouting it ends, not above it.
              Running the lottery flips the phase to `draft-incomplete`, at
              which point this page renders `DraftExperience` instead of
              `PreDraftScoutingView` - the whole scouting window closes and any
              unspent assignments are gone. That made it the one irreversible
              action on the page, and it was also the loudest thing on it,
              sitting above everything it would skip. The copy already said
              "scout the class now, then run the lottery when you're ready";
              the order now says the same. */}
          <div className="mt-8 rounded-[2px] border border-team-accent/30 bg-gradient-to-b from-team-accent/10 to-transparent p-6 text-center">
            <p className="text-xs font-semibold tracking-widest text-team-accent uppercase">
              Draft Lottery
            </p>
            <p className="mt-2 text-ink">
              Done scouting? Running the lottery sets the draft order and closes this window - any
              assignments you have left are forfeited.
            </p>
            <Link
              href={`/leagues/${league.id}/draft/lottery`}
              className="mt-4 inline-block rounded-[2px] bg-team-accent px-6 py-3 text-base font-bold text-team-accent-ink transition hover:opacity-90"
            >
              Go to the Draft Lottery
            </Link>
          </div>
        </>
      )}
      {gatePhase === "active" && draftPicks.length > 0 && (
        <DraftExperience
          leagueId={league.id}
          season={season}
          userTeamId={userTeamId}
          teamsById={teamsById}
          teamContextById={teamContextById}
          initialPicks={draftPicks.map((p) => ({
            id: p.id,
            round: p.round,
            overallPickNumber: p.overallPickNumber!,
            leagueTeamId: p.currentOwnerId,
            selectedProspectId: p.selectedProspectId,
          }))}
          initialProspects={prospectDTOs}
          initialBookmarkedProspectIds={bookmarks.map((b) => b.prospectId)}
          initialScoutingAssignmentsRemaining={scoutingBudget.remaining}
        />
      )}
    </main>
  );
}
