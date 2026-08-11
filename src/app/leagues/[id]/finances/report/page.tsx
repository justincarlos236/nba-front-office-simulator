import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  computeAttendancePct,
  computeFranchisePopularity,
  getFranchisePopularityTier,
} from "@/lib/fans/fanHappiness";
import {
  computeSeasonRevenue,
  computeSeasonExpenses,
  computeNetIncome,
} from "@/lib/finances/finances";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import {
  FinancesTrendChart,
  type FinancesTrendPoint,
} from "@/components/finances/FinancesTrendChart";
import {
  NetIncomeHistoryChart,
  type NetIncomePoint,
} from "@/components/finances/NetIncomeHistoryChart";
import {
  departmentQualityDelta,
  totalDepartmentBudgetCostCents,
  type DepartmentBudget,
} from "@/lib/finances/departments";
import { computeAttendanceFloor } from "@/lib/fans/seasonTickets";
import { computeArenaAttendanceBonus } from "@/lib/finances/arena";
import { financesTabById } from "@/lib/finances/financesTabs";
import {
  requireFinancesContext,
  loadSnapshots,
  loadActiveSponsorshipDeals,
  loadProjectionInputs,
  loadBestPlayer,
} from "@/lib/finances/financesPageData";

interface PageProps {
  params: Promise<{ id: string }>;
}

const blurb = financesTabById("report").blurb;

interface BreakdownRow {
  label: string;
  cents: number;
}

