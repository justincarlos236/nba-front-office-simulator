import { ArenaCard } from "@/components/finances/ArenaCard";
import { BusinessExpansionCard } from "@/components/finances/BusinessExpansionCard";
import { FinancingCard } from "@/components/finances/FinancingCard";
import {
  ARENA_PROJECT_KINDS,
  BUSINESS_EXPANSION_PROJECT_KINDS,
} from "@/lib/finances/capitalProjects";
import {
  computeAnnualInterestCents,
  isDistressedFinancingEligible,
} from "@/lib/finances/financing";
import { financesTabById } from "@/lib/finances/financesTabs";
import {
  requireFinancesContext,
  loadCapitalProjects,
  loadPendingArenaNegotiation,
} from "@/lib/finances/financesPageData";

interface PageProps {
  params: Promise<{ id: string }>;
}

const blurb = financesTabById("arena").blurb;

export default async function FinancesArenaPage({ params }: PageProps) {
  const { id } = await params;
  const { league, myLeagueTeam } = await requireFinancesContext(id);
  const myLeagueTeamId = myLeagueTeam.id;

  const [capitalProjects, pendingArenaFundingNegotiation] = await Promise.all([
    loadCapitalProjects(league.id, myLeagueTeamId),
    loadPendingArenaNegotiation(league.id, myLeagueTeamId),
  ]);

  const cashCents = Number(myLeagueTeam.cashReserveCents);

  const inProgressArenaProject = capitalProjects.find(
    (p) => p.status === "IN_PROGRESS" && ARENA_PROJECT_KINDS.includes(p.kind),
  );
  const inProgressExpansionProject = capitalProjects.find(
    (p) => p.status === "IN_PROGRESS" && BUSINESS_EXPANSION_PROJECT_KINDS.includes(p.kind),
  );
  const completedExpansionKinds = capitalProjects
    .filter((p) => p.status === "COMPLETE" && BUSINESS_EXPANSION_PROJECT_KINDS.includes(p.kind))
    .map((p) => p.kind);
  const annualInterestCents = computeAnnualInterestCents(Number(myLeagueTeam.debtCents));

  return (
    <div>
      <p className="max-w-2xl text-muted">{blurb}</p>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ArenaCard
          leagueId={league.id}
          arenaQualityIndex={myLeagueTeam.arenaQualityIndex}
          arenaAgeSeasons={myLeagueTeam.arenaAgeSeasons}
          arenaLeaseExpiresSeason={myLeagueTeam.arenaLeaseExpiresSeason}
          currentSeason={league.currentSeason}
          inProgressProject={
            inProgressArenaProject
              ? {
                  kind: inProgressArenaProject.kind,
                  completionSeason: inProgressArenaProject.completionSeason,
                }
              : null
          }
          negotiationPending={!!pendingArenaFundingNegotiation}
        />
        <FinancingCard
          leagueId={league.id}
          debtCents={Number(myLeagueTeam.debtCents)}
          annualInterestCents={annualInterestCents}
          distressedFinancingEligible={isDistressedFinancingEligible(cashCents)}
        />
      </section>
      <section className="mt-4">
        <BusinessExpansionCard
          leagueId={league.id}
          inProgressProject={
            inProgressExpansionProject
              ? {
                  kind: inProgressExpansionProject.kind,
                  completionSeason: inProgressExpansionProject.completionSeason,
                }
              : null
          }
          completedKinds={completedExpansionKinds}
        />
      </section>
    </div>
  );
}
