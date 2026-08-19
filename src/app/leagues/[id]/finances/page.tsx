import Link from "next/link";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import { computeAttendancePct, computeFranchisePopularity } from "@/lib/fans/fanHappiness";
import {
  computeFinancialHealth,
  computeSeasonRevenue,
  computeSeasonExpenses,
  computeNetIncome,
  FINANCIAL_HEALTH_LABEL,
  FINANCIAL_HEALTH_DESCRIPTION,
  type FinancialHealth,
} from "@/lib/finances/finances";
import {
  computeFinancialStanding,
  FINANCIAL_STANDING_LABEL,
  FINANCIAL_STANDING_DESCRIPTION,
  type FinancialStanding,
} from "@/lib/finances/ownershipFinance";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import { OWNER_ARCHETYPE_LABEL, OWNER_ARCHETYPE_DESCRIPTION } from "@/lib/gm/ownerArchetype";
import {
  departmentQualityDelta,
  totalDepartmentBudgetCostCents,
  type DepartmentBudget,
} from "@/lib/finances/departments";
import { computeAttendanceFloor } from "@/lib/fans/seasonTickets";
import { computeArenaAttendanceBonus } from "@/lib/finances/arena";
import {
  BusinessDecisionInbox,
  type InboxDecision,
} from "@/components/finances/BusinessDecisionInbox";
import type { BusinessDecisionOption } from "@/lib/finances/businessDecisions";
import {
  requireFinancesContext,
  loadCurrentDayIndex,
  loadPendingDecisions,
  loadSnapshots,
  loadActiveSponsorshipDeals,
  loadProjectionInputs,
  loadBestPlayer,
  loadLeagueFranchiseValues,
} from "@/lib/finances/financesPageData";
import { loadDeadMoneyCents } from "@/lib/cap/deadMoney";

interface PageProps {
  params: Promise<{ id: string }>;
}

const MARKET_SIZE_LABEL: Record<string, string> = {
  LARGE: "Large market",
  MID: "Mid-size market",
  SMALL: "Small market",
};

const HEALTH_ACCENT: Record<FinancialHealth, string> = {
  THRIVING: "text-positive",
  HEALTHY: "text-positive",
  STABLE: "text-ink-muted",
  STRAINED: "text-caution",
  IN_THE_RED: "text-negative",
};
const HEALTH_DOT: Record<FinancialHealth, string> = {
  THRIVING: "bg-positive",
  HEALTHY: "bg-positive",
  STABLE: "bg-raised",
  STRAINED: "bg-caution",
  IN_THE_RED: "bg-negative",
};
const STANDING_ACCENT: Record<FinancialStanding, string> = {
  STRONG: "text-positive",
  SOLID: "text-positive",
  STABLE: "text-ink-muted",
  STRAINED: "text-caution",
  DISTRESSED: "text-negative",
};

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * Overview - the "what do I need to act on, and where do we stand" landing
 * tab. Pending decisions lead (severity-colored, above the fold); the money
 * headline stats and a compact projection follow. Everything else (full P&L
 * history, department budgets, arena/capital) lives one click away on its
 * own tab rather than competing for space here.
 */