function BreakdownBars({
  rows,
  total,
  color,
}: {
  rows: BreakdownRow[];
  total: number;
  color: string;
}) {
  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.cents / total) * 100) : 0;
        return (
          <div key={row.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-ink">{row.label}</span>
              <span className="font-medium text-ink tabular-nums">
                {formatFinanceCents(row.cents)}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-raised">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function FinancesReportPage({ params }: PageProps) {
  const { id } = await params;
  const { league, myLeagueTeam } = await requireFinancesContext(id);
  const myLeagueTeamId = myLeagueTeam.id;

  const [snapshots, activeSponsorshipDeals, { currentContractYears, staffContracts }, bestPlayer] =
    await Promise.all([
      loadSnapshots(league.id, myLeagueTeamId),
      loadActiveSponsorshipDeals(league.id, myLeagueTeamId),
      loadProjectionInputs(league.id, league.currentSeason, myLeagueTeamId),
      loadBestPlayer(myLeagueTeamId),
    ]);

  const marketSize = myLeagueTeam.team.marketSize;
  const cashCents = Number(myLeagueTeam.cashReserveCents);
  const latestSnapshot = snapshots.at(-1) ?? null;

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
  const popularityTier = getFranchisePopularityTier(franchisePopularity);

  const trendPoints: FinancesTrendPoint[] = snapshots.map((s) => ({
    season: s.season,
    franchiseValue: Number(s.franchiseValueCents) / 100,
    netIncome: Number(s.netIncomeCents) / 100,
  }));
  const netIncomePoints: NetIncomePoint[] = snapshots.map((s) => ({
    season: s.season,
    netIncome: Number(s.netIncomeCents) / 100,
  }));

  const projCapSheet = computeCapSheet({
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
  const projEndCash = cashCents + projNet;

  const revenueRows: BreakdownRow[] = latestSnapshot
    ? [
        { label: "Ticket / gate", cents: Number(latestSnapshot.ticketRevenueCents) },
        { label: "Media", cents: Number(latestSnapshot.mediaRevenueCents) },
        { label: "Playoff gate", cents: Number(latestSnapshot.playoffRevenueCents) },
        { label: "League distribution", cents: Number(latestSnapshot.leagueRevenueCents) },
        ...(Number(latestSnapshot.sponsorshipRevenueCents) > 0
          ? [{ label: "Sponsorships", cents: Number(latestSnapshot.sponsorshipRevenueCents) }]
          : []),
        ...(Number(latestSnapshot.otherIncomeCents) > 0
          ? [{ label: "Other business income", cents: Number(latestSnapshot.otherIncomeCents) }]
          : []),
      ]
    : [];
  // Every persisted expense bucket, so the total below actually reconciles
  // with netIncomeCents. Debt interest and resolved business-decision costs
  // were previously omitted, which quietly under-reported expenses for any
  // team carrying debt; the optional ones follow the revenue side's pattern of
  // only appearing when non-zero, so a team with no debt sees no debt row.
  const expenseRows: BreakdownRow[] = latestSnapshot
    ? [
        { label: "Player payroll", cents: Number(latestSnapshot.payrollExpenseCents) },
        { label: "Luxury tax", cents: Number(latestSnapshot.luxuryTaxExpenseCents) },
        ...(Number(latestSnapshot.salaryFloorExpenseCents) > 0
          ? [
              {
                label: "Salary-floor shortfall",
                cents: Number(latestSnapshot.salaryFloorExpenseCents),
              },
            ]
          : []),
        { label: "Staff & coaching", cents: Number(latestSnapshot.staffExpenseCents) },
        { label: "Facilities & investment", cents: Number(latestSnapshot.investmentExpenseCents) },
        { label: "Operations", cents: Number(latestSnapshot.operatingExpenseCents) },
        ...(Number(latestSnapshot.interestExpenseCents) > 0
          ? [{ label: "Debt interest", cents: Number(latestSnapshot.interestExpenseCents) }]
          : []),
        ...(Number(latestSnapshot.otherExpenseCents) > 0
          ? [{ label: "Other business costs", cents: Number(latestSnapshot.otherExpenseCents) }]
          : []),
      ]
    : [];
  const totalRevenue = revenueRows.reduce((s, r) => s + r.cents, 0);
  const totalExpenses = expenseRows.reduce((s, r) => s + r.cents, 0);
  const latestNetIncome = latestSnapshot ? Number(latestSnapshot.netIncomeCents) : 0;

  const demandNote =
    `A ${MARKET_SIZE_LABEL[marketSize].toLowerCase()} with ${popularityTier === "TRENDING" || popularityTier === "STRONG" ? "strong" : popularityTier === "STEADY" ? "steady" : "soft"} ` +
    `fan interest keeps the building about ${Math.round(attendancePct * 100)}% full - the biggest lever on your gate revenue.`;

  const reportSeasonLabel = latestSnapshot
    ? `${latestSnapshot.season}-${(latestSnapshot.season + 1).toString().slice(-2)}`
    : null;

  return (
    <div>
      <p className="max-w-2xl text-ink-muted">{blurb}</p>

      {/* Mid-season projection detail */}
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
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <div>
            <p className="text-xs tracking-wide text-ink-muted uppercase">Projected end cash</p>
            <p
              className={`mt-1 text-base font-semibold tabular-nums ${projEndCash < 0 ? "text-negative" : "text-ink"}`}
            >
              {formatFinanceCents(projEndCash)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          A forward look from your current roster and settings, before advancing. Excludes any
          playoff run (extra home games add gate revenue).
        </p>
      </section>

      {/* Season P&L */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">
            {reportSeasonLabel ? `${reportSeasonLabel} business report` : "Business report"}
          </h2>
          {latestSnapshot && (
            <span
              className={`text-sm font-semibold tabular-nums ${latestNetIncome < 0 ? "text-negative" : "text-positive"}`}
            >
              {latestNetIncome < 0 ? "Net loss " : "Net profit "}
              {formatFinanceCents(Math.abs(latestNetIncome))}
            </span>
          )}
        </div>

        {latestSnapshot ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-[2px] border border-rule bg-field p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-ink">Revenue</p>
                <p className="text-sm font-semibold text-positive tabular-nums">
                  {formatFinanceCents(totalRevenue)}
                </p>
              </div>
              <div className="mt-4">
                <BreakdownBars rows={revenueRows} total={totalRevenue} color="bg-positive/70" />
              </div>
            </div>
            <div className="rounded-[2px] border border-rule bg-field p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold text-ink">Expenses</p>
                <p className="text-sm font-semibold text-negative tabular-nums">
                  {formatFinanceCents(totalExpenses)}
                </p>
              </div>
              <div className="mt-4">
                <BreakdownBars rows={expenseRows} total={totalExpenses} color="bg-negative/60" />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[2px] border border-dashed border-rule bg-field p-8 text-center text-ink-muted">
            Your first full financial report posts when you advance to the next season. Until then,
            here&apos;s where the franchise stands financially.
          </div>
        )}
      </section>

      {/* What drives the business */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">What drives your business</h2>
        <p className="mt-1 text-sm text-ink-muted">{demandNote}</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-[2px] border border-rule bg-field p-4">
            <p className="text-xs tracking-wide text-ink-muted uppercase">Attendance</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {Math.round(attendancePct * 100)}% full
            </p>
          </div>
          <div className="rounded-[2px] border border-rule bg-field p-4">
            <p className="text-xs tracking-wide text-ink-muted uppercase">Franchise Popularity</p>
            <p className="mt-1 text-lg font-semibold text-ink">{franchisePopularity}/100</p>
          </div>
          <div className="rounded-[2px] border border-rule bg-field p-4">
            <p className="text-xs tracking-wide text-ink-muted uppercase">Star Power</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {starTier ? starTier.charAt(0) + starTier.slice(1).toLowerCase() : "None"}
            </p>
          </div>
        </div>
      </section>

      {/* Franchise value trend + profit/loss history */}
      <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">Franchise value over time</h2>
          <div className="mt-3 rounded-[2px] border border-rule bg-field p-4">
            <FinancesTrendChart points={trendPoints} />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">Profit &amp; loss by season</h2>
          <div className="mt-3 rounded-[2px] border border-rule bg-field p-4">
            <NetIncomeHistoryChart points={netIncomePoints} />
          </div>
        </div>
      </section>
    </div>
  );
}

const MARKET_SIZE_LABEL: Record<string, string> = {
  LARGE: "Large market",
  MID: "Mid-size market",
  SMALL: "Small market",
};
