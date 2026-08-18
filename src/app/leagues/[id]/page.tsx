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
import {
  computeExpectationGap,
  EXPECTATION_GAP_NOTE,
  EXPECTATION_GAP_TONE,
} from "@/lib/gm/expectationGap";
import { OWNER_ARCHETYPE_LABEL } from "@/lib/gm/ownerArchetype";
import { OwnershipLetter } from "@/components/ownership/OwnershipLetter";
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
import { FormLine } from "@/components/dashboard/FormLine";
import { SimulateControls } from "@/components/simulation/SimulateControls";
import { pickDidYouKnowTip } from "@/lib/gm/didYouKnow";
import { computeLeaguePhase, type LeaguePhase } from "@/lib/league/leaguePhase";
import { getSaveContinuity, markSaveSeen } from "@/lib/league/saveContinuity";
import { CapThresholdGauge } from "@/components/cap/CapThresholdGauge";
import { ContractLadder } from "@/components/cap/ContractLadder";
import { SeasonRibbon } from "@/components/league/SeasonRibbon";
import { OfficeWindow } from "@/components/environment/OfficeWindow";
import { accentHue, resolveTeamAccent } from "@/lib/design/teamAccent";
import { RosterShape } from "@/components/roster/RosterShape";
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

/**
 * Hosts the sim controls; simulating a stretch of games writes a box score
 * per player per game.
 *
 * Without this the route runs on the platform default, which is short enough
 * that a cold start on a contended database can end the request mid-write.
 * These actions are not transactional end to end, so a timeout does not roll
 * back - it leaves partial state.
 *
 * 60s is the ceiling on Vercel Hobby. If a plan change raises it, raising
 * this is safe; lowering it is not, and the literal must stay statically
 * analyzable (Next.js reads it at build time, so no imported constant).
 */