export default async function FinancesOverviewPage({ params }: PageProps) {
  const { id } = await params;
  const { league, myLeagueTeam } = await requireFinancesContext(id);
  const myLeagueTeamId = myLeagueTeam.id;

  const [
    currentDayIndex,
    pendingDecisions,
    snapshots,
    activeSponsorshipDeals,
    { currentContractYears, staffContracts },
    bestPlayer,
    leagueValues,
  ] = await Promise.all([
    loadCurrentDayIndex(league.id, league.currentSeason, myLeagueTeamId),
    loadPendingDecisions(league.id, myLeagueTeamId),
    loadSnapshots(league.id, myLeagueTeamId),
    loadActiveSponsorshipDeals(league.id, myLeagueTeamId),
    loadProjectionInputs(league.id, league.currentSeason, myLeagueTeamId),
    loadBestPlayer(myLeagueTeamId),
    loadLeagueFranchiseValues(league.id),
  ]);

  const inboxDecisions: InboxDecision[] = pendingDecisions.map((d) => ({
    id: d.id,
    headline: d.headline,
    body: d.body,
    severity: d.severity,
    options: d.options as unknown as BusinessDecisionOption[],
    daysUntilDeadline: Math.max(0, d.deadlineDayIndex - currentDayIndex),
  }));
  // Overview surfaces only the most urgent decisions; the full inbox (and its
  // "nothing pending" empty state) lives on the Inbox tab.
  const heroDecisions = inboxDecisions.slice(0, 2);

  const marketSize = myLeagueTeam.team.marketSize;
  const cashCents = Number(myLeagueTeam.cashReserveCents);
  const valueCents = Number(myLeagueTeam.franchiseValueCents);
  const latestSnapshot = snapshots.at(-1) ?? null;
  const latestNetIncome = latestSnapshot ? Number(latestSnapshot.netIncomeCents) : 0;
  const health = computeFinancialHealth(cashCents, latestNetIncome);
  const valueRank =
    1 + leagueValues.filter((t) => Number(t.franchiseValueCents) > valueCents).length;

  const myDepartmentBudget: DepartmentBudget = {
    scouting: myLeagueTeam.scoutingLevel,
    playerDevelopment: myLeagueTeam.playerDevelopmentLevel,
    sportsScience: myLeagueTeam.sportsScienceLevel,
    analytics: myLeagueTeam.analyticsLevel,
    marketing: myLeagueTeam.marketingLevel,
    coachingSupport: myLeagueTeam.coachingSupportLevel,
  };

  const starTier = bestPlayer ? getPlayerValueTier(bestPlayer.overallRating) : null;
  const franchisePopularity = computeFranchisePopularity(
    myLeagueTeam.fanHappiness,
    starTier,
    marketSize,
    departmentQualityDelta(myLeagueTeam.marketingLevel),
  );
  const attendancePct = Math.max(
    0,
    Math.min(
      1,
      Math.max(
        computeAttendancePct(myLeagueTeam.fanHappiness, marketSize),
        computeAttendanceFloor(myLeagueTeam.seasonTicketBase),
      ) + computeArenaAttendanceBonus(myLeagueTeam.arenaQualityIndex),
    ),
  );

  // Mid-season projection - a forward look at this season's P&L from the
  // current roster and settings, so finances are legible before advancing.
  const deadMoneyCents = await loadDeadMoneyCents(myLeagueTeam.id, league.currentSeason);
  const projCapSheet = computeCapSheet({
    deadMoneyCents: deadMoneyCents,
    season: league.currentSeason,
    contracts: currentContractYears.map((cy) => ({
      playerId: cy.contract.leaguePlayerId,
      salaryCents: cy.salaryCents,
    })),
  });
  const projStaffCents = staffContracts.reduce((s, c) => s + Number(c.annualSalaryCents), 0);
  const projSponsorshipCents = activeSponsorshipDeals.reduce(
    (sum, d) => sum + Number(d.annualValueCents),
    0,
  );
  const projRevenue = computeSeasonRevenue({
    marketSize,
    attendancePct,
    franchisePopularity,
    starTier,
    ticketPosture: myLeagueTeam.ticketPricingPosture,
    playoffHomeGames: 0,
    wonChampionship: false,
    sponsorshipCents: projSponsorshipCents,
  });
  const projExpenses = computeSeasonExpenses({
    marketSize,
    payrollCents: Number(projCapSheet.totalSalaryCents),
    luxuryTaxLineCents: Number(getSeasonCapRules(league.currentSeason).luxuryTaxCents),
    staffCents: projStaffCents,
    departmentBudgetCostCents: totalDepartmentBudgetCostCents(myDepartmentBudget),
  });
  const projNet = computeNetIncome(projRevenue, projExpenses);

  const standing = computeFinancialStanding(
    [...snapshots].reverse().map((s) => Number(s.netIncomeCents)),
    cashCents,
  );
  const mandateSeason = league.financialMandateSeason;

  return (
    <div>
      <p className="max-w-2xl text-ink-muted">
        {MARKET_SIZE_LABEL[marketSize]} franchise - the business follows what happens on the court.
        Winning, star power, and full arenas drive revenue; heavy spending and the luxury tax drive
        it back down.
      </p>
      {myLeagueTeam.relocatedCityName && (
        <p className="mt-3 rounded-[2px] bg-team-accent/10 px-3 py-2 text-sm text-team-accent">
          Relocated to {myLeagueTeam.relocatedCityName} in {myLeagueTeam.relocatedAtSeason} - a
          permanent, franchise-defining chapter in this team&apos;s history.
        </p>
      )}

      {/* Hero: what needs your attention */}
      {heroDecisions.length > 0 && (
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-ink">Needs your response</h2>
            <Link
              href={`/leagues/${league.id}/finances/inbox`}
              prefetch={false}
              className="text-sm font-semibold text-team-accent hover:underline"
            >
              {inboxDecisions.length > heroDecisions.length
                ? `View all ${inboxDecisions.length} →`
                : "Open inbox →"}
            </Link>
          </div>
          <div className="mt-3">
            <BusinessDecisionInbox leagueId={league.id} decisions={heroDecisions} />
          </div>
        </section>
      )}

      {/* Headline stats */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[2px] border border-rule bg-field p-5">
          <p className="text-xs tracking-wide text-ink-muted uppercase">Financial Health</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[health]}`} />
            <p className={`text-2xl font-bold ${HEALTH_ACCENT[health]}`}>
              {FINANCIAL_HEALTH_LABEL[health]}
            </p>
          </div>
          <p className="mt-2 text-xs text-ink-muted">{FINANCIAL_HEALTH_DESCRIPTION[health]}</p>
        </div>
        <div className="rounded-[2px] border border-rule bg-field p-5">
          <p className="text-xs tracking-wide text-ink-muted uppercase">Franchise Value</p>
          <p className="mt-2 text-2xl font-bold text-ink tabular-nums">
            {formatFinanceCents(valueCents)}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            {ordinal(valueRank)} most valuable of {leagueValues.length}
          </p>
        </div>
        <div className="rounded-[2px] border border-rule bg-field p-5">
          <p className="text-xs tracking-wide text-ink-muted uppercase">Cash Reserve</p>
          <p
            className={`mt-2 text-2xl font-bold tabular-nums ${cashCents < 0 ? "text-negative" : "text-ink"}`}
          >
            {formatFinanceCents(cashCents)}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            {cashCents < 0 ? "Operating in debt" : "Available cushion"}
          </p>
        </div>
      </div>

      {/* Ownership standing */}
      <section className="mt-6 rounded-[2px] border border-rule bg-field p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink">
              Ownership standing:{" "}
              <span className={STANDING_ACCENT[standing]}>
                {FINANCIAL_STANDING_LABEL[standing]}
              </span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              {FINANCIAL_STANDING_DESCRIPTION[standing]}
            </p>
          </div>
        </div>
        {mandateSeason != null && (
          <p className="mt-3 rounded-[2px] bg-negative/10 px-3 py-2 text-sm text-negative">
            Financial mandate: ownership expects the franchise back in the black by the{" "}
            {mandateSeason}-{(mandateSeason + 1).toString().slice(-2)} season. Keep losing money and
            your job is genuinely at risk.
          </p>
        )}
        <div className="mt-4 border-t border-rule pt-4">
          <p className="text-xs tracking-wide text-ink-muted uppercase">Your Owner</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {OWNER_ARCHETYPE_LABEL[myLeagueTeam.ownerArchetype]}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {OWNER_ARCHETYPE_DESCRIPTION[myLeagueTeam.ownerArchetype]}
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Owner since {myLeagueTeam.ownerArchetypeSince}-
            {(myLeagueTeam.ownerArchetypeSince + 1).toString().slice(-2)}
          </p>
        </div>
      </section>

      {/* Compact projection, with a link to the full report */}
      <section className="mt-6 rounded-[2px] border border-rule bg-field p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-ink">Projected this season</h2>
          <span
            className={`text-sm font-semibold tabular-nums ${projNet < 0 ? "text-negative" : "text-positive"}`}
          >
            {projNet < 0 ? "Projected loss " : "Projected profit "}
            {formatFinanceCents(Math.abs(projNet))}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs tracking-wide text-ink-muted uppercase">Revenue</p>
            <p className="mt-1 text-base font-semibold text-positive tabular-nums">
              {formatFinanceCents(projRevenue.totalCents)}
            </p>
          </div>
          <div>
            <p className="text-xs tracking-wide text-ink-muted uppercase">Expenses</p>
            <p className="mt-1 text-base font-semibold text-negative tabular-nums">
              {formatFinanceCents(projExpenses.totalCents)}
            </p>
          </div>
          <div>
            <p className="text-xs tracking-wide text-ink-muted uppercase">Incl. luxury tax</p>
            <p className="mt-1 text-base font-semibold text-ink tabular-nums">
              {formatFinanceCents(projExpenses.luxuryTaxCents)}
            </p>
          </div>
        </div>
        <Link
          href={`/leagues/${league.id}/finances/report`}
          prefetch={false}
          className="mt-4 inline-block text-sm font-semibold text-team-accent hover:underline"
        >
          Full business report →
        </Link>
      </section>
    </div>
  );
}
