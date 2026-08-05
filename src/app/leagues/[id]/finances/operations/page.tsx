import { BusinessStrategyControls } from "@/components/finances/BusinessStrategyControls";
import { DepartmentBudgetControls } from "@/components/finances/DepartmentBudgetControls";
import type { DepartmentBudget } from "@/lib/finances/departments";
import { financesTabById } from "@/lib/finances/financesTabs";
import { requireFinancesContext } from "@/lib/finances/financesPageData";

interface PageProps {
  params: Promise<{ id: string }>;
}

const blurb = financesTabById("operations").blurb;

export default async function FinancesOperationsPage({ params }: PageProps) {
  const { id } = await params;
  const { league, myLeagueTeam } = await requireFinancesContext(id);

  const myDepartmentBudget: DepartmentBudget = {
    scouting: myLeagueTeam.scoutingLevel,
    playerDevelopment: myLeagueTeam.playerDevelopmentLevel,
    sportsScience: myLeagueTeam.sportsScienceLevel,
    analytics: myLeagueTeam.analyticsLevel,
    marketing: myLeagueTeam.marketingLevel,
    coachingSupport: myLeagueTeam.coachingSupportLevel,
  };

  return (
    <div>
      <p className="max-w-2xl text-muted">{blurb}</p>

      {/* Business strategy - ticket pricing */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-foreground">Business strategy</h2>
        <p className="mt-1 text-sm text-muted">
          Your pricing lever. A real trade-off - there are no free wins here.
        </p>
        <div className="mt-4">
          <BusinessStrategyControls
            leagueId={league.id}
            initial={{ ticketPricingPosture: myLeagueTeam.ticketPricingPosture }}
          />
        </div>
      </section>

      {/* Front Office Departments */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Front Office Departments</h2>
        <p className="mt-1 text-sm text-muted">
          A zero-sum operations budget across 6 departments. Each has a distinct identity - see
          which trade-offs fit how you want to run the franchise.
        </p>
        <div className="mt-4">
          <DepartmentBudgetControls leagueId={league.id} initial={myDepartmentBudget} />
        </div>
      </section>

      {/* Season tickets */}
      <section className="mt-10 rounded-xl border border-border bg-surface p-5">
        <p className="text-xs tracking-wide text-muted uppercase">Season-Ticket Base</p>
        <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
          {myLeagueTeam.seasonTicketBase}/100
        </p>
        <p className="mt-2 text-xs text-muted">
          A sticky demand floor under your attendance - grows slowly with winning, happy fans, and
          fair pricing; erodes quickly with a losing team or a pricing gouge.
        </p>
      </section>
    </div>
  );
}
