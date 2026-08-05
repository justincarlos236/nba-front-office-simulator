import { formatFinanceCents } from "@/lib/finances/formatFinance";
import {
  BusinessDecisionInbox,
  type InboxDecision,
} from "@/components/finances/BusinessDecisionInbox";
import type { BusinessDecisionOption } from "@/lib/finances/businessDecisions";
import { financesTabById } from "@/lib/finances/financesTabs";
import {
  requireFinancesContext,
  loadCurrentDayIndex,
  loadPendingDecisions,
  loadActiveSponsorshipDeals,
} from "@/lib/finances/financesPageData";

interface PageProps {
  params: Promise<{ id: string }>;
}

const blurb = financesTabById("inbox").blurb;

export default async function FinancesInboxPage({ params }: PageProps) {
  const { id } = await params;
  const { league, myLeagueTeam } = await requireFinancesContext(id);

  const [currentDayIndex, pendingDecisions, activeSponsorshipDeals] = await Promise.all([
    loadCurrentDayIndex(league.id, league.currentSeason, myLeagueTeam.id),
    loadPendingDecisions(league.id, myLeagueTeam.id),
    loadActiveSponsorshipDeals(league.id, myLeagueTeam.id),
  ]);

  const inboxDecisions: InboxDecision[] = pendingDecisions.map((d) => ({
    id: d.id,
    headline: d.headline,
    body: d.body,
    severity: d.severity,
    options: d.options as unknown as BusinessDecisionOption[],
    daysUntilDeadline: Math.max(0, d.deadlineDayIndex - currentDayIndex),
  }));

  return (
    <div>
      <p className="max-w-2xl text-muted">{blurb}</p>

      <section className="mt-6">
        <BusinessDecisionInbox leagueId={league.id} decisions={inboxDecisions} />
      </section>

      {activeSponsorshipDeals.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Active Sponsorships</h2>
          <p className="mt-1 text-sm text-muted">
            Recurring commercial revenue, applied each season the deal is active for - the lasting
            result of inbox decisions you&apos;ve already made.
          </p>
          <div className="mt-4 space-y-3">
            {activeSponsorshipDeals.map((deal) => (
              <div
                key={deal.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{deal.label}</p>
                  <p className="mt-1 text-xs text-muted">
                    {deal.startSeason}-{(deal.startSeason + 1).toString().slice(-2)} through{" "}
                    {deal.endSeason}-{(deal.endSeason + 1).toString().slice(-2)}
                    {deal.conditionPlayer && (
                      <>
                        {" "}
                        - contingent on{" "}
                        <span className="text-foreground">
                          {deal.conditionPlayer.player.fullName}
                        </span>{" "}
                        staying on the roster
                      </>
                    )}
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-400 tabular-nums">
                  {formatFinanceCents(Number(deal.annualValueCents))}/yr
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
