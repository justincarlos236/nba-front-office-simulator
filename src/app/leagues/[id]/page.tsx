import Link from "next/link";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import {
  CAP_STATUS_LABEL,
  CAP_STATUS_DESCRIPTION,
  simplifyCapStatus,
} from "@/lib/cap/capStatusLabel";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { computeMultiYearProjection } from "@/lib/cap/multiYearProjection";
import { computeFinancialFlexibilityGrade } from "@/lib/cap/financialFlexibilityGrade";
import { formatCentsCompact } from "@/lib/money";
import {
  computeFinancialHealth,
  FINANCIAL_HEALTH_LABEL,
  type FinancialHealth,
} from "@/lib/finances/finances";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import { RetireButton } from "@/components/career/RetireButton";
import { prisma } from "@/lib/prisma";
import { getPlayerValueTier, PLAYER_VALUE_TIER_LABEL } from "@/lib/valuation/playerValueTier";
import {
  getJobSecurityLevel,
  JOB_SECURITY_LABEL,
  JOB_SECURITY_DESCRIPTION,
  type JobSecurityLevel,
} from "@/lib/gm/jobSecurity";
import { EXPECTATION_LEVEL_LABEL } from "@/lib/gm/expectationLevel";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { computeTeamIdentity, TEAM_IDENTITY_LABEL } from "@/lib/gm/teamIdentity";
import { computeTeamNeeds, TEAM_NEED_LABEL } from "@/lib/gm/teamNeeds";
import {
  getActionCenterItems,
  ACTION_CENTER_DISPLAY_LIMIT,
  type ActionCenterRosterPlayer,
} from "@/lib/gm/actionCenter";
import { estimateAge } from "@/lib/players/age";
import { PlayerChip } from "@/components/players/PlayerChip";
import { ActionCenter } from "@/components/dashboard/ActionCenter";
import { pickDidYouKnowTip } from "@/lib/gm/didYouKnow";

const PROJECTION_YEARS_AHEAD = 4;

const GRADE_BADGE_CLASS: Record<string, string> = {
  A: "bg-emerald-500/15 text-emerald-400",
  B: "bg-sky-500/15 text-sky-400",
  C: "bg-purple-500/15 text-purple-400",
  D: "bg-orange-500/15 text-orange-400",
  F: "bg-red-500/15 text-red-400",
};

const JOB_SECURITY_BADGE_CLASS: Record<JobSecurityLevel, string> = {
  VERY_SECURE: "bg-emerald-500/15 text-emerald-400",
  SECURE: "bg-sky-500/15 text-sky-400",
  STABLE: "bg-purple-500/15 text-purple-400",
  UNDER_PRESSURE: "bg-orange-500/15 text-orange-400",
  HOT_SEAT: "bg-red-500/15 text-red-400",
  CRITICAL: "bg-red-600/20 text-red-500",
};

