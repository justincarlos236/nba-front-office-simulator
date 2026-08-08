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
import { SinceYouLeft } from "@/components/dashboard/SinceYouLeft";
import { SimulateControls } from "@/components/simulation/SimulateControls";
import { pickDidYouKnowTip } from "@/lib/gm/didYouKnow";
import { computeLeaguePhase, type LeaguePhase } from "@/lib/league/leaguePhase";
import { getSaveContinuity, markSaveSeen } from "@/lib/league/saveContinuity";
import {
  ButtonLink,
  DataTable,
  Field,
  Label,
  PhaseIndicator,
  StatCell,
  Status,
  Td,
  Th,
  type StatusTone,
} from "@/components/ui/primitives";

const PROJECTION_YEARS_AHEAD = 4;

/**
 * THE WIRE - Desk archetype. See DESIGN.md.
 *
 * The audit found seven equal-weight sections separated only by `mt-6`/`mt-10`,
 * with no phase name, no way to advance the season, no re-orientation for a
 * returning player, and cap figures that lived here while the decisions
 * needing them happened elsewhere. This surface owns those findings.
 *
 * Hierarchy is now explicit: the franchise header states who and when, the
 * dispatch says what changed, "needs you" says what to do, the season control
 * does it, and everything else is supporting material below the fold.
 */

const PHASE_LABEL: Record<LeaguePhase, string> = {
  "regular-season": "Regular season",
  "playoffs-incomplete": "Playoffs",
  "pre-draft": "Pre-draft",
  "draft-incomplete": "Draft",
  ready: "Offseason",
};

const PHASE_EXPECTATION: Record<LeaguePhase, string> = {
  "regular-season": "Play out the schedule",
  "playoffs-incomplete": "Finish the postseason",
  "pre-draft": "Scout the class",
  "draft-incomplete": "Make your picks",
  ready: "Reshape the roster",
};

/** Flexibility grades and job security are state, so they read as semantic tone. */
const GRADE_TONE: Record<string, StatusTone> = {
  A: "positive",
  B: "positive",
  C: "neutral",
  D: "caution",
  F: "negative",
};

const JOB_SECURITY_TONE: Record<JobSecurityLevel, StatusTone> = {
  VERY_SECURE: "positive",
  SECURE: "positive",
  STABLE: "neutral",
  UNDER_PRESSURE: "caution",
  HOT_SEAT: "negative",
  CRITICAL: "signal",
};