export const maxDuration = 60;


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

  const [
    phase,
    continuity,
    dashboardGamesRemaining,
    dashboardWeekend,
    dashboardBreakingDecision,
    recentTeamGames,
  ] = await Promise.all([
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
        OR: [{ homeLeagueTeamId: userLeagueTeam.id }, { awayLeagueTeamId: userLeagueTeam.id }],
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
    // The team's own last ten. The decision column had nothing to say about
    // how the team is actually playing, which is the first thing a GM looks
    // at - and the real reason the column read as empty.
    prisma.game.findMany({
      where: {
        leagueId: league.id,
        season,
        playedAt: { not: null },
        OR: [{ homeLeagueTeamId: userLeagueTeam.id }, { awayLeagueTeamId: userLeagueTeam.id }],
      },
      include: {
        homeTeam: { include: { team: true } },
        awayTeam: { include: { team: true } },
      },
      orderBy: { playedAt: "desc" },
      take: 10,
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

  // The window's sky is built from the franchise's own hue rather than an
  // absolute per-phase colour, so it can never clash with the accent field it
  // sits inside. Null for a monochrome franchise (Brooklyn, San Antonio),
  // which falls back to the system's neutral blue - see `skyStops`.
  // Ownership's ask versus what this roster actually is. Derived, not stored:
  // both inputs move on their own schedules and a persisted third value would
  // drift out of step with the two facts it describes.
  const expectationGap = currentExpectation
    ? computeExpectationGap(currentExpectation.expectationLevel, teamIdentity)
    : null;
  const expectationNote = expectationGap ? EXPECTATION_GAP_NOTE[expectationGap] : null;
  const expectationGapTone = expectationGap ? EXPECTATION_GAP_TONE[expectationGap] : "neutral";

  const headerAccentHue = accentHue(
    resolveTeamAccent(userLeagueTeam.team.primaryColor, userLeagueTeam.team.secondaryColor).hex,
  );

  return (
    <main className="flex-1 pb-24">
      {/* THE FRANCHISE. A field in the team's own colour - the single largest
          perceptual change from the previous world, where team identity was a
          4px border stripe.

          Held to the same centred column as every other block on the page
          rather than bleeding to the viewport edges. Full-bleed made the
          colour run out past the content on wide screens and read as a stray
          band behind the layout instead of as the page's own masthead. */}
      <header className="relative isolate">
        {/* THE VIEW. Phase D: the city outside the office, under the light of
            the phase the save is in.

            Confined to a band on the right that the header text never enters,
            rather than washed across the whole field. That is a contrast
            requirement, not a taste one: the team-accent cascade guarantees
            4.5:1 for `--team-accent-ink` against a *solid* accent field, and
            compositing the window under a translucent accent breaks that
            guarantee on 38 of 60 team/phase combinations (worst: LAC at
            3.37:1). Here the accent stays fully opaque everywhere the text
            sits, so the guarantee holds exactly as measured. */}
        {/* Pinned to the same centred column as the header text, so the band
            and the text share one geometry instead of racing each other as the
            viewport changes. `hidden xl:block`: below 1280px the column is
            narrow enough that a long wordmark ("Portland Trail Blazers" at
            4.25rem) would reach the band, so the window simply does not exist
            there rather than being allowed to crowd the name. */}
        <div className="relative mx-auto max-w-300 border-b border-rule bg-team-accent">
          <div className="pointer-events-none absolute inset-0 hidden xl:block">
            {/* Wider than the visible result: the component's radial mask fades
              it to nothing on every side, so the band is the area the dissolve
              works *within*, not a rectangle with an edge. A narrow band would
              clip the falloff back into a hard boundary - the exact defect
              this replaced. */}
            <div className="absolute inset-y-0 right-0 w-[52%]">
              <OfficeWindow
                abbreviation={userLeagueTeam.team.abbreviation}
                relocatedCityName={userLeagueTeam.relocatedCityName}
                phase={phase}
                accentHue={headerAccentHue}
              />
            </div>
          </div>

          <div className="relative px-6 py-10 sm:px-8 sm:py-14">
            <p className="text-[11px] font-semibold tracking-[0.09em] text-team-accent-ink/70 uppercase">
              {seasonLabel} season
            </p>
            {/* `xl:max-w-186` (62% of the 75rem column) keeps the wordmark clear
              of the window band, which occupies the right 34% of this same
              column. Capped on the heading itself rather than on the container,
              so the text stays flush left instead of re-centring. */}
            <h1 className="mt-3 text-[clamp(2.5rem,6vw,4.25rem)] leading-[0.95] font-bold tracking-[-0.02em] text-team-accent-ink xl:max-w-186">
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

        {/* The season as a spine. Games played comes from the team's own
            record, so the fill is real without an extra query. */}
        <SeasonRibbon
          phase={phase}
          gamesPlayed={userLeagueTeam.wins + userLeagueTeam.losses}
          gamesTotal={userLeagueTeam.wins + userLeagueTeam.losses + dashboardGamesRemaining}
          className="mt-6"
        />

        {/* items-start, not stretch: the rail is often taller than the
            decision column (the dispatch renders nothing on a return visit
            with no news), and stretching would leave the shorter column
            padded with dead space rather than simply ending. */}
        <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_300px]">
          {/* DECISION COLUMN */}
          <div className="space-y-8">
            {/* Above the two panels that resize, not below them.
                `Next 10` is the one control a user presses over and over, and
                it used to sit under `SinceYouLeft` - which returns null
                entirely when there is no news - and the action centre, which
                swings between zero and three items. Both change on every
                simulated block, so the button moved under the cursor between
                consecutive presses and had to be re-aimed each time.

                Everything above it now is fixed height for the length of a
                season: the header, the phase indicator and the ribbon. Reading
                order becomes act, then read what happened, which is also the
                right order for the loop this page exists to run. */}
            {dashboardGamesRemaining > 0 && (
              <div data-tour="simulate-controls">
                <SimulateControls
                  leagueId={league.id}
                  gamesRemaining={dashboardGamesRemaining}
                  allStarWeekendPending={dashboardWeekend?.status === "PENDING"}
                  businessDecisionPending={!!dashboardBreakingDecision}
                />
              </div>
            )}

            <SinceYouLeft continuity={continuity} leagueId={league.id} />

            {/* data-tour: spotlight target for the first-session tour
                (src/lib/onboarding/tour.ts). Asserted to exist by
                tour.test.ts - renaming it fails CI rather than silently
                breaking a step. */}
            <div data-tour="action-center">
              <ActionCenter
                items={actionCenterItems}
                didYouKnowTip={actionCenterItems.length === 0 ? pickDidYouKnowTip(league.id) : null}
                hiddenCount={allActionCenterItems.length - actionCenterItems.length}
              />
            </div>

            <FormLine
              leagueId={league.id}
              games={[...recentTeamGames].reverse().map((g) => {
                const isHome = g.homeLeagueTeamId === userLeagueTeam.id;
                const own = (isHome ? g.homeScore : g.awayScore) ?? 0;
                const other = (isHome ? g.awayScore : g.homeScore) ?? 0;
                const opponent = isHome ? g.awayTeam : g.homeTeam;
                return {
                  id: g.id,
                  won: own > other,
                  margin: own - other,
                  opponentAbbreviation: opponent.team.abbreviation,
                  home: isHome,
                };
              })}
            />
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
                {/* Compact: the rail is 300px, too narrow for the threshold
                    scale. The full gauge lives in the decision column. */}
                <CapThresholdGauge
                  season={season}
                  totalSalaryCents={capSheet.totalSalaryCents}
                  compact
                />
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
                {/* Ownership's ask and the team's actual identity were both
                    already on this page, in adjacent fields, with nothing
                    saying they disagreed - so a mandate to contend sitting
                    above the word "Tanking" read as a data bug rather than as
                    the central tension of the job. Naming the gap turns two
                    facts that look broken together into one that means
                    something. Silent when they agree. */}
                {expectationNote && (
                  <span
                    className={`mt-1 block ${
                      expectationGapTone === "negative"
                        ? "text-negative"
                        : expectationGapTone === "caution"
                          ? "text-caution"
                          : "text-ink-muted"
                    }`}
                  >
                    {expectationNote}
                  </span>
                )}
              </p>
            )}
            {/* The demands themselves are rendered as letters in their own
                section below - a directive with your job attached is not a
                footnote in a 300px field. */}
            {(league.payrollReductionTargetCents != null ||
              league.financialMandateSeason != null) && (
              <p className="mt-3 text-[15px] text-ink-muted">
                Ownership has put a demand in writing. See below.
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

        {/* ON THE RECORD. Ownership's standing demands, as the letters they
            are rather than two sentences in the corner of a panel. */}
        {(league.payrollReductionTargetCents != null || league.financialMandateSeason != null) && (
          <section className="mt-16">
            <div className="border-b border-rule-strong pb-3">
              <Label tone="ink">On the record</Label>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {league.payrollReductionTargetCents != null &&
                league.payrollDirectiveSeason != null && (
                  <OwnershipLetter
                    demand={{
                      kind: "payroll",
                      targetCents: league.payrollReductionTargetCents,
                      bySeason: league.payrollDirectiveSeason,
                    }}
                    ownerArchetype={userLeagueTeam.ownerArchetype}
                    ownerArchetypeLabel={OWNER_ARCHETYPE_LABEL[userLeagueTeam.ownerArchetype]}
                    teamLabel={`${userLeagueTeam.team.city} ${userLeagueTeam.team.name}`}
                  />
                )}
              {league.financialMandateSeason != null && (
                <OwnershipLetter
                  demand={{ kind: "profitability", bySeason: league.financialMandateSeason }}
                  ownerArchetype={userLeagueTeam.ownerArchetype}
                  ownerArchetypeLabel={OWNER_ARCHETYPE_LABEL[userLeagueTeam.ownerArchetype]}
                  teamLabel={`${userLeagueTeam.team.city} ${userLeagueTeam.team.name}`}
                />
              )}
            </div>
          </section>
        )}

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
              Long-term contracts will show up here once your books have some real history - nothing
              to plan around yet on day one.{" "}
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
              {/* Four figures in a row is the shape in which a cap cliff is
                  invisible. Drawn against each season's own rising cap. */}
              <ContractLadder projections={futureProjections} className="mt-6" />
            </>
          )}
        </section>

        {/* Where the roster is thin, as a silhouette rather than fifteen rows
            the reader has to hold in their head. */}
        <section className="mt-16 border-t border-rule bg-field p-6">
          <RosterShape
            players={leaguePlayers.map((lp) => ({
              leaguePlayerId: lp.id,
              fullName: lp.player.fullName,
              position: lp.player.position,
              overallRating: lp.overallRating,
              targetMinutesPerGame: lp.targetMinutesPerGame,
            }))}
          />
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
                        <Status tone="negative">Out{gamesOut > 0 ? ` · ${gamesOut}g` : ""}</Status>
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