const FINANCIAL_HEALTH_BADGE_CLASS: Record<FinancialHealth, string> = {
  THRIVING: "bg-emerald-500/15 text-emerald-400",
  HEALTHY: "bg-emerald-500/15 text-emerald-400",
  STABLE: "bg-sky-500/15 text-sky-400",
  STRAINED: "bg-amber-500/15 text-amber-400",
  IN_THE_RED: "bg-red-600/20 text-red-500",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function conferenceRank(
  teams: { id: string; conference: string; wins: number; losses: number }[],
  teamId: string,
  conference: string,
): number {
  const sorted = [...teams]
    .filter((t) => t.conference === conference)
    .sort((a, b) => {
      const pctA = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
      const pctB = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
      return pctB - pctA;
    });
  return sorted.findIndex((t) => t.id === teamId) + 1;
}

export default async function LeagueDashboardPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id },
    include: { teams: { include: { team: true } } },
  });

  // Authz: 404 instead of 403 so a non-owner can't even tell the league exists.
  if (!league || league.ownerId !== session.user.id) notFound();

  const userLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  if (!userLeagueTeam) notFound();

  const season = league.currentSeason;

  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: userLeagueTeam.id },
    include: {
      player: true,
      contract: { include: { years: { where: { season } } } },
    },
    orderBy: { overallRating: "desc" },
  });

  const currentExpectation = await prisma.seasonExpectation.findUnique({
    where: { leagueId_season: { leagueId: league.id, season } },
  });

  // Franchise Finances - a compact business snapshot for the dashboard card.
  const latestFinancialSnapshot = await prisma.financialSnapshot.findFirst({
    where: { leagueId: league.id, leagueTeamId: userLeagueTeam.id },
    orderBy: { season: "desc" },
  });
  const financialHealth = computeFinancialHealth(
    Number(userLeagueTeam.cashReserveCents),
    latestFinancialSnapshot ? Number(latestFinancialSnapshot.netIncomeCents) : 0,
  );

  // Team identity/needs (Phase 11b) - the lens the trade-AI evaluation
  // engine (11c) reasons through.
  const competitivenessPercentiles = await computeCompetitivenessPercentiles(league.teams);
  const competitivenessPercentile = competitivenessPercentiles.get(userLeagueTeam.id) ?? 1;

  const avgRosterAge =
    leaguePlayers.length > 0
      ? leaguePlayers.reduce((sum, lp) => sum + estimateAge(lp.player.draftYear, season), 0) /
        leaguePlayers.length
      : 27;

  const teamIdentity = computeTeamIdentity(competitivenessPercentile, avgRosterAge);
  const teamNeeds = computeTeamNeeds(
    leaguePlayers.map((lp) => ({ position: lp.player.position, overallRating: lp.overallRating })),
  );

  const futureContractYears = await prisma.contractYear.findMany({
    where: {
      season: { in: Array.from({ length: PROJECTION_YEARS_AHEAD }, (_, i) => season + 1 + i) },
      contract: { leagueTeamId: userLeagueTeam.id },
    },
    select: { season: true, salaryCents: true },
  });

  const capSheet = computeCapSheet({
    season: league.currentSeason,
    contracts: leaguePlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({
        playerId: lp.playerId,
        salaryCents: lp.contract!.years[0].salaryCents,
      })),
  });

  // Action Center (Phase 2 of the onboarding/flow work) - reuses this
  // page's own already-fetched roster/cap/needs data, no extra queries
  // beyond the small set `getActionCenterItems` runs itself.
  const actionCenterRoster: ActionCenterRosterPlayer[] = leaguePlayers.map((lp) => ({
    fullName: lp.player.fullName,
    overallRating: lp.overallRating,
    injuryStatus: lp.injuryStatus,
    contractEndSeason: lp.contract?.endSeason ?? null,
    morale: lp.morale,
    tradeRequestActive: lp.tradeRequestActive,
    rotation: {
      leaguePlayerId: lp.id,
      fullName: lp.player.fullName,
      overallRating: lp.overallRating,
      position: lp.player.position,
      realStat: null,
      rotationSlot: lp.rotationSlot,
      targetMinutesPerGame: lp.targetMinutesPerGame,
    },
  }));
  const allActionCenterItems = await getActionCenterItems(league.id, league, {
    totalSalaryCents: capSheet.totalSalaryCents,
    capSpaceCents: capSheet.capSpaceCents,
    simpleCapStatus: simplifyCapStatus(capSheet.apronLevel),
    teamNeeds,
    roster: actionCenterRoster,
  });
  const actionCenterItems = allActionCenterItems.slice(0, ACTION_CENTER_DISPLAY_LIMIT);
  // Onboarding Philosophy Phase 4 (docs/ONBOARDING_DESIGN.md Part 1.4 "too
  // early") - reuses the Action Center's own first-session signal rather
  // than a second "is this day 0" query, so there's exactly one place that
  // decides what counts as brand-new.
  const isBrandNewSeason = allActionCenterItems.some((i) => i.id === "first-games-not-simulated");

  const futureProjections = computeMultiYearProjection(
    futureContractYears,
    season + 1,
    PROJECTION_YEARS_AHEAD,
  );
  const flexibilityGrade = computeFinancialFlexibilityGrade(
    capSheet.apronLevel,
    futureProjections,
    leaguePlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({
        currentSalaryCents: lp.contract!.years[0].salaryCents,
        yearsRemaining: lp.contract!.endSeason - season + 1,
      })),
    getSeasonCapRules(season).salaryCapCents,
  );

  const rank = conferenceRank(
    league.teams.map((t) => ({
      id: t.id,
      conference: t.team.conference,
      wins: t.wins,
      losses: t.losses,
    })),
    userLeagueTeam.id,
    userLeagueTeam.team.conference,
  );
  return (
    <main className="mx-auto max-w-6xl flex-1 px-6 py-16">
      <div
        className="border-l-4 pl-4"
        style={{ borderLeftColor: userLeagueTeam.team.primaryColor }}
      >
        <p className="text-sm text-muted">
          {league.currentSeason}-{(league.currentSeason + 1).toString().slice(-2)} season &middot;{" "}
          {userLeagueTeam.wins}-{userLeagueTeam.losses}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {userLeagueTeam.team.city} {userLeagueTeam.team.name}
        </h1>
      </div>

      <div className="mt-10">
        <ActionCenter
          items={actionCenterItems}
          didYouKnowTip={actionCenterItems.length === 0 ? pickDidYouKnowTip(league.id) : null}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <OverviewCard
          href={`/leagues/${league.id}/standings`}
          label="Conference rank"
          headline={rank > 0 ? `${ordinal(rank)} in ${userLeagueTeam.team.conference}` : "-"}
          detail={`${userLeagueTeam.wins}-${userLeagueTeam.losses}`}
        />
        <OverviewCard
          href={`/leagues/${league.id}/rotation`}
          label="Rotation"
          headline="Set your starting five, bench, and minutes"
        />
        <OverviewCard
          href={`/leagues/${league.id}/trades/new`}
          label="Team identity"
          headline={TEAM_IDENTITY_LABEL[teamIdentity]}
          detail={
            teamNeeds.length > 0
              ? `Needs: ${teamNeeds.map((n) => TEAM_NEED_LABEL[n]).join(", ")}`
              : "No glaring roster needs"
          }
        />
      </div>

      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CapStat
          label="Committed salary"
          value={formatCentsCompact(capSheet.committedSalaryCents)}
        />
        <CapStat label="Cap space" value={formatCentsCompact(capSheet.capSpaceCents)} />
        <CapStat
          label="Financial status"
          value={CAP_STATUS_LABEL[simplifyCapStatus(capSheet.apronLevel)]}
        />
        <CapStat label="Roster size" value={String(leaguePlayers.length)} />
      </div>
      <p className="mt-3 text-sm text-muted">
        {CAP_STATUS_DESCRIPTION[simplifyCapStatus(capSheet.apronLevel)]}{" "}
        <HowDoesThisWork topic="financial-status" className="underline hover:text-foreground" />
      </p>

      {isBrandNewSeason ? (
        // Onboarding Philosophy Phase 4 (docs/ONBOARDING_DESIGN.md Beat 2 /
        // Part 1.4 "too early") - a 4-year projection with a letter grade
        // isn't actionable before a single game or roster move has
        // happened. Never hard-hidden (same "nothing ever hidden, only
        // de-emphasized" rule as the sub-nav) - still visible, just not
        // shouting for attention on day one.
        <div className="mt-10 rounded-xl border border-dashed border-border bg-surface p-5">
          <h2 className="font-semibold text-foreground">Future Financial Flexibility</h2>
          <p className="mt-1 text-sm text-muted">
            Long-term contracts will show up here once your books have some real history - nothing
            to plan around yet on day one.{" "}
            <HowDoesThisWork
              topic="financial-flexibility"
              className="underline hover:text-foreground"
            />
          </p>
        </div>
      ) : (
        <div className="mt-10 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold text-foreground">Future Financial Flexibility</h2>
              <p className="mt-1 text-sm text-muted">{flexibilityGrade.summary}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1.5 text-lg font-bold ${GRADE_BADGE_CLASS[flexibilityGrade.grade]}`}
            >
              {flexibilityGrade.grade}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {futureProjections.map((projection) => (
              <div key={projection.season} className="rounded-lg border border-border p-3">
                <p className="text-xs tracking-wide text-muted uppercase">
                  {projection.season}-{(projection.season + 1).toString().slice(-2)}
                </p>
                <p className="mt-1 font-mono text-foreground">
                  {formatCentsCompact(projection.committedSalaryCents)}
                </p>
                <p className="text-xs text-muted">committed</p>
              </div>
            ))}
          </div>
          <HowDoesThisWork
            topic="financial-flexibility"
            className="mt-3 inline-block text-xs text-muted underline hover:text-foreground"
          />
        </div>
      )}

      <div id="gm-job-security" className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-foreground">GM Job Security</h2>
            <p className="mt-1 text-sm text-muted">
              {JOB_SECURITY_DESCRIPTION[getJobSecurityLevel(league.ownerConfidence)]}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${
              JOB_SECURITY_BADGE_CLASS[getJobSecurityLevel(league.ownerConfidence)]
            }`}
          >
            {JOB_SECURITY_LABEL[getJobSecurityLevel(league.ownerConfidence)]}
          </span>
        </div>
        {currentExpectation && (
          <p className="mt-3 text-sm text-muted">
            This season&apos;s expectation:{" "}
            <span className="text-foreground">
              {EXPECTATION_LEVEL_LABEL[currentExpectation.expectationLevel]}
            </span>
          </p>
        )}
        {league.payrollReductionTargetCents != null && league.payrollDirectiveSeason != null && (
          <p className="mt-2 text-sm text-orange-400">
            Ownership directive: reduce payroll below{" "}
            {formatCentsCompact(league.payrollReductionTargetCents)} before the{" "}
            {league.payrollDirectiveSeason}-
            {(league.payrollDirectiveSeason + 1).toString().slice(-2)} season.
          </p>
        )}
        {league.financialMandateSeason != null && (
          <p className="mt-2 text-sm text-red-400">
            Financial mandate: return the franchise to profitability before the{" "}
            {league.financialMandateSeason}-
            {(league.financialMandateSeason + 1).toString().slice(-2)} season, or your job is at
            risk.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-4">
          <HowDoesThisWork topic="owner-confidence" />
          <RetireButton leagueId={league.id} />
        </div>
      </div>

      <Link
        href={`/leagues/${league.id}/finances`}
        className="mt-6 block rounded-xl border border-border bg-surface p-5 transition hover:bg-surface-2"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-foreground">Franchise Finances</h2>
            <p className="mt-1 text-sm text-muted">
              Franchise value {formatFinanceCents(userLeagueTeam.franchiseValueCents)} · Cash{" "}
              <span
                className={Number(userLeagueTeam.cashReserveCents) < 0 ? "text-red-400" : undefined}
              >
                {formatFinanceCents(userLeagueTeam.cashReserveCents)}
              </span>
              {latestFinancialSnapshot && (
                <>
                  {" · "}
                  <span
                    className={
                      Number(latestFinancialSnapshot.netIncomeCents) < 0
                        ? "text-red-400"
                        : "text-emerald-400"
                    }
                  >
                    {Number(latestFinancialSnapshot.netIncomeCents) < 0
                      ? "Net loss "
                      : "Net profit "}
                    {formatFinanceCents(Math.abs(Number(latestFinancialSnapshot.netIncomeCents)))}
                  </span>
                </>
              )}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${FINANCIAL_HEALTH_BADGE_CLASS[financialHealth]}`}
          >
            {FINANCIAL_HEALTH_LABEL[financialHealth]}
          </span>
        </div>
      </Link>

      <div className="mt-10 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Pos</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3 text-right">Potential</th>
              <th className="px-4 py-3">Value Tier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Salary ({league.currentSeason})</th>
              <th className="px-4 py-3 text-right">Contract thru</th>
            </tr>
          </thead>
          <tbody>
            {leaguePlayers.map((lp) => {
              const gamesRemaining =
                lp.injuryStatus !== "HEALTHY" && lp.injuryReturnsAtGamesPlayed !== null
                  ? Math.max(
                      0,
                      lp.injuryReturnsAtGamesPlayed - (userLeagueTeam.wins + userLeagueTeam.losses),
                    )
                  : 0;
              return (
                <tr key={lp.id} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <PlayerChip
                      identity={{ kind: "league", leagueId: league.id, leaguePlayerId: lp.id }}
                      fullName={lp.player.fullName}
                      photoUrl={lp.player.photoUrl}
                      teamPrimaryColor={userLeagueTeam.team.primaryColor}
                      className="font-medium text-foreground"
                    />
                  </td>
                  <td className="px-4 py-3 text-muted">{lp.player.position}</td>
                  <td className="px-4 py-3 text-right font-mono text-accent">{lp.overallRating}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {lp.potentialRating}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(lp.overallRating)]}
                  </td>
                  <td className="px-4 py-3">
                    {lp.injuryStatus === "HEALTHY" ? (
                      <span className="text-xs text-muted">Healthy</span>
                    ) : (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">
                        Out{gamesRemaining > 0 ? ` · ${gamesRemaining}g` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {lp.contract?.years[0]
                      ? formatCentsCompact(lp.contract.years[0].salaryCents)
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted">
                    {lp.contract?.endSeason ?? "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function CapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-lg text-foreground capitalize">{value}</p>
    </div>
  );
}

function OverviewCard({
  href,
  label,
  headline,
  detail,
  truncate,
}: {
  href: string;
  label: string;
  headline: string;
  detail?: string;
  truncate?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-surface p-4 transition hover:border-accent/40"
    >
      <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
      <p
        className={`mt-1 font-semibold text-foreground transition group-hover:text-accent ${
          truncate ? "truncate" : ""
        }`}
      >
        {headline}
      </p>
      {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
    </Link>
  );
}