const FINANCIAL_HEALTH_TONE: Record<FinancialHealth, StatusTone> = {
  THRIVING: "positive",
  HEALTHY: "positive",
  STABLE: "neutral",
  STRAINED: "caution",
  IN_THE_RED: "negative",
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

  // Franchise Finances - a compact business snapshot for the dashboard.
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
  // page's own already-fetched roster/cap/needs data.
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
  // Onboarding Philosophy Phase 4 - reuses the Action Center's own first-session
  // signal rather than a second "is this day 0" query.
  const isBrandNewSeason = allActionCenterItems.some((i) => i.id === "first-games-not-simulated");

  const [phase, continuity, dashboardGamesRemaining, dashboardWeekend, dashboardBreakingDecision] =
    await Promise.all([
      computeLeaguePhase(league.id, season),
      // Read the diff BEFORE advancing the visit clock below - marking the save
      // seen first would erase the very window this renders.
      getSaveContinuity(league.id, league.lastSeenAt, league.newsReadThroughAt),
      prisma.game.count({
        where: {
          leagueId: league.id,
          season,
          type: "REGULAR_SEASON",
          playedAt: null,
          OR: [
            { homeLeagueTeamId: userLeagueTeam.id },
            { awayLeagueTeamId: userLeagueTeam.id },
          ],
        },
      }),
      prisma.allStarWeekend.findUnique({
        where: { leagueId_season: { leagueId: league.id, season } },
      }),
      prisma.businessDecision.findFirst({
        where: {
          leagueId: league.id,
          leagueTeamId: userLeagueTeam.id,
          status: "PENDING",
          severity: "BREAKING",
        },
        select: { id: true },
      }),
    ]);

  await markSaveSeen(league.id);

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

  const jobSecurity = getJobSecurityLevel(league.ownerConfidence);
  const capStatus = simplifyCapStatus(capSheet.apronLevel);
  const seasonLabel = `${season}-${(season + 1).toString().slice(-2)}`;

  return (
    <main className="flex-1 pb-24">
      {/* THE FRANCHISE. A full-bleed field in the team's own colour - the
          single largest perceptual change from the previous world, where team
          identity was a 4px border stripe. */}
      <header className="border-b border-rule bg-team-accent">
        <div className="mx-auto max-w-300 px-6 py-10 sm:px-8 sm:py-14">
          <p className="text-[11px] font-semibold tracking-[0.09em] text-team-accent-ink/70 uppercase">
            {seasonLabel} season
          </p>
          <h1 className="mt-3 text-[clamp(2.5rem,6vw,4.25rem)] leading-[0.95] font-bold tracking-[-0.02em] text-team-accent-ink">
            {userLeagueTeam.team.city} {userLeagueTeam.team.name}
          </h1>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-4 font-mono text-[clamp(1.5rem,3vw,2.25rem)] tabular-nums text-team-accent-ink">
            {userLeagueTeam.wins}&ndash;{userLeagueTeam.losses}
            {rank > 0 && (
              <span className="font-sans text-[15px] font-medium tracking-normal normal-case text-team-accent-ink/80">
                {ordinal(rank)} in the{" "}
                {userLeagueTeam.team.conference === "EAST" ? "East" : "West"}
              </span>
            )}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-300 px-6 sm:px-8">
        {/* WHERE THE SAVE IS. Five phases gated six systems and were never
            named anywhere inside a league. */}
        <PhaseIndicator
          phase={PHASE_LABEL[phase]}
          expectation={PHASE_EXPECTATION[phase]}
          className="mt-0 border-t-0"
        />

        <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_300px]">
          {/* DECISION COLUMN */}
          <div className="space-y-8">
            <SinceYouLeft continuity={continuity} leagueId={league.id} />

            <ActionCenter
              items={actionCenterItems}
              didYouKnowTip={actionCenterItems.length === 0 ? pickDidYouKnowTip(league.id) : null}
            />

            {dashboardGamesRemaining > 0 && (
              <SimulateControls
                leagueId={league.id}
                gamesRemaining={dashboardGamesRemaining}
                allStarWeekendPending={dashboardWeekend?.status === "PENDING"}
                businessDecisionPending={!!dashboardBreakingDecision}
              />
            )}
          </div>

          {/* FIGURE RAIL. Cap position only. Everything else that used to live
              here became a horizontal band below - four stacked fields in a
              320px column read as a wall of small labels and competed with the
              decision column they were meant to support. */}
          <aside className="lg:sticky lg:top-6">
            <Field label="Cap position" emphasis>
              <StatCell
                label="Cap space"
                value={formatCentsCompact(capSheet.capSpaceCents)}
                size="display"
                tone={capSheet.capSpaceCents > 0n ? "accent" : "ink"}
              />
              <div className="mt-6 space-y-4 border-t border-hairline pt-4">
                <StatCell
                  label="Committed"
                  value={formatCentsCompact(capSheet.committedSalaryCents)}
                />
                <div>
                  <Label>Standing</Label>
                  <p className="mt-2">
                    <Status tone={capStatus === "LUXURY_TAX" ? "caution" : "neutral"}>
                      {CAP_STATUS_LABEL[capStatus]}
                    </Status>
                  </p>
                </div>
                <StatCell label="Roster" value={String(leaguePlayers.length)} />
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
                {CAP_STATUS_DESCRIPTION[capStatus]}{" "}
                <HowDoesThisWork
                  topic="financial-status"
                  className="underline decoration-rule underline-offset-4 hover:text-ink"
                />
              </p>
            </Field>
          </aside>
        </div>

        {/* THE STANDING BAND. Ownership, identity and business - the three
            things that describe your position rather than demand an action.
            Horizontal so they read as peers at a glance, instead of stacking
            into a column of small labels beside the decisions they support. */}
        <section className="mt-12 grid grid-cols-1 gap-px md:grid-cols-3">
          <Field label="Ownership">
            <div className="flex items-baseline justify-between gap-3">
              <Status tone={JOB_SECURITY_TONE[jobSecurity]}>
                {JOB_SECURITY_LABEL[jobSecurity]}
              </Status>
              <span className="font-mono text-[15px] tabular-nums text-ink-muted">
                {league.ownerConfidence}
              </span>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
              {JOB_SECURITY_DESCRIPTION[jobSecurity]}
            </p>
            {currentExpectation && (
              <p className="mt-3 text-[15px] text-ink-muted">
                This season:{" "}
                <span className="text-ink">
                  {EXPECTATION_LEVEL_LABEL[currentExpectation.expectationLevel]}
                </span>
              </p>
            )}
            {league.payrollReductionTargetCents != null &&
              league.payrollDirectiveSeason != null && (
                <p className="mt-3 border-l-2 border-l-caution pl-3 text-[15px] text-ink">
                  Reduce payroll below {formatCentsCompact(league.payrollReductionTargetCents)}{" "}
                  before {league.payrollDirectiveSeason}-
                  {(league.payrollDirectiveSeason + 1).toString().slice(-2)}.
                </p>
              )}
            {league.financialMandateSeason != null && (
              <p className="mt-3 border-l-2 border-l-signal-red pl-3 text-[15px] text-ink">
                Return the franchise to profitability before {league.financialMandateSeason}-
                {(league.financialMandateSeason + 1).toString().slice(-2)}, or your job is at risk.
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-4">
              <HowDoesThisWork topic="owner-confidence" />
              <RetireButton leagueId={league.id} />
            </div>
          </Field>

          <Field label="Identity">
            <p className="text-[15px] font-semibold text-ink">
              {TEAM_IDENTITY_LABEL[teamIdentity]}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
              {teamNeeds.length > 0
                ? `Needs ${teamNeeds
                    .map((n) => TEAM_NEED_LABEL[n])
                    .join(", ")
                    .toLowerCase()}`
                : "No glaring roster needs"}
            </p>
            <Link
              href={`/leagues/${league.id}/trades/new`}
              className="mt-4 inline-block text-[11px] font-semibold tracking-[0.09em] text-team-accent uppercase underline decoration-rule underline-offset-4"
            >
              Work the phones
            </Link>
          </Field>

          <Link href={`/leagues/${league.id}/finances`} className="block">
            <Field label="Business" className="h-full transition-colors hover:bg-raised">
              <Status tone={FINANCIAL_HEALTH_TONE[financialHealth]}>
                {FINANCIAL_HEALTH_LABEL[financialHealth]}
              </Status>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <StatCell
                  label="Franchise value"
                  value={formatFinanceCents(userLeagueTeam.franchiseValueCents)}
                />
                <StatCell
                  label="Cash"
                  value={formatFinanceCents(userLeagueTeam.cashReserveCents)}
                  tone={Number(userLeagueTeam.cashReserveCents) < 0 ? "negative" : "ink"}
                />
                {latestFinancialSnapshot && (
                  <StatCell
                    label={
                      Number(latestFinancialSnapshot.netIncomeCents) < 0 ? "Net loss" : "Net profit"
                    }
                    value={formatFinanceCents(
                      Math.abs(Number(latestFinancialSnapshot.netIncomeCents)),
                    )}
                    tone={
                      Number(latestFinancialSnapshot.netIncomeCents) < 0 ? "negative" : "positive"
                    }
                  />
                )}
              </div>
            </Field>
          </Link>
        </section>

        {/* SUPPORTING MATERIAL. Below the decision layer on purpose. */}
        <section className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-strong pb-3">
            <Label tone="ink">Future flexibility</Label>
            {!isBrandNewSeason && (
              <Status tone={GRADE_TONE[flexibilityGrade.grade] ?? "neutral"}>
                Grade {flexibilityGrade.grade}
              </Status>
            )}
          </div>
          {isBrandNewSeason ? (
            <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-muted">
              Long-term contracts will show up here once your books have some real history -
              nothing to plan around yet on day one.{" "}
              <HowDoesThisWork
                topic="financial-flexibility"
                className="underline decoration-rule underline-offset-4 hover:text-ink"
              />
            </p>
          ) : (
            <>
              <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-ink-muted">
                {flexibilityGrade.summary}{" "}
                <HowDoesThisWork
                  topic="financial-flexibility"
                  className="underline decoration-rule underline-offset-4 hover:text-ink"
                />
              </p>
              <div className="mt-6 grid grid-cols-2 gap-px sm:grid-cols-4">
                {futureProjections.map((projection) => (
                  <div key={projection.season} className="border-t border-rule bg-field p-4">
                    <Label>
                      {projection.season}-{(projection.season + 1).toString().slice(-2)}
                    </Label>
                    <p className="mt-2 font-mono text-[15px] tabular-nums text-ink">
                      {formatCentsCompact(projection.committedSalaryCents)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule-strong pb-3">
            <Label tone="ink">Roster</Label>
            <span className="font-mono text-[11px] tabular-nums text-ink-muted">
              {leaguePlayers.length} under contract
            </span>
          </div>
          <DataTable className="mt-4">
            <thead>
              <tr>
                <Th>Player</Th>
                <Th>Pos</Th>
                <Th numeric>OVR</Th>
                <Th numeric>Pot</Th>
                <Th>Tier</Th>
                <Th>Status</Th>
                <Th numeric>Salary</Th>
                <Th numeric>Thru</Th>
              </tr>
            </thead>
            <tbody>
              {leaguePlayers.map((lp) => {
                const gamesOut =
                  lp.injuryStatus !== "HEALTHY" && lp.injuryReturnsAtGamesPlayed !== null
                    ? Math.max(
                        0,
                        lp.injuryReturnsAtGamesPlayed -
                          (userLeagueTeam.wins + userLeagueTeam.losses),
                      )
                    : 0;
                return (
                  <tr key={lp.id} className="transition-colors hover:bg-raised">
                    <Td>
                      <PlayerChip
                        identity={{ kind: "league", leagueId: league.id, leaguePlayerId: lp.id }}
                        fullName={lp.player.fullName}
                        photoUrl={lp.player.photoUrl}
                        teamPrimaryColor={userLeagueTeam.team.primaryColor}
                        className="font-semibold text-ink"
                      />
                    </Td>
                    <Td className="text-ink-muted">{lp.player.position}</Td>
                    <Td numeric className="text-team-accent">
                      {lp.overallRating}
                    </Td>
                    <Td numeric className="text-ink-muted">
                      {lp.potentialRating}
                    </Td>
                    <Td className="text-[11px] tracking-[0.09em] text-ink-muted uppercase">
                      {PLAYER_VALUE_TIER_LABEL[getPlayerValueTier(lp.overallRating)]}
                    </Td>
                    <Td>
                      {lp.injuryStatus === "HEALTHY" ? (
                        <Status tone="neutral">Healthy</Status>
                      ) : (
                        <Status tone="negative">
                          Out{gamesOut > 0 ? ` · ${gamesOut}g` : ""}
                        </Status>
                      )}
                    </Td>
                    <Td numeric>
                      {lp.contract?.years[0]
                        ? formatCentsCompact(lp.contract.years[0].salaryCents)
                        : "-"}
                    </Td>
                    <Td numeric className="text-ink-muted">
                      {lp.contract?.endSeason ?? "-"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink variant="secondary" href={`/leagues/${league.id}/rotation`}>
              Set the rotation
            </ButtonLink>
            <ButtonLink variant="secondary" href={`/leagues/${league.id}/trades/new`}>
              Propose a trade
            </ButtonLink>
          </div>
        </section>
      </div>
    </main>
  );
}
