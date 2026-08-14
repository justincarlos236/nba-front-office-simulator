"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  runSeasonFinances,
  teamDepartmentBudget,
  computeTeamSeasonFinances,
  type TeamFinanceDeps,
} from "./offseasonFinances";
import { resolvePlayerAge, resolvePlayerExperience } from "@/lib/players/age";
import { developPlayerRating } from "@/lib/development/developPlayerRating";
import { shouldRetire } from "@/lib/development/retirement";
import {
  computeMVP,
  computeMostImprovedPlayer,
  computeRookieOfTheYear,
  computeDefensivePlayerOfTheYear,
  computeSixthManOfTheYear,
  type PlayerSeasonSnapshot,
  type DefensiveSeasonSnapshot,
  type BenchSeasonSnapshot,
} from "@/lib/development/seasonAwards";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { generateRoundRobinSchedule } from "@/lib/simulation/generateSchedule";
import {
  describeRetirement,
  describeStaffHire,
  describeSigning,
  describePlayerMoraleEvent,
  describeTradeRequest,
} from "@/lib/transactions/describeTransaction";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import type { NewsImportance } from "@/generated/prisma/client";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { getSeasonCapRules, salaryFloorCents } from "@/lib/cap/constants";
import { financialSpendingResistance, TICKET_POSTURE_FAN_DELTA } from "@/lib/finances/finances";
import { computeCpuSponsorshipRevenueCents } from "@/lib/finances/sponsorship";
import { departmentQualityDelta } from "@/lib/finances/departments";
import { computeAttendanceFloor } from "@/lib/fans/seasonTickets";
import { effectiveStaffQuality } from "@/lib/staff/coachModifiers";
import { sumCompletedProjectEffects } from "@/lib/finances/capitalProjects";
import { loanAmountCents } from "@/lib/finances/financing";
import { computeFranchiseIconScore, iconValuePremiumFraction } from "@/lib/finances/franchiseIcon";
import { computeCareerRecordSnapshot } from "@/lib/actions/careerRecord";
import { computeReputationDelta } from "@/lib/gm/careerRecord";
import {
  computeFinancialStanding,
  financialStandingPatienceFactor,
  financialStandingConfidenceBonus,
  ownerBacksTaxSpending,
  shouldIssueFinancialMandate,
  describeFinancialStandingMessage,
  describeFinancialMandate,
  describeFinancialMandateResolution,
  FINANCIAL_MANDATE_DEADLINE_YEARS,
  FINANCIAL_MANDATE_ISSUE_PENALTY,
  FINANCIAL_MANDATE_MET_REWARD,
  FINANCIAL_MANDATE_IGNORED_PENALTY,
  type FinancialStanding,
} from "@/lib/finances/ownershipFinance";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { computePayrollTier } from "@/lib/gm/payrollTier";
import { computeExpectationLevel, EXPECTATION_LEVEL_ORDER } from "@/lib/gm/expectationLevel";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import {
  archetypeConfidenceDeltaMultiplier,
  archetypeExpectationLevelShift,
  archetypeDirectiveConfidenceThreshold,
  archetypeShouldIssueFinancialMandate,
  rollOwnerArchetype,
  shouldOwnershipChange,
  confidenceAfterOwnershipChange,
  describeOwnershipChange,
} from "@/lib/gm/ownerArchetype";
import {
  buildPayrollDirectiveNegotiation,
  buildFinancialMandateNegotiation,
} from "@/lib/finances/businessDecisions";
import { computeTeamIdentity } from "@/lib/gm/teamIdentity";
import { computeTeamNeeds, type TeamNeedRosterPlayer } from "@/lib/gm/teamNeeds";
import { computePlayerTradeValue } from "@/lib/gm/playerTradeValue";
import { computeReSigningMaxOfferCents } from "@/lib/freeagency/reSigningRights";
import { pickContractLength } from "@/lib/contracts/priceContract";
import { runCpuFreeAgentMarket } from "@/lib/freeagency/cpuFreeAgentMarket";
import { evaluateReSigningDecision } from "@/lib/gm/reSigningDecision";
import {
  computeActualOutcome,
  computeConfidenceDelta,
  evaluateSeason,
} from "@/lib/gm/seasonEvaluation";
import {
  describeDirectiveCompliance,
  describeNewExpectation,
  describePayrollDirective,
  describeSeasonEvaluation,
} from "@/lib/gm/ownershipMessages";
import { buildFuturePickRows, FUTURE_PICK_WINDOW_YEARS } from "@/lib/draft/futurePicks";
import { shouldStaffRetire } from "@/lib/staff/staffRetirement";
import { computeStaffSalary } from "@/lib/staff/generateStaff";
import { computeCoachOfTheYear } from "@/lib/staff/coachOfTheYear";
import { STAFF_ROLE_LABEL } from "@/lib/staff/labels";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import { computeTransactionSentiment } from "@/lib/fans/transactionSentiment";
import {
  computeFanHappinessDelta,
  computeFranchisePopularity,
  computeAttendancePct,
  type FanHappinessInputs,
} from "@/lib/fans/fanHappiness";
import {
  applyFanHappinessDelta,
  applyScaledFanHappinessDelta,
  computeAwardSentimentDelta,
} from "@/lib/fans/sentimentEvents";
import { recordFanSentimentMany, type SentimentRecord } from "@/lib/fans/recordSentiment";
import { recomputeFanCultures } from "@/lib/actions/fanCulture";
import { recomputeFanMandates } from "@/lib/actions/fanMandate";
import { progressFanNarratives } from "@/lib/actions/fanNarrative";
import { describeAwardSentiment } from "@/lib/fans/describeSentiment";
import type { EvaluationVerdict } from "@/lib/gm/seasonEvaluation";
import type { StaffRole } from "@/generated/prisma/client";
import {
  computeContractSituationMoraleDelta,
  computeCoachFitMoraleDelta,
  decayMoraleTowardBaseline,
  MORALE_NEWS_THRESHOLD,
} from "@/lib/morale/moraleEvents";
import { applyMoraleChange } from "@/lib/morale/moraleLevel";
import { rollupCompletedSeasons } from "@/lib/stats/rollupSeasonStats";
import { loadInSimPerformance } from "@/lib/valuation/inSimPerformance";

// Local, server-side copy of the award-category label (small duplication
// of the UI's own AWARD_LABELS constants, same established pattern as
// elsewhere in this codebase - this one drives news-story text, not display).
const AWARD_NEWS_LABEL: Record<string, string> = {
  MVP: "Most Valuable Player",
  ROOKIE_OF_THE_YEAR: "Rookie of the Year",
  MOST_IMPROVED_PLAYER: "Most Improved Player",
  DEFENSIVE_PLAYER_OF_THE_YEAR: "Defensive Player of the Year",
  SIXTH_MAN_OF_THE_YEAR: "Sixth Man of the Year",
};

const MIN_OWNER_CONFIDENCE = 0;
const MAX_OWNER_CONFIDENCE = 100;
// A new payroll-reduction directive is only issued when ownership is
// already unhappy and the team is still spending heavily - otherwise
// every offseason for an expensive-but-successful team would nag the
// user for no reason.
const DIRECTIVE_CONFIDENCE_THRESHOLD = 35;
const DIRECTIVE_PAYROLL_REDUCTION_FRACTION = 0.85;

// Bulk player-development writes are batched (not one giant Promise.all)
// for the same reason simulateGamesAction batches game writes - see
// docs/ARCHITECTURE.md.
const UPDATE_BATCH_SIZE = 50;

// Staff Management (Phase 15a) - Head Coach reputation drift off plain team
// win% (universal across all 30 teams - SeasonExpectation is user-team-only,
// so this can't reuse that system the way the user's own GM accountability
// does). A CPU auto-backfill hire gets a flat, modest deal - CPU staff
// salaries are flavor, not enforced against any cap.
const HEAD_COACH_REPUTATION_DRIFT_PER_WIN_PCT = 20;
const CPU_AUTO_HIRE_CONTRACT_YEARS = 2;

async function requireOwnedLeague(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    // Fans Page Redesign (Phase 3) - fanCulture included here (as it stood
    // BEFORE this pass's own recomputeFanCultures call at the end) so this
    // season's sentiment deltas scale against last season's culture, not a
    // number this same pass is about to overwrite.
    include: { teams: { include: { team: true, fanCulture: true } } },
  });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  return league;
}

/**
 * Ages every active player one year, applies development/decline, resolves
 * retirements, expires contracts, computes this season's awards (MVP, ROY,
 * Most Improved), resets standings, generates the new season's schedule,
 * and rolls `League.currentSeason` forward. Requires a crowned champion for
 * the current season - the playoffs aren't a dead end, they're what
 * actually unlocks the next season.
 */
export async function advanceSeasonAction(leagueId: string) {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;
  const newSeason = season + 1;

  // GM Career Mode - a fired/retired franchise is a permanent, read-only
  // record; it can never be advanced again.
  if (league.endedAt) {
    throw new Error("This franchise has ended - it can no longer be advanced.");
  }

  const finals = await prisma.playoffSeries.findFirst({
    where: { leagueId, season, round: 4 },
  });
  if (!finals?.winnerTeamId) {
    throw new Error("Crown a champion in the playoffs before advancing to the next season.");
  }

  // Future seasons' pick placeholders (Phase 11a) already exist for `season`
  // by this point regardless of whether that season's draft has actually
  // started - `overallPickNumber` is the real "draft started" signal, not
  // row existence.
  const [totalDraftPicks, pendingDraftPicks] = await Promise.all([
    prisma.draftPick.count({ where: { leagueId, season, overallPickNumber: { not: null } } }),
    prisma.draftPick.count({
      where: { leagueId, season, overallPickNumber: { not: null }, selectedProspectId: null },
    }),
  ]);
  if (totalDraftPicks === 0 || pendingDraftPicks > 0) {
    throw new Error("Finish the draft before advancing to the next season.");
  }

  const alreadyAdvanced = await prisma.game.count({ where: { leagueId, season: newSeason } });
  if (alreadyAdvanced > 0) {
    throw new Error("This season has already been advanced.");
  }

  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueId, isActive: true },
    include: {
      // `seasonStats` is loaded because the CPU free-agent market prices every
      // free agent off the same valuation model the board quotes to the user.
      // Without it the market would price nobody and silently sign nobody -
      // a no-op that typechecks perfectly, since the field is optional.
      player: { include: { seasonStats: { where: { season } } } },
      contract: { include: { years: { where: { season } } } },
      personalityProfile: true,
    },
  });
  const teamById = new Map(league.teams.map((t) => [t.id, t]));
  // Built early (not just for the award-news section further down) so the
  // CPU re-signing pass (Phase 1 of CPU Autonomous GM Intelligence) can look
  // up a pending player's real position/potential/injury history by id
  // without a second query.
  const leaguePlayerById = new Map(leaguePlayers.map((lp) => [lp.id, lp]));

  // Staff Management (Phase 15a) - every staff member (rostered and
  // free-agent-pool alike) ages this same season boundary.
  const allStaff = await prisma.staff.findMany({
    where: { leagueId },
    include: { contract: true },
  });

  // Finances as a Gameplay Pillar (Phase 5) - System 2/8's shared capital-
  // project plumbing. A project committed this pass (or earlier) completes
  // once `completionSeason <= newSeason`; its permanent effects apply
  // starting the season that's about to begin, alongside every other
  // already-COMPLETE project this team has finished.
  const allCapitalProjects = await prisma.capitalProject.findMany({
    where: { leagueId, status: { in: ["IN_PROGRESS", "COMPLETE"] } },
  });
  const completingThisPassByTeam = new Map<string, typeof allCapitalProjects>();
  const stillInProgressKindsByTeam = new Map<
    string,
    (typeof allCapitalProjects)[number]["kind"][]
  >();
  const completedKindsByTeam = new Map<string, (typeof allCapitalProjects)[number]["kind"][]>();
  for (const project of allCapitalProjects) {
    if (project.status === "COMPLETE") {
      const list = completedKindsByTeam.get(project.leagueTeamId) ?? [];
      list.push(project.kind);
      completedKindsByTeam.set(project.leagueTeamId, list);
      continue;
    }
    if (project.completionSeason <= newSeason) {
      const list = completingThisPassByTeam.get(project.leagueTeamId) ?? [];
      list.push(project);
      completingThisPassByTeam.set(project.leagueTeamId, list);
      // Its effects apply starting next season too - fold it into the
      // "completed" set alongside anything already finished earlier.
      const completedList = completedKindsByTeam.get(project.leagueTeamId) ?? [];
      completedList.push(project.kind);
      completedKindsByTeam.set(project.leagueTeamId, completedList);
    } else {
      const list = stillInProgressKindsByTeam.get(project.leagueTeamId) ?? [];
      list.push(project.kind);
      stillInProgressKindsByTeam.set(project.leagueTeamId, list);
    }
  }
  const completedEffectsByTeam = new Map(
    league.teams.map((lt) => [
      lt.id,
      sumCompletedProjectEffects(completedKindsByTeam.get(lt.id) ?? []),
    ]),
  );
  // Finances as a Gameplay Pillar (Phase 4) - Coaching Support amplifies
  // the Player Development Coach's own quality, same "amplifies staff you
  // already hired" identity as its Head Coach effect in simulation.ts.
  const coachingSupportByTeam = new Map(league.teams.map((lt) => [lt.id, lt.coachingSupportLevel]));
  const developmentCoachQualityByTeam = new Map(
    allStaff
      .filter((s) => s.role === "PLAYER_DEVELOPMENT_COACH" && s.leagueTeamId)
      .map((s) => [
        s.leagueTeamId as string,
        effectiveStaffQuality(
          s.quality,
          coachingSupportByTeam.get(s.leagueTeamId as string) ?? "STANDARD",
        )!,
      ]),
  );
  // Player Morale & Personality System - a competitiveness-driven player
  // notices the Head Coach's quality, distinct from the Dev Coach's own
  // rating-development effect above.
  const headCoachQualityByTeam = new Map(
    allStaff
      .filter((s) => s.role === "HEAD_COACH" && s.leagueTeamId)
      .map((s) => [s.leagueTeamId as string, s.quality]),
  );
  // Finances as a Gameplay Pillar (Phase 4) - the Player Development
  // department feeds player development, same modest neutral-anchored
  // shape as the dev-coach effect. Was facilitiesInvestment. Phase 5 -
  // a completed G-League Affiliate/Practice Facility stacks a permanent
  // flat bonus on top of the department's own level.
  const playerDevelopmentDeltaByTeam = new Map(
    league.teams.map((lt) => [
      lt.id,
      departmentQualityDelta(lt.playerDevelopmentLevel) +
        (completedEffectsByTeam.get(lt.id)?.playerDevelopmentBonus ?? 0),
    ]),
  );

  // GM accountability (Phase 10d): the outgoing season's expectation and
  // payroll must be captured now, before the contract-expiry cleanup below
  // deletes the very ContractYear rows a payroll snapshot for `season`
  // would depend on.
  const userLeagueTeamId = league.userControlledTeamId;
  const [priorExpectation, oldSeasonContractYears] = userLeagueTeamId
    ? await Promise.all([
        prisma.seasonExpectation.findUnique({
          where: { leagueId_season: { leagueId, season } },
        }),
        prisma.contractYear.findMany({
          where: { season, contract: { leagueTeamId: userLeagueTeamId } },
          select: { salaryCents: true, contract: { select: { leaguePlayerId: true } } },
        }),
      ])
    : [null, []];

  // Real per-game box-score aggregates for the season just completed -
  // what DPOY/Sixth Man are computed from below, now that they exist
  // (Phase 14a/14b). One groupBy, not a query per player.
  const boxScoreAggByPlayer = new Map(
    (
      await prisma.playerGameStat.groupBy({
        by: ["leaguePlayerId"],
        where: { leagueId, season },
        _avg: {
          minutesPlayed: true,
          points: true,
          rebounds: true,
          assists: true,
          steals: true,
          blocks: true,
          turnovers: true,
        },
        _sum: { points: true, fgAttempted: true, ftAttempted: true },
        _count: { _all: true },
      })
    ).map((g) => [g.leaguePlayerId, g]),
  );

  const rosteredSnapshots: PlayerSeasonSnapshot[] = [];
  const developmentSnapshots: PlayerSeasonSnapshot[] = [];
  const defensiveSnapshots: DefensiveSeasonSnapshot[] = [];
  const benchSnapshots: BenchSeasonSnapshot[] = [];
  const playerUpdates: {
    id: string;
    overallRating: number;
    isActive: boolean;
    leagueTeamId: string | null;
    retiredSeason: number | null;
    // Only ever set (to null) when a player is actually leaving their
    // team this offseason (retirement or contract expiry) - a stale
    // depth-chart slot is meaningless once they're off the roster. Absent
    // (not just null) for anyone staying, so their existing customization
    // is left untouched.
    rotationSlot?: null;
    targetMinutesPerGame?: null;
    // Player Morale & Personality System - only set for players who went
    // through the seasonal morale pass below (staying rostered) or a CPU
    // re-signing resolution; absent for anyone else, same "don't touch it
    // unless something actually changed" convention as rotationSlot above.
    morale?: number;
    tradeRequestActive?: boolean;
  }[] = [];
  const contractIdsToDelete: string[] = [];
  const retirementEvents: {
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[] = [];
  // Player Morale & Personality System - season-boundary contract-
  // situation/coach-fit/decay pass, only for players actually staying
  // rostered (see the loop below).
  const moraleNewsEvents: {
    description: string;
    importance: NewsImportance;
    teamIds: string[];
    subjectLeaguePlayerId: string;
  }[] = [];
  // CPU Autonomous GM Intelligence (Phase 1) - a CPU team's own expiring
  // player isn't pushed to playerUpdates immediately; it's decided in Pass 2
  // below (after this loop) once every team's "sure roster" is fully known.
  const pendingCpuReSignings: {
    leaguePlayerId: string;
    teamId: string;
    finalRating: number;
    newAge: number;
  }[] = [];

  const rng = createSeededRandom(`${leagueId}-${season}-offseason`);

  for (const lp of leaguePlayers) {
    const oldRating = lp.overallRating;
    const newAge = resolvePlayerAge(lp.player, newSeason);
    const experience = resolvePlayerExperience(lp.player, season);
    const boxAgg = boxScoreAggByPlayer.get(lp.id);
    const hasRealMinutes = !!boxAgg && boxAgg._count._all > 0;
    // Rotation Management - real per-season minutes feed developPlayerRating
    // below as a modest nudge, same neutral-anchor pattern as the dev-coach
    // bonus. undefined (no games played this season) means no effect.
    const seasonMinutesPerGame =
      boxAgg && hasRealMinutes ? (boxAgg._avg.minutesPlayed ?? undefined) : undefined;

    if (lp.leagueTeamId) {
      const team = teamById.get(lp.leagueTeamId);
      const gamesPlayed = (team?.wins ?? 0) + (team?.losses ?? 0);
      rosteredSnapshots.push({
        leaguePlayerId: lp.id,
        overallRating: oldRating,
        previousRating: null,
        experience,
        teamWinPct: gamesPlayed > 0 ? (team?.wins ?? 0) / gamesPlayed : 0,
      });

      if (boxAgg && hasRealMinutes) {
        const minutesPerGame = boxAgg._avg.minutesPlayed ?? 0;
        // Real true-shooting formula (TS% = PTS / (2 * (FGA + 0.44*FTA))),
        // not an approximation - all three inputs are real season sums.
        const trueShootingDenominator =
          2 * ((boxAgg._sum.fgAttempted ?? 0) + 0.44 * (boxAgg._sum.ftAttempted ?? 0));
        const trueShootingPct =
          trueShootingDenominator > 0 ? (boxAgg._sum.points ?? 0) / trueShootingDenominator : 0.56;
        defensiveSnapshots.push({
          leaguePlayerId: lp.id,
          gamesPlayed: boxAgg._count._all,
          minutesPerGame,
          stealsPerGame: boxAgg._avg.steals ?? 0,
          blocksPerGame: boxAgg._avg.blocks ?? 0,
          reboundsPerGame: boxAgg._avg.rebounds ?? 0,
        });
        benchSnapshots.push({
          leaguePlayerId: lp.id,
          gamesPlayed: boxAgg._count._all,
          minutesPerGame,
          pointsPerGame: boxAgg._avg.points ?? 0,
          reboundsPerGame: boxAgg._avg.rebounds ?? 0,
          assistsPerGame: boxAgg._avg.assists ?? 0,
          stealsPerGame: boxAgg._avg.steals ?? 0,
          blocksPerGame: boxAgg._avg.blocks ?? 0,
          turnoversPerGame: boxAgg._avg.turnovers ?? 0,
          trueShootingPct,
        });
      }
    }

    const developedRating = developPlayerRating({
      overallRating: oldRating,
      potentialRating: lp.potentialRating,
      age: newAge,
      rng,
      developmentCoachQuality: lp.leagueTeamId
        ? developmentCoachQualityByTeam.get(lp.leagueTeamId)
        : undefined,
      minutesPerGame: seasonMinutesPerGame,
      morale: lp.morale,
      playerDevelopmentDelta: lp.leagueTeamId
        ? playerDevelopmentDeltaByTeam.get(lp.leagueTeamId)
        : undefined,
    });
    const retiring = shouldRetire(newAge, developedRating, rng, lp.morale);
    const finalRating = retiring ? oldRating : developedRating;

    developmentSnapshots.push({
      leaguePlayerId: lp.id,
      overallRating: finalRating,
      previousRating: oldRating,
      experience,
      teamWinPct: 0,
    });

    const contractExpired = !retiring && !!lp.contract && lp.contract.endSeason < newSeason;
    if (retiring || contractExpired) {
      if (lp.contract) contractIdsToDelete.push(lp.contract.id);
    }

    if (retiring) {
      const teamLabel = lp.leagueTeamId
        ? (() => {
            const team = teamById.get(lp.leagueTeamId!)?.team;
            return team ? `${team.city} ${team.name}` : null;
          })()
        : null;
      retirementEvents.push({
        description: describeRetirement(lp.player.fullName, teamLabel),
        importance: importanceForRating(oldRating),
        teamIds: lp.leagueTeamId ? [lp.leagueTeamId] : [],
      });
    }

    // CPU Autonomous GM Intelligence (Phase 1) - the user's own expiring
    // players are untouched (they re-sign manually via the free-agents
    // page, exactly as before); a CPU team's expiring player gets a real
    // retention decision in Pass 2 instead of unconditional release.
    const isCpuContractExpiry =
      contractExpired && !!lp.leagueTeamId && lp.leagueTeamId !== userLeagueTeamId;

    if (isCpuContractExpiry) {
      pendingCpuReSignings.push({
        leaguePlayerId: lp.id,
        teamId: lp.leagueTeamId!,
        finalRating,
        newAge,
      });
      continue;
    }

    const leftTeam = retiring || contractExpired;

    // Player Morale & Personality System - only for players actually
    // staying with the same team: leaving players' morale is moot (a
    // free agent's or retiree's "situation" no longer exists), and
    // players about to be re-decided in the CPU re-signing pass below get
    // their own resolution there instead.
    let moraleUpdate: { morale: number; tradeRequestActive: boolean } | null = null;
    if (!leftTeam && lp.leagueTeamId && lp.personalityProfile) {
      const decayedMorale = decayMoraleTowardBaseline(lp.morale, lp.personalityProfile.loyalty);
      const currentSeasonSalaryCents = lp.contract?.years[0]?.salaryCents ?? 0n;
      const seasonsRemaining = lp.contract ? Math.max(1, lp.contract.endSeason - season) : 1;
      const contractDelta = lp.contract
        ? computeContractSituationMoraleDelta({
            personality: lp.personalityProfile,
            currentSeasonSalaryCents,
            marketValueCents: computeReSigningMaxOfferCents(
              finalRating,
              newSeason,
              resolvePlayerAge(lp.player, newSeason),
              resolvePlayerExperience(lp.player, newSeason),
              lp.player.position,
            ),
            seasonsRemaining,
          })
        : 0;
      const coachDelta = computeCoachFitMoraleDelta({
        personality: lp.personalityProfile,
        coachQuality: headCoachQualityByTeam.get(lp.leagueTeamId) ?? 72,
      });
      const result = applyMoraleChange(
        decayedMorale,
        contractDelta + coachDelta,
        lp.personalityProfile.loyalty,
        lp.tradeRequestActive,
      );
      moraleUpdate = { morale: result.morale, tradeRequestActive: result.tradeRequestActive };

      const teamLabel = teamById.get(lp.leagueTeamId)?.team;
      const teamLabelStr = teamLabel ? `${teamLabel.city} ${teamLabel.name}` : "their team";
      const totalDelta = contractDelta + coachDelta;
      if (Math.abs(totalDelta) >= MORALE_NEWS_THRESHOLD) {
        // Contract underpayment is always <=0; the coach-fit delta can run
        // either direction - whichever contributed more to this delta is
        // the one worth naming in the story.
        const reason =
          Math.abs(contractDelta) >= Math.abs(coachDelta) ? "CONTRACT_UNDERPAID" : "COACH_QUALITY";
        moraleNewsEvents.push({
          description: describePlayerMoraleEvent(
            lp.player.fullName,
            teamLabelStr,
            reason,
            totalDelta > 0 ? "up" : "down",
          ),
          importance: importanceForRating(finalRating),
          teamIds: [lp.leagueTeamId],
          subjectLeaguePlayerId: lp.id,
        });
      }
      if (result.justActivated) {
        moraleNewsEvents.push({
          description: describeTradeRequest(lp.player.fullName, teamLabelStr),
          importance: importanceForRating(finalRating),
          teamIds: [lp.leagueTeamId],
          subjectLeaguePlayerId: lp.id,
        });
      }
    }

    playerUpdates.push({
      id: lp.id,
      overallRating: finalRating,
      isActive: !retiring,
      leagueTeamId: leftTeam ? null : lp.leagueTeamId,
      retiredSeason: retiring ? season : null,
      ...(leftTeam ? { rotationSlot: null, targetMinutesPerGame: null } : {}),
      ...(moraleUpdate ?? {}),
    });
  }

  // --- CPU Autonomous GM Intelligence (Phase 1): CPU re-signing ---
  // Runs after the loop above so every "sure roster" (everyone NOT still
  // pending a re-signing decision) is fully known - computeTeamIdentity and
  // computeTeamNeeds should see each team the way it will actually look next
  // season, not mid-decision. Reuses computePlayerTradeValue,
  // computeTeamIdentity, computeTeamNeeds, and computeReSigningMaxOfferCents
  // exactly as the rest of the GM-intelligence layer does - the only new
  // logic is evaluateReSigningDecision itself (src/lib/gm/reSigningDecision.ts).
  const cpuReSignings: {
    leaguePlayerId: string;
    leagueTeamId: string;
    finalRating: number;
    offerSalaryCents: bigint;
    years: number;
  }[] = [];

  if (pendingCpuReSignings.length > 0) {
    const percentileByTeam = await computeCompetitivenessPercentiles(
      league.teams.map((t) => ({ id: t.id, wins: t.wins, losses: t.losses })),
    );

    // The "sure roster" - everyone confirmed staying, built from
    // playerUpdates already pushed above (which naturally excludes every
    // pending re-signing candidate, no extra filtering needed).
    const sureRosterByTeam = new Map<string, (TeamNeedRosterPlayer & { age: number })[]>();
    for (const u of playerUpdates) {
      if (!u.leagueTeamId || u.retiredSeason !== null) continue;
      const lp = leaguePlayerById.get(u.id);
      if (!lp) continue;
      const list = sureRosterByTeam.get(u.leagueTeamId) ?? [];
      list.push({
        position: lp.player.position,
        overallRating: u.overallRating,
        age: resolvePlayerAge(lp.player, newSeason),
      });
      sureRosterByTeam.set(u.leagueTeamId, list);
    }

    const pendingByTeam = new Map<string, typeof pendingCpuReSignings>();
    for (const p of pendingCpuReSignings) {
      const list = pendingByTeam.get(p.teamId) ?? [];
      list.push(p);
      pendingByTeam.set(p.teamId, list);
    }

    for (const [teamId, pending] of pendingByTeam) {
      const sureRoster = sureRosterByTeam.get(teamId) ?? [];
      const avgAge =
        sureRoster.length > 0
          ? sureRoster.reduce((sum, p) => sum + p.age, 0) / sureRoster.length
          : 27;
      const identity = computeTeamIdentity(percentileByTeam.get(teamId) ?? 0.5, avgAge);
      const needs = computeTeamNeeds(sureRoster);
      const personality = teamById.get(teamId)?.gmPersonality ?? "BALANCED";

      // Best assets get first claim on the roster-ceiling headroom.
      const ordered = [...pending].sort((a, b) => {
        const lpA = leaguePlayerById.get(a.leaguePlayerId)!;
        const lpB = leaguePlayerById.get(b.leaguePlayerId)!;
        const valueA = computePlayerTradeValue({
          season: newSeason,
          overallRating: a.finalRating,
          potentialRating: lpA.potentialRating,
          age: a.newAge,
          currentSalaryCents: computeReSigningMaxOfferCents(
            a.finalRating,
            newSeason,
            a.newAge,
            resolvePlayerExperience(lpA.player, newSeason),
            lpA.player.position,
          ),
          injuryStatus: "HEALTHY",
          careerGamesMissedToInjury: lpA.careerGamesMissedToInjury,
        });
        const valueB = computePlayerTradeValue({
          season: newSeason,
          overallRating: b.finalRating,
          potentialRating: lpB.potentialRating,
          age: b.newAge,
          currentSalaryCents: computeReSigningMaxOfferCents(
            b.finalRating,
            newSeason,
            b.newAge,
            resolvePlayerExperience(lpB.player, newSeason),
            lpB.player.position,
          ),
          injuryStatus: "HEALTHY",
          careerGamesMissedToInjury: lpB.careerGamesMissedToInjury,
        });
        return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
      });

      let rosterSize = sureRoster.length;
      for (const p of ordered) {
        const lp = leaguePlayerById.get(p.leaguePlayerId)!;
        const offerSalaryCents = computeReSigningMaxOfferCents(
          p.finalRating,
          newSeason,
          p.newAge,
          resolvePlayerExperience(lp.player, newSeason),
          lp.player.position,
        );
        const result = evaluateReSigningDecision({
          team: { identity, needs, personality, rosterSizeBeforeThisDecision: rosterSize },
          currentSeason: newSeason,
          player: {
            position: lp.player.position,
            overallRating: p.finalRating,
            potentialRating: lp.potentialRating,
            age: p.newAge,
            careerGamesMissedToInjury: lp.careerGamesMissedToInjury,
            hasStandingTradeRequest: lp.tradeRequestActive,
          },
          offerSalaryCents,
          // Franchise Finances (Phase C) - a CPU team bleeding cash gets
          // pickier about adding salary. Keyed off cash reserve through the
          // prior season (the finances pass for the completing season runs
          // later in this function); salary-normalized scoring means this
          // only cuts expensive marginal re-signings, never bargains.
          financialThresholdMultiplier: financialSpendingResistance(
            Number(teamById.get(teamId)?.cashReserveCents ?? 0n),
          ),
        });

        if (result.decision === "RESIGN") {
          rosterSize += 1;
          // Staying on the exact same team in the exact same roster spot -
          // unlike a trade or a fresh signing, their existing depth-chart
          // slot carries over untouched (no rotationSlot/targetMinutesPerGame
          // reset). A new deal resolves any standing trade request, whether
          // or not it was a factor - the offseason answered the "will he
          // stay" question either way.
          playerUpdates.push({
            id: p.leaguePlayerId,
            overallRating: p.finalRating,
            isActive: true,
            leagueTeamId: teamId,
            retiredSeason: null,
            tradeRequestActive: false,
          });
          cpuReSignings.push({
            leaguePlayerId: p.leaguePlayerId,
            leagueTeamId: teamId,
            finalRating: p.finalRating,
            offerSalaryCents,
            // Term is the player's own: quality buys years, age takes them
            // back. Every CPU deal used to be a flat two years, so a single
            // offseason erased the variety the bootstrap created - see
            // docs/CONTRACT_AUDIT.md, C-P1-5.
            years: pickContractLength(
              p.finalRating,
              p.newAge,
              createSeededRandom(`${p.leaguePlayerId}:${newSeason}`),
            ),
          });
        } else {
          playerUpdates.push({
            id: p.leaguePlayerId,
            overallRating: p.finalRating,
            isActive: true,
            leagueTeamId: null,
            retiredSeason: null,
            rotationSlot: null,
            targetMinutesPerGame: null,
          });
        }
      }
    }
  }

  // --- CPU free-agent market ---
  //
  // Rival clubs actually signing the free agents the board showed them
  // competing for. Without this, `rivalInterest` would be theatre: the market
  // page would name three suitors for a centre and then nobody would ever sign
  // him, which is worse than saying nothing because it manufactures urgency the
  // game does not honour.
  //
  // Runs *after* the re-signing pass so a club fills its own holes with its own
  // expiring players first, and only then shops - and so players who just
  // walked are themselves on the market.
  // The season that just finished, read from its still-raw box scores - the
  // rollup for it runs at the end of this function, after the market has
  // already priced everyone off it.
  const inSimPerformance = await loadInSimPerformance(leagueId, season);

  const cpuFreeAgentSignings = await runCpuFreeAgentMarket({
    leagueId,
    newSeason,
    userTeamId: league.userControlledTeamId,
    leaguePlayers,
    playerUpdates,
    teamById,
    inSimPerformance,
  });
  // Mutate the player's existing update rather than pushing a second one:
  // every active player already has an entry from the development pass, and a
  // duplicate would both clobber their developed rating and double-count them
  // in `newSeasonRoster` below. Only the team assignment changes here.
  const updateById = new Map(playerUpdates.map((u) => [u.id, u]));
  for (const signing of cpuFreeAgentSignings) {
    const existing = updateById.get(signing.leaguePlayerId);
    if (!existing) continue;
    existing.leagueTeamId = signing.leagueTeamId;
  }

  // --- Staff season progression (Phase 15a) ---
  // Uses its own seeded rng, independent of the player-development stream
  // above - adding staff rolls must never shift what an existing league's
  // players already deterministically develop into.
  const staffRng = createSeededRandom(`${leagueId}-${season}-staff`);
  const teamWinPctById = new Map(
    league.teams.map((t) => {
      const gamesPlayed = t.wins + t.losses;
      return [t.id, gamesPlayed > 0 ? t.wins / gamesPlayed : 0.5];
    }),
  );

  // Staff don't carry the player model's isActive/retiredSeason fields (no
  // staff-history page in this phase's scope) - a retiring staff member is
  // simply removed, cascading away their StaffContract.
  const staffIdsToDelete: string[] = [];
  const staffUpdates: {
    id: string;
    age: number;
    leagueTeamId: string | null;
    reputation: number;
  }[] = [];
  const staffContractIdsToDelete: string[] = [];
  const staffRetirementEvents: {
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[] = [];
  // Only CPU teams' vacancies get auto-backfilled below - the user's own
  // vacancy is left open for them to fill via hireStaffAction.
  const vacatedCpuRoles: { leagueTeamId: string; role: StaffRole }[] = [];

  for (const staff of allStaff) {
    const newAge = staff.age + 1;
    const retiring = shouldStaffRetire(newAge, staffRng);

    if (retiring) {
      staffIdsToDelete.push(staff.id);
      if (staff.leagueTeamId) {
        const team = teamById.get(staff.leagueTeamId)?.team;
        staffRetirementEvents.push({
          description: team
            ? `${staff.fullName} is retiring after a career with the ${team.city} ${team.name}.`
            : `${staff.fullName} is retiring.`,
          importance: importanceForRating(staff.quality),
          teamIds: [staff.leagueTeamId],
        });
        if (staff.leagueTeamId !== userLeagueTeamId) {
          vacatedCpuRoles.push({ leagueTeamId: staff.leagueTeamId, role: staff.role });
        }
      }
      continue;
    }

    const contractExpired = !!staff.contract && staff.contract.endSeason < newSeason;
    if (contractExpired) {
      staffContractIdsToDelete.push(staff.contract!.id);
      if (staff.leagueTeamId && staff.leagueTeamId !== userLeagueTeamId) {
        vacatedCpuRoles.push({ leagueTeamId: staff.leagueTeamId, role: staff.role });
      }
    }

    // Head Coach reputation drift off plain team win% - the only universal
    // (all 30 teams, not just the user's) performance signal available.
    let reputation = staff.reputation;
    if (staff.role === "HEAD_COACH" && staff.leagueTeamId && !contractExpired) {
      const winPct = teamWinPctById.get(staff.leagueTeamId) ?? 0.5;
      const delta = Math.round((winPct - 0.5) * HEAD_COACH_REPUTATION_DRIFT_PER_WIN_PCT);
      reputation = Math.max(0, Math.min(100, staff.reputation + delta));
    }

    staffUpdates.push({
      id: staff.id,
      age: newAge,
      leagueTeamId: contractExpired ? null : staff.leagueTeamId,
      reputation,
    });
  }

  // --- Fan engagement setup ---
  // A consumer of existing simulation events, not a second event pipeline
  // - reads the exact same LeagueTransaction rows the news feed surfaces,
  // reuses teamWinPctById (already built above for Head Coach reputation
  // drift) and allStaff (already fetched) for coach style. Built here, all
  // 30 teams at once, so both the user's own team (computed inline right
  // before the owner-confidence nudge below, since it needs `verdict`) and
  // every CPU team (computed in the persistence loop further down) share
  // the same inputs without querying twice.
  // Fan Engagement Deepening (Phase 1) - these categories now apply their
  // own dedicated sentiment delta the moment they actually happen (trades,
  // signings, staff moves, rotation changes, win/loss streaks, injuries,
  // awards, All-Star), so they're excluded here to avoid double-counting;
  // this bulk pass is narrowed to the remaining ambient long tail
  // (retirements, individual game milestones/results).
  const SEASON_END_ONLY_SENTIMENT_TYPES = ["RETIREMENT", "GAME_MILESTONE", "GAME_RESULT"] as const;
  const seasonTransactions = await prisma.leagueTransaction.findMany({
    where: { leagueId, season, type: { in: [...SEASON_END_ONLY_SENTIMENT_TYPES] } },
    select: { type: true, importance: true, teamIds: true, description: true },
  });
  const transactionsByTeam = new Map<
    string,
    { type: string; importance: string; description: string }[]
  >();
  for (const txn of seasonTransactions) {
    for (const teamId of txn.teamIds) {
      const list = transactionsByTeam.get(teamId) ?? [];
      list.push({ type: txn.type, importance: txn.importance, description: txn.description });
      transactionsByTeam.set(teamId, list);
    }
  }

  const bestRatingByTeam = new Map<string, number>();
  // Franchise Finances (Phase D) - also track the best player themself per
  // team, for the franchise-icon value premium in the finances pass below.
  const bestPlayerByTeam = new Map<string, (typeof leaguePlayers)[number]>();
  for (const lp of leaguePlayers) {
    if (!lp.leagueTeamId) continue;
    const current = bestRatingByTeam.get(lp.leagueTeamId) ?? 0;
    if (lp.overallRating > current) {
      bestRatingByTeam.set(lp.leagueTeamId, lp.overallRating);
      bestPlayerByTeam.set(lp.leagueTeamId, lp);
    }
  }
  const starPowerTierByTeam = new Map(
    Array.from(bestRatingByTeam.entries()).map(([teamId, rating]) => [
      teamId,
      getPlayerValueTier(rating),
    ]),
  );
  // Per-team franchise-icon value premium: the marquee player's icon score
  // (star tier + tenure + homegrown; awards omitted here to avoid a per-team
  // query on this path) lifts franchise value - a beloved homegrown legend
  // makes the whole franchise more valuable than an equal-rated newcomer.
  const iconPremiumByTeam = new Map<string, number>();
  // Fans Page Redesign (Phase 3) - the same icon score, kept directly (not
  // just its derived value-premium fraction) as Fan Culture's "does this
  // team currently have a real icon" input.
  const iconScoreByTeam = new Map<string, number>();
  for (const [teamId, lp] of bestPlayerByTeam) {
    const tenure = lp.joinedTeamSeason != null ? Math.max(0, season - lp.joinedTeamSeason) : 0;
    const iconScore = computeFranchiseIconScore({
      starTier: getPlayerValueTier(lp.overallRating),
      tenureSeasons: tenure,
      homegrown: lp.homegrown,
      careerAwards: 0,
    });
    iconPremiumByTeam.set(teamId, iconValuePremiumFraction(iconScore));
    iconScoreByTeam.set(teamId, iconScore);
  }

  const headCoachStyleByTeam = new Map(
    allStaff
      .filter((s) => s.role === "HEAD_COACH" && s.leagueTeamId)
      .map((s) => [s.leagueTeamId as string, s.style]),
  );

  // Populated inline for the user's own team below (needs `verdict`,
  // computed inside the owner-accountability block); every other team is
  // computed fresh in the persistence loop near the end of this function.
  const fanHappinessByTeam = new Map<string, number>();
  // Fan Engagement Deepening (Phase 1) - award-driven deltas, added on top
  // of whichever base each team resolves to below (see fanHappinessUpdates).
  const awardFanHappinessDeltaByTeam = new Map<string, number>();
  // Fans Page Redesign (Phase 1).
  const awardSentimentRows: SentimentRecord[] = [];

  function fallbackFanHappinessInputs(leagueTeamId: string): FanHappinessInputs {
    return {
      evaluationVerdict: null,
      teamWinPct: teamWinPctById.get(leagueTeamId) ?? 0.5,
      transactionSentiment: computeTransactionSentiment(transactionsByTeam.get(leagueTeamId) ?? []),
      starPowerTier: starPowerTierByTeam.get(leagueTeamId) ?? null,
      coachStyle: headCoachStyleByTeam.get(leagueTeamId) ?? null,
    };
  }

  // Franchise Finances & Business Operations - shared per-team season P&L,
  // used both by the owner-confidence block below (user team, for the
  // financial-health nudge) and by the league-wide finances pass near the
  // end (all 30 teams). Deterministic in its inputs, so both call sites get
  // an identical result for a given team without threading a value through.
  const financeTaxLineCents = Number(getSeasonCapRules(season).luxuryTaxCents);
  const financeSalaryFloorCents = salaryFloorCents(getSeasonCapRules(season));
  // Finances as a Gameplay Pillar (Phase 1) - this season's resolved
  // business-decision/business-event ledger, summed per team+category so it
  // folds into the P&L exactly like every other bucket (see
  // BusinessLedgerEntry). Rows are left in place afterward as permanent
  // history, not deleted.
  const businessLedgerTotals = await prisma.businessLedgerEntry.groupBy({
    by: ["leagueTeamId", "category"],
    where: { leagueId, season },
    _sum: { amountCents: true },
  });
  const otherIncomeByTeam = new Map<string, number>();
  const otherExpenseByTeam = new Map<string, number>();
  for (const row of businessLedgerTotals) {
    const amount = Number(row._sum.amountCents ?? 0n);
    if (row.category === "EVENT_INCOME") {
      otherIncomeByTeam.set(row.leagueTeamId, amount);
    } else {
      otherExpenseByTeam.set(row.leagueTeamId, amount);
    }
  }
  // Finances as a Gameplay Pillar (Phase 2) - this season's ACTIVE
  // SponsorshipDeal income, per team. Only the user's team ever has real
  // signed deals; every other team falls back to the CPU formula baseline
  // below (Tier 2 abstraction - CPU teams never "shop" for an offer).
  const activeSponsorshipDeals = await prisma.sponsorshipDeal.findMany({
    where: {
      leagueId,
      status: "ACTIVE",
      startSeason: { lte: season },
      endSeason: { gte: season },
    },
  });
  const sponsorshipRevenueByTeam = new Map<string, number>();
  const sponsorshipUpsideByTeam = new Map<string, number>();
  for (const deal of activeSponsorshipDeals) {
    sponsorshipRevenueByTeam.set(
      deal.leagueTeamId,
      (sponsorshipRevenueByTeam.get(deal.leagueTeamId) ?? 0) + Number(deal.annualValueCents),
    );
    if (deal.franchiseValueUpsideFraction > 0) {
      sponsorshipUpsideByTeam.set(
        deal.leagueTeamId,
        (sponsorshipUpsideByTeam.get(deal.leagueTeamId) ?? 0) + deal.franchiseValueUpsideFraction,
      );
    }
  }
  const dealsExpiringThisSeason = activeSponsorshipDeals.filter((d) => d.endSeason === season);

  const staffCentsByTeam = new Map<string, bigint>();
  for (const s of allStaff) {
    if (!s.leagueTeamId || !s.contract) continue;
    staffCentsByTeam.set(
      s.leagueTeamId,
      (staffCentsByTeam.get(s.leagueTeamId) ?? 0n) + s.contract.annualSalaryCents,
    );
  }
  // Per-team committed salary for the completed season, aggregated from the
  // already-loaded leaguePlayers - correct even after the DB contract-expiry
  // cleanup above, since this reads the in-memory snapshot (contract.years is
  // filtered to `season` at the top-of-function query).
  const financeContractsByTeam = new Map<string, { playerId: string; salaryCents: bigint }[]>();
  for (const lp of leaguePlayers) {
    if (!lp.leagueTeamId) continue;
    const salaryCents = lp.contract?.years[0]?.salaryCents;
    if (salaryCents === undefined) continue;
    const list = financeContractsByTeam.get(lp.leagueTeamId) ?? [];
    list.push({ playerId: lp.id, salaryCents });
    financeContractsByTeam.set(lp.leagueTeamId, list);
  }

  // Everything a per-team P&L needs, gathered once. Passing these explicitly
  // is what lets the finance pass live in its own module (./offseasonFinances)
  // instead of closing over half this function's locals.
  const financeDeps: TeamFinanceDeps = {
    season,
    userControlledTeamId: league.userControlledTeamId,
    completedEffectsByTeam,
    stillInProgressKindsByTeam,
    financeContractsByTeam,
    sponsorshipRevenueByTeam,
    otherIncomeByTeam,
    otherExpenseByTeam,
    staffCentsByTeam,
    financeTaxLineCents,
    financeSalaryFloorCents,
  };

  const mvp = computeMVP(rosteredSnapshots);
  const roy = computeRookieOfTheYear(rosteredSnapshots);
  const mip = computeMostImprovedPlayer(developmentSnapshots);
  const dpoy = computeDefensivePlayerOfTheYear(defensiveSnapshots);
  const sixthMan = computeSixthManOfTheYear(benchSnapshots);

  // Coach of the Year (Phase 15b) - eligibility uses each coach's original
  // leagueTeamId from the allStaff fetch (not the staffUpdates value above),
  // so a coach whose contract expires this same offseason still gets credit
  // for the season they actually coached.
  const headCoachSnapshots = allStaff
    .filter(
      (s) =>
        s.role === "HEAD_COACH" && s.leagueTeamId !== null && teamWinPctById.has(s.leagueTeamId),
    )
    .map((s) => ({
      staffId: s.id,
      teamWinPct: teamWinPctById.get(s.leagueTeamId!)!,
      quality: s.quality,
    }));
  const coachOfTheYear = computeCoachOfTheYear(headCoachSnapshots);

  for (let i = 0; i < playerUpdates.length; i += UPDATE_BATCH_SIZE) {
    const batch = playerUpdates.slice(i, i + UPDATE_BATCH_SIZE);
    await Promise.all(
      batch.map((u) =>
        prisma.leaguePlayer.update({
          where: { id: u.id },
          data: {
            overallRating: u.overallRating,
            isActive: u.isActive,
            leagueTeamId: u.leagueTeamId,
            retiredSeason: u.retiredSeason,
            rotationSlot: u.rotationSlot,
            targetMinutesPerGame: u.targetMinutesPerGame,
            morale: u.morale,
            tradeRequestActive: u.tradeRequestActive,
            // A new season starts with everyone healthy - team wins/losses
            // reset to 0 too, so an in-season injury's `returnsAt` (measured
            // in that team's own games played) would otherwise never
            // resolve if it crossed the season boundary unhealed.
            injuryStatus: "HEALTHY",
            injuryReturnsAtGamesPlayed: null,
          },
        }),
      ),
    );
  }

  await Promise.all([
    contractIdsToDelete.length > 0
      ? prisma.contract.deleteMany({ where: { id: { in: contractIdsToDelete } } })
      : Promise.resolve(),
    prisma.leagueTeam.updateMany({
      where: { leagueId },
      data: { wins: 0, losses: 0, currentStreak: 0 },
    }),
  ]);

  // CPU Autonomous GM Intelligence (Phase 1) - a fresh Contract/ContractYear
  // pair per CPU re-signing, mirroring the exact shape maybeExecuteCpuSigning
  // (src/lib/actions/leagueEvents.ts) already uses, with a Re-Signing-Rights
  // mechanism tag and a short 2-year term (a 1-year-only cycle would just
  // recreate the churn this phase exists to fix) instead of that function's
  // 1-year veteran-minimum deal.

  const cpuReSigningNewsRows = cpuReSignings.map((r) => {
    const team = teamById.get(r.leagueTeamId)?.team;
    const player = leaguePlayerById.get(r.leaguePlayerId)!.player;
    return {
      leagueId,
      season: newSeason,
      type: "SIGNING" as const,
      description: team
        ? describeSigning(
            `${team.city} ${team.name}`,
            player.fullName,
            r.years,
            r.offerSalaryCents * BigInt(r.years),
          )
        : `${player.fullName} re-signs for another ${r.years} seasons.`,
      importance: importanceForRating(r.finalRating),
      teamIds: [r.leagueTeamId],
    };
  });

  if (cpuReSignings.length > 0) {
    await Promise.all(
      cpuReSignings.map(async (r) => {
        const contract = await prisma.contract.create({
          data: {
            leaguePlayerId: r.leaguePlayerId,
            leagueTeamId: r.leagueTeamId,
            signedSeason: newSeason,
            startSeason: newSeason,
            endSeason: newSeason + r.years - 1,
            signedUsing: "BIRD_RIGHTS",
          },
        });
        await prisma.contractYear.createMany({
          data: Array.from({ length: r.years }, (_, i) => ({
            contractId: contract.id,
            season: newSeason + i,
            salaryCents: r.offerSalaryCents,
            guaranteedCents: r.offerSalaryCents,
          })),
        });
      }),
    );
  }
  if (cpuReSigningNewsRows.length > 0) {
    await prisma.leagueTransaction.createMany({ data: cpuReSigningNewsRows });
  }

  // CPU free-agent signings need contracts for exactly the same reason
  // re-signings do: a player sitting on a roster with no contract row is
  // invisible to every cap sheet in the product, which would silently
  // under-count that club's payroll from here on.
  //
  // `signedUsing: NONE` is correct rather than a placeholder - the pass only
  // ever signs within a team's own cap space, so no exception was invoked.
  if (cpuFreeAgentSignings.length > 0) {
    await Promise.all(
      cpuFreeAgentSignings.map(async (s) => {
        const contract = await prisma.contract.create({
          data: {
            leaguePlayerId: s.leaguePlayerId,
            leagueTeamId: s.leagueTeamId,
            signedSeason: newSeason,
            startSeason: newSeason,
            endSeason: newSeason + s.years - 1,
            signedUsing: "NONE",
          },
        });
        await prisma.contractYear.createMany({
          data: Array.from({ length: s.years }, (_, i) => ({
            contractId: contract.id,
            season: newSeason + i,
            salaryCents: s.salaryCents,
            guaranteedCents: s.salaryCents,
          })),
        });
      }),
    );

    // The market is only pressure if the user can see it resolve. A player they
    // were weighing turning up on a rival's roster with no notice would read as
    // the game losing track of him.
    await prisma.leagueTransaction.createMany({
      data: cpuFreeAgentSignings.map((s) => {
        const team = teamById.get(s.leagueTeamId)?.team;
        const name = leaguePlayerById.get(s.leaguePlayerId)?.player.fullName ?? "A free agent";
        return {
          leagueId,
          season: newSeason,
          type: "SIGNING" as const,
          description: team
            ? `${name} has signed with the ${team.city} ${team.name}.`
            : `${name} has signed with a rival.`,
          importance: importanceForRating(
            leaguePlayerById.get(s.leaguePlayerId)?.overallRating ?? 0,
          ),
          teamIds: [s.leagueTeamId],
        };
      }),
    });
  }

  // --- Staff persistence (Phase 15a) ---
  // CPU auto-backfill: give every CPU vacancy the best available candidate
  // for that role from the pool computed below (which includes both the
  // pre-existing free-agent pool and anyone who just became unemployed this
  // same offseason, e.g. a contract expiring). The user's own vacancy is
  // deliberately left out - filling it is their call via hireStaffAction.
  const finalLeagueTeamByStaffId = new Map(staffUpdates.map((u) => [u.id, u.leagueTeamId]));
  const availablePoolByRole = new Map<StaffRole, { id: string; quality: number }[]>();
  for (const staff of allStaff) {
    if (staffIdsToDelete.includes(staff.id)) continue;
    if (finalLeagueTeamByStaffId.get(staff.id) !== null) continue;
    const list = availablePoolByRole.get(staff.role) ?? [];
    list.push({ id: staff.id, quality: staff.quality });
    availablePoolByRole.set(staff.role, list);
  }

  const cpuHires: {
    staffId: string;
    fullName: string;
    leagueTeamId: string;
    role: StaffRole;
    quality: number;
  }[] = [];
  for (const vacancy of vacatedCpuRoles) {
    const pool = availablePoolByRole.get(vacancy.role) ?? [];
    if (pool.length === 0) continue;
    // Best-available-for-a-reasonable-price heuristic - no real CPU-vs-CPU
    // bidding war, just a deterministic top-quality pick from the pool.
    pool.sort((a, b) => b.quality - a.quality);
    const chosen = pool.shift()!;
    availablePoolByRole.set(vacancy.role, pool);
    const staffRecord = allStaff.find((s) => s.id === chosen.id)!;
    cpuHires.push({
      staffId: chosen.id,
      fullName: staffRecord.fullName,
      leagueTeamId: vacancy.leagueTeamId,
      role: vacancy.role,
      quality: chosen.quality,
    });
    const entry = staffUpdates.find((u) => u.id === chosen.id);
    if (entry) entry.leagueTeamId = vacancy.leagueTeamId;
  }

  await Promise.all([
    ...staffUpdates.map((u) =>
      prisma.staff.update({
        where: { id: u.id },
        data: { age: u.age, leagueTeamId: u.leagueTeamId, reputation: u.reputation },
      }),
    ),
    staffIdsToDelete.length > 0
      ? prisma.staff.deleteMany({ where: { id: { in: staffIdsToDelete } } })
      : Promise.resolve(),
    staffContractIdsToDelete.length > 0
      ? prisma.staffContract.deleteMany({ where: { id: { in: staffContractIdsToDelete } } })
      : Promise.resolve(),
  ]);

  if (cpuHires.length > 0) {
    await prisma.staffContract.createMany({
      data: cpuHires.map((hire) => ({
        staffId: hire.staffId,
        leagueTeamId: hire.leagueTeamId,
        signedSeason: newSeason,
        startSeason: newSeason,
        endSeason: newSeason + CPU_AUTO_HIRE_CONTRACT_YEARS - 1,
        annualSalaryCents: computeStaffSalary(hire.role, hire.quality),
      })),
    });
  }

  const staffHireNewsRows = cpuHires.map((hire) => {
    const team = teamById.get(hire.leagueTeamId)?.team;
    return {
      leagueId,
      season,
      type: "STAFF_HIRE" as const,
      description: team
        ? describeStaffHire(`${team.city} ${team.name}`, hire.fullName, STAFF_ROLE_LABEL[hire.role])
        : `${hire.fullName} has a new job as ${STAFF_ROLE_LABEL[hire.role]}.`,
      importance: importanceForRating(hire.quality),
      teamIds: [hire.leagueTeamId],
    };
  });

  if (staffRetirementEvents.length > 0 || staffHireNewsRows.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: [
        ...staffRetirementEvents.map((event) => ({
          leagueId,
          season,
          type: "RETIREMENT" as const,
          description: event.description,
          importance: event.importance,
          teamIds: event.teamIds,
        })),
        ...staffHireNewsRows,
      ],
    });
  }

  const awardRows = (
    [
      mvp && { category: "MVP" as const, ...mvp },
      roy && { category: "ROOKIE_OF_THE_YEAR" as const, ...roy },
      mip && { category: "MOST_IMPROVED_PLAYER" as const, ...mip },
      dpoy && { category: "DEFENSIVE_PLAYER_OF_THE_YEAR" as const, ...dpoy },
      sixthMan && { category: "SIXTH_MAN_OF_THE_YEAR" as const, ...sixthMan },
    ].filter(Boolean) as {
      category:
        | "MVP"
        | "ROOKIE_OF_THE_YEAR"
        | "MOST_IMPROVED_PLAYER"
        | "DEFENSIVE_PLAYER_OF_THE_YEAR"
        | "SIXTH_MAN_OF_THE_YEAR";
      leaguePlayerId: string;
      value: number;
    }[]
  ).map((a) => ({
    leagueId,
    season,
    category: a.category,
    leaguePlayerId: a.leaguePlayerId,
    value: a.value,
  }));

  if (awardRows.length > 0) {
    await prisma.seasonAward.createMany({ data: awardRows });
  }

  // Real news, not a new source of truth - announces the exact SeasonAward
  // rows just written above, using data already fetched (leaguePlayers,
  // leaguePlayerById built earlier) rather than a second query.
  const awardNewsRows = awardRows
    .map((a) => {
      const winner = leaguePlayerById.get(a.leaguePlayerId);
      if (!winner) return null;
      return {
        leagueId,
        season,
        type: "AWARD" as const,
        description: `${winner.player.fullName} wins ${AWARD_NEWS_LABEL[a.category]}`,
        importance: importanceForRating(winner.overallRating),
        teamIds: winner.leagueTeamId ? [winner.leagueTeamId] : [],
      };
    })
    .filter((row) => row !== null);

  if (awardNewsRows.length > 0) {
    await prisma.leagueTransaction.createMany({ data: awardNewsRows });
  }

  // Fan Engagement Deepening (Phase 1) - awards are only ever knowable
  // right here (season end), so they get their own dedicated delta at this
  // natural determination point. Accumulated into awardFanHappinessDeltaByTeam
  // (declared earlier, alongside the other per-team maps) rather than
  // written immediately - the actual write happens once, later, in the
  // same unified fanHappinessUpdates pass every other team's season-end
  // adjustment already goes through, so this can never race with or be
  // silently overwritten by that pass reading a stale snapshot.
  for (const a of awardRows) {
    const winner = leaguePlayerById.get(a.leaguePlayerId);
    if (!winner?.leagueTeamId) continue;
    const rawDelta = computeAwardSentimentDelta(a.category);
    // Fans Page Redesign (Phase 3) - award deltas are always positive, so
    // only Loyalty's bidirectional dampening applies here (Patience only
    // scales negative deltas).
    const winnerTeam = teamById.get(winner.leagueTeamId);
    const delta = applyScaledFanHappinessDelta(
      winnerTeam?.fanHappiness ?? 65,
      rawDelta,
      winnerTeam?.fanCulture ?? null,
    ).scaledDelta;
    awardFanHappinessDeltaByTeam.set(
      winner.leagueTeamId,
      (awardFanHappinessDeltaByTeam.get(winner.leagueTeamId) ?? 0) + delta,
    );
    // Fans Page Redesign (Phase 1) - one row per award, not just the
    // per-team aggregate, so the page can name whose trophy it was.
    awardSentimentRows.push({
      leagueId,
      leagueTeamId: winner.leagueTeamId,
      season,
      kind: "AWARD",
      delta,
      description: describeAwardSentiment(winner.player.fullName, AWARD_NEWS_LABEL[a.category]),
      leaguePlayerId: winner.id,
    });
  }

  // Coach of the Year (Phase 15b) - separate StaffAward model/table, not a
  // branch on SeasonAward (see coachOfTheYear.ts / docs/ARCHITECTURE.md for
  // why), so it gets its own createMany + news block parallel to the player
  // award ones above rather than reusing awardRows/awardNewsRows.
  if (coachOfTheYear) {
    await prisma.staffAward.create({
      data: {
        leagueId,
        season,
        category: "COACH_OF_THE_YEAR",
        staffId: coachOfTheYear.staffId,
        value: coachOfTheYear.value,
      },
    });

    const staffById = new Map(allStaff.map((s) => [s.id, s]));
    const winner = staffById.get(coachOfTheYear.staffId);
    if (winner) {
      await prisma.leagueTransaction.create({
        data: {
          leagueId,
          season,
          type: "AWARD",
          description: `${winner.fullName} wins Coach of the Year`,
          importance: importanceForRating(winner.quality),
          teamIds: winner.leagueTeamId ? [winner.leagueTeamId] : [],
        },
      });
    }
  }

  if (retirementEvents.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: retirementEvents.map((event) => ({
        leagueId,
        season,
        type: "RETIREMENT" as const,
        description: event.description,
        importance: event.importance,
        teamIds: event.teamIds,
      })),
    });
  }

  if (moraleNewsEvents.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: moraleNewsEvents.map((event) => ({
        leagueId,
        season,
        type: "PLAYER_MORALE" as const,
        description: event.description,
        importance: event.importance,
        teamIds: event.teamIds,
        subjectLeaguePlayerId: event.subjectLeaguePlayerId,
      })),
    });
  }

  const schedule = generateRoundRobinSchedule(
    league.teams.map((t) => ({
      leagueTeamId: t.id,
      conference: t.team.conference,
      division: t.team.division,
    })),
    `${leagueId}-${newSeason}`,
    newSeason,
  );
  await prisma.game.createMany({
    data: schedule.map((game) => ({
      leagueId,
      season: newSeason,
      gameNumber: game.gameNumber,
      dayIndex: game.dayIndex,
      homeLeagueTeamId: game.homeLeagueTeamId,
      awayLeagueTeamId: game.awayLeagueTeamId,
    })),
  });

  // Keep the rolling future-pick window (Phase 11a) sliding forward: the
  // window through `newSeason + FUTURE_PICK_WINDOW_YEARS` already exists
  // except for this one new far-edge season.
  await prisma.draftPick.createMany({
    data: buildFuturePickRows(
      leagueId,
      league.teams.map((t) => t.id),
      [newSeason + FUTURE_PICK_WINDOW_YEARS],
    ).map((row) => ({ ...row, overallPickNumber: null })),
  });

  let ownerConfidence = league.ownerConfidence;
  let payrollReductionTargetCents: bigint | null = null;
  let payrollDirectiveSeason: number | null = null;
  // Franchise Finances (Phase D) - an outstanding "return to profitability"
  // mandate carries forward untouched unless the owner block below issues,
  // resolves, or clears it.
  let financialMandateSeason: number | null = league.financialMandateSeason;
  // Finances as a Gameplay Pillar (Phase 3) - whether the currently
  // outstanding directive/mandate was a negotiated, higher-stakes one (see
  // OWNERSHIP_PAYROLL_NEGOTIATION/OWNERSHIP_FINANCIAL_NEGOTIATION) - read
  // at the resolution point below, then cleared either way.
  let payrollDirectiveStaked = league.payrollDirectiveStaked;
  let financialMandateStaked = league.financialMandateStaked;
  // Phase 6 - ownerArchetype now lives on the user's own LeagueTeam row, not
  // League. userLeagueTeamId can be null before a team's been picked; the
  // schema default covers that transient state, never persisted meaningfully.
  const userLeagueTeamForArchetype = userLeagueTeamId ? teamById.get(userLeagueTeamId) : undefined;
  let ownerArchetype = userLeagueTeamForArchetype?.ownerArchetype ?? "PATIENT_BUILDER";
  let ownerArchetypeSince = userLeagueTeamForArchetype?.ownerArchetypeSince ?? newSeason;
  const ownershipMessages: string[] = [];
  // Finances as a Gameplay Pillar (Phase 3) - negotiation cards created this
  // pass (payroll directive / financial mandate), created alongside the
  // standard directive so the user can push back on it - see the
  // OWNERSHIP_PAYROLL_NEGOTIATION/OWNERSHIP_FINANCIAL_NEGOTIATION kinds.
  const negotiationDecisions: ReturnType<typeof buildPayrollDirectiveNegotiation>[] = [];

  if (userLeagueTeamId && priorExpectation) {
    // `newSeasonContractYears` doesn't depend on anything computed below (only
    // on `newSeason`/`userLeagueTeamId`, both already known) - fetched here
    // alongside the other independent queries rather than later in its own
    // round trip.
    const [series, playInGame, newSeasonContractYears, userPlayoffHomeGames, recentSnapshots] =
      await Promise.all([
        prisma.playoffSeries.findMany({
          where: {
            leagueId,
            season,
            OR: [{ higherSeedTeamId: userLeagueTeamId }, { lowerSeedTeamId: userLeagueTeamId }],
          },
        }),
        prisma.game.findFirst({
          where: {
            leagueId,
            season,
            type: "PLAY_IN",
            OR: [{ homeLeagueTeamId: userLeagueTeamId }, { awayLeagueTeamId: userLeagueTeamId }],
          },
        }),
        prisma.contractYear.findMany({
          where: { season: newSeason, contract: { leagueTeamId: userLeagueTeamId } },
          select: { salaryCents: true, contract: { select: { leaguePlayerId: true } } },
        }),
        // Franchise Finances - home playoff/play-in games this postseason, for
        // the user team's gate revenue (and thus the financial-health nudge).
        prisma.game.count({
          where: {
            leagueId,
            season,
            type: { in: ["PLAYOFF", "PLAY_IN"] },
            homeLeagueTeamId: userLeagueTeamId,
          },
        }),
        // Franchise Finances (Phase D) - the two most recent completed seasons'
        // net income, for the multi-season financial standing (this season's
        // net income is computed inline below and prepended).
        prisma.financialSnapshot.findMany({
          where: { leagueId, leagueTeamId: userLeagueTeamId },
          orderBy: { season: "desc" },
          take: 2,
          select: { netIncomeCents: true },
        }),
      ]);

    const actualOutcome = computeActualOutcome(userLeagueTeamId, !!playInGame, series);
    const verdict = evaluateSeason(priorExpectation.expectationLevel, actualOutcome);

    const oldCapSheet = computeCapSheet({
      season,
      contracts: oldSeasonContractYears.map((cy) => ({
        playerId: cy.contract.leaguePlayerId,
        salaryCents: cy.salaryCents,
      })),
    });
    const oldPayrollTier = computePayrollTier(oldCapSheet.apronLevel);

    // Fan engagement - computed here (not in the all-30-teams loop further
    // down) because it needs `verdict`, which only exists for the user's
    // own team (SeasonExpectation is user-team-only). A thrilled fanbase
    // modestly softens the owner-confidence hit below; an empty building
    // modestly sharpens it.
    const userFanHappinessDelta = computeFanHappinessDelta({
      evaluationVerdict: verdict,
      teamWinPct: teamWinPctById.get(userLeagueTeamId) ?? 0.5,
      transactionSentiment: computeTransactionSentiment(
        transactionsByTeam.get(userLeagueTeamId) ?? [],
      ),
      starPowerTier: starPowerTierByTeam.get(userLeagueTeamId) ?? null,
      coachStyle: headCoachStyleByTeam.get(userLeagueTeamId) ?? null,
    });
    const userTeamFanHappiness = teamById.get(userLeagueTeamId)?.fanHappiness ?? 65;
    const newUserFanHappiness = Math.max(
      0,
      Math.min(100, userTeamFanHappiness + userFanHappinessDelta),
    );
    fanHappinessByTeam.set(userLeagueTeamId, newUserFanHappiness);

    // Franchise Finances - the money->owner feedback loop. Compute the user
    // team's season P&L (same deterministic helper the league-wide pass uses),
    // then fold it into a multi-season financial *standing* ownership reacts
    // to. Strong standing buys patience + tax-spending backing; sustained
    // losses bring escalating pressure. Cap/CBA rules are untouched.
    const userLeagueTeam = teamById.get(userLeagueTeamId);
    let financialStanding: FinancialStanding = "STABLE";
    let userNetIncome = 0;
    let userNewCash = 0;
    if (userLeagueTeam) {
      const userFinances = computeTeamSeasonFinances(financeDeps, {
        leagueTeamId: userLeagueTeamId,
        marketSize: userLeagueTeam.marketSizeOverride ?? userLeagueTeam.team.marketSize,
        fanHappiness: newUserFanHappiness,
        starTier: starPowerTierByTeam.get(userLeagueTeamId) ?? null,
        ticketPosture: userLeagueTeam.ticketPricingPosture,
        departmentBudget: teamDepartmentBudget(userLeagueTeam),
        seasonTicketBase: userLeagueTeam.seasonTicketBase,
        arenaQualityIndex: userLeagueTeam.arenaQualityIndex,
        debtCents: userLeagueTeam.debtCents,
        playoffHomeGames: userPlayoffHomeGames,
        wonChampionship: finals.winnerTeamId === userLeagueTeamId,
      });
      userNetIncome = userFinances.netIncome;
      userNewCash = Number(userLeagueTeam.cashReserveCents) + userNetIncome;
      financialStanding = computeFinancialStanding(
        [userNetIncome, ...recentSnapshots.map((s) => Number(s.netIncomeCents))],
        userNewCash,
        Number(userLeagueTeam.debtCents),
      );
    }

    // Verdict-driven base swing, then financial standing modulates it: a well-
    // financed franchise gets patience on a down year (never dampens a good
    // one), and standing applies a small ongoing goodwill/erosion nudge.
    const baseConfidenceDelta = computeConfidenceDelta(
      verdict,
      oldPayrollTier,
      newUserFanHappiness,
    );
    const patienceAdjusted =
      baseConfidenceDelta < 0
        ? Math.round(baseConfidenceDelta * financialStandingPatienceFactor(financialStanding))
        : baseConfidenceDelta;
    // Finances as a Gameplay Pillar (Phase 3) - "Ownership as a Character":
    // a second, archetype-level multiplier on top of the verdict/payroll/
    // fan-happiness/financial-standing swing already computed above - a
    // Meddler feels a bad season much more than an Absentee does.
    const confidenceDelta = Math.round(
      (patienceAdjusted + financialStandingConfidenceBonus(financialStanding)) *
        archetypeConfidenceDeltaMultiplier(ownerArchetype),
    );
    ownerConfidence = ownerConfidence + confidenceDelta;

    ownershipMessages.push(
      describeSeasonEvaluation(
        verdict,
        priorExpectation.expectationLevel,
        actualOutcome.label,
        oldPayrollTier,
      ),
    );
    // A financially strong franchise gets an explicit note that ownership will
    // back tax spending - the positive reinforcement side of the loop. The
    // DISTRESSED side is covered by the mandate messaging below.
    if (financialStanding === "STRONG") {
      const standingMessage = describeFinancialStandingMessage(financialStanding);
      if (standingMessage) ownershipMessages.push(standingMessage);
    }

    await prisma.seasonExpectation.update({
      where: { id: priorExpectation.id },
      data: {
        actualResultLabel: actualOutcome.label,
        verdict,
        ownerConfidenceDelta: confidenceDelta,
      },
    });

    // Resolve a directive that targeted this season, whether it was met or
    // ignored - a directive is a one-time check, not something that lingers
    // once its deadline season arrives.
    if (league.payrollReductionTargetCents != null && league.payrollDirectiveSeason === season) {
      const complied = oldCapSheet.totalSalaryCents <= league.payrollReductionTargetCents;
      // Finances as a Gameplay Pillar (Phase 3) - a staked directive
      // (the user pushed back and bet on delivering it) swings harder both
      // ways than the standard +5/-15.
      const [metReward, missedPenalty] = payrollDirectiveStaked ? [12, -30] : [5, -15];
      ownerConfidence = ownerConfidence + (complied ? metReward : missedPenalty);
      ownershipMessages.push(describeDirectiveCompliance(complied));
      payrollDirectiveStaked = false;
    }

    // Franchise Finances (Phase D) - resolve an outstanding "return to
    // profitability" mandate that targeted this season. Met when the franchise
    // is back in the black (positive cash and a non-losing season); ignored
    // otherwise, with a heavy confidence hit that can push the GM toward the
    // firing band. Cleared either way - a one-time check like the payroll one.
    if (financialMandateSeason === season) {
      const met = userNewCash >= 0 && userNetIncome >= 0;
      // Finances as a Gameplay Pillar (Phase 3) - a staked mandate doubles
      // both the reward and the penalty versus the standard terms.
      const [metReward, missedPenalty] = financialMandateStaked
        ? [FINANCIAL_MANDATE_MET_REWARD * 2, FINANCIAL_MANDATE_IGNORED_PENALTY * 2]
        : [FINANCIAL_MANDATE_MET_REWARD, FINANCIAL_MANDATE_IGNORED_PENALTY];
      ownerConfidence = ownerConfidence + (met ? metReward : missedPenalty);
      ownershipMessages.push(describeFinancialMandateResolution(met, userNewCash));
      financialMandateSeason = null;
      financialMandateStaked = false;
    }

    ownerConfidence = Math.max(
      MIN_OWNER_CONFIDENCE,
      Math.min(MAX_OWNER_CONFIDENCE, ownerConfidence),
    );

    // The new season's expectation is set from the post-rollover roster
    // (after development/retirement/contract-expiry above), not the
    // roster as it stood before the offseason - it should reflect what the
    // user is actually starting the new season with.
    const newSeasonRoster = playerUpdates.filter(
      (u) => u.leagueTeamId === userLeagueTeamId && u.retiredSeason === null,
    );
    const newCapSheet = computeCapSheet({
      season: newSeason,
      contracts: newSeasonContractYears.map((cy) => ({
        playerId: cy.contract.leaguePlayerId,
        salaryCents: cy.salaryCents,
      })),
    });
    const newPayrollTier = computePayrollTier(newCapSheet.apronLevel);
    const newTeamStrength = computeTeamStrength(newSeasonRoster.map((u) => u.overallRating));
    const baseExpectationLevel = computeExpectationLevel(newPayrollTier, newTeamStrength);
    // Finances as a Gameplay Pillar (Phase 3) - the same roster reads as a
    // higher or lower bar depending on who owns the team.
    const baseExpectationIndex = EXPECTATION_LEVEL_ORDER.indexOf(baseExpectationLevel);
    const shiftedIndex = Math.max(
      0,
      Math.min(
        EXPECTATION_LEVEL_ORDER.length - 1,
        baseExpectationIndex + archetypeExpectationLevelShift(ownerArchetype),
      ),
    );
    const newExpectationLevel = EXPECTATION_LEVEL_ORDER[shiftedIndex];

    await prisma.seasonExpectation.create({
      data: { leagueId, season: newSeason, expectationLevel: newExpectationLevel },
    });
    ownershipMessages.push(describeNewExpectation(newExpectationLevel));

    // A fresh payroll directive only fires when ownership is already unhappy
    // and the team is still spending heavily - AND (Phase D) the owner isn't
    // financially backing the spend. This is the emergent tax tolerance: a
    // financially strong franchise never gets nagged to cut payroll, so its
    // accumulated success translates into runway to keep an expensive
    // contender together. Cap rules are unchanged - only the owner's reaction.
    const stillHeavySpend = newPayrollTier === "SIGNIFICANT" || newPayrollTier === "EXTREME";
    if (
      // Finances as a Gameplay Pillar (Phase 3) - archetype-adjusted
      // effective threshold (a Penny-Pincher's is higher, easier to fall
      // under; an Absentee's is much lower, rarely triggers).
      ownerConfidence <
        archetypeDirectiveConfidenceThreshold(ownerArchetype, DIRECTIVE_CONFIDENCE_THRESHOLD) &&
      stillHeavySpend &&
      !ownerBacksTaxSpending(financialStanding)
    ) {
      payrollReductionTargetCents = BigInt(
        Math.round(Number(newCapSheet.totalSalaryCents) * DIRECTIVE_PAYROLL_REDUCTION_FRACTION),
      );
      payrollDirectiveSeason = newSeason + 1;
      ownershipMessages.push(
        describePayrollDirective(payrollReductionTargetCents, payrollDirectiveSeason),
      );
      // Finances as a Gameplay Pillar (Phase 3) - the companion negotiation
      // card: accept the standard terms above, or push back and stake a
      // bigger swing on delivering more.
      negotiationDecisions.push(
        buildPayrollDirectiveNegotiation({
          payrollReductionTargetCents: Number(payrollReductionTargetCents),
          deadlineSeason: payrollDirectiveSeason,
        }),
      );
    }

    // Escalating loss pressure - sustained losses (DISTRESSED standing) issue a
    // "return to profitability" mandate if one isn't already outstanding.
    if (
      financialMandateSeason === null &&
      archetypeShouldIssueFinancialMandate(
        ownerArchetype,
        financialStanding,
        shouldIssueFinancialMandate(financialStanding),
      )
    ) {
      financialMandateSeason = newSeason + FINANCIAL_MANDATE_DEADLINE_YEARS;
      ownerConfidence = ownerConfidence + FINANCIAL_MANDATE_ISSUE_PENALTY;
      ownershipMessages.push(describeFinancialMandate(financialMandateSeason));
      negotiationDecisions.push(
        buildFinancialMandateNegotiation({ deadlineSeason: financialMandateSeason }),
      );
    }

    // Finances as a Gameplay Pillar (Phase 3) - the highest-value
    // replayability mechanic in the design brief: occasionally the
    // franchise sells, and the new owner brings their own personality.
    // Not something the user opts into or out of - it happens TO them,
    // announced as a season-boundary news beat, same as any other
    // ownership development.
    if (shouldOwnershipChange(newSeason - ownerArchetypeSince)) {
      const newArchetype = rollOwnerArchetype();
      ownerConfidence = confidenceAfterOwnershipChange(ownerConfidence);
      ownerArchetype = newArchetype;
      ownerArchetypeSince = newSeason;
      payrollDirectiveStaked = false;
      financialMandateStaked = false;
      ownershipMessages.push(describeOwnershipChange(newArchetype));
    }
  }

  // Fan engagement persistence - every team, not just the user's
  // (franchisePopularity needs a full-league comparison to mean
  // anything). The user's team may already be in fanHappinessByTeam
  // (computed above, alongside the owner-confidence nudge); every other
  // team falls back to the win%-based path, same split already
  // established for Head Coach reputation drift.
  // Fans Page Redesign (Phase 1) - the season-result and ticket-posture
  // deltas below were previously folded straight into one number with no
  // record of either cause; captured here so the ledger can name them
  // separately from the award deltas already collected above.
  const seasonResultSentimentRows: SentimentRecord[] = [];
  const fanHappinessUpdates = league.teams.map((lt) => {
    const rawSeasonResultDelta = fanHappinessByTeam.has(lt.id)
      ? fanHappinessByTeam.get(lt.id)! - lt.fanHappiness
      : computeFanHappinessDelta(fallbackFanHappinessInputs(lt.id));
    // Fans Page Redesign (Phase 3).
    const seasonResultDelta = applyScaledFanHappinessDelta(
      lt.fanHappiness,
      rawSeasonResultDelta,
      lt.fanCulture,
    ).scaledDelta;
    const baseFanHappiness = Math.max(0, Math.min(100, lt.fanHappiness + seasonResultDelta));
    if (seasonResultDelta !== 0) {
      seasonResultSentimentRows.push({
        leagueId,
        leagueTeamId: lt.id,
        season,
        kind: "SEASON_RESULT",
        delta: seasonResultDelta,
        description:
          seasonResultDelta > 0
            ? "The season lived up to what fans expected, or exceeded it."
            : "The season fell short of what fans expected.",
      });
    }
    // Fan Engagement Deepening (Phase 1) - award deltas layer on top of
    // whichever base this team resolved to above, applied here (not
    // written immediately when the award was determined) so this is the
    // one place fanHappiness is actually persisted for the season boundary,
    // avoiding any race with this same unified pass.
    // Franchise Finances (Phase B) - ticket-pricing posture is the long-term
    // half of the pricing tradeoff: premium pricing quietly sours the fanbase
    // each season, fan-friendly pricing wins a little goodwill. Small and
    // bounded (STANDARD is 0), applied to every team since CPU teams price
    // too. The revenue half of the tradeoff is already applied in the P&L pass.
    // Fans Page Redesign (Phase 3) - scaled against the post-season-result
    // baseline, since it's applied on top of that base below.
    const ticketPostureDelta = applyScaledFanHappinessDelta(
      baseFanHappiness,
      TICKET_POSTURE_FAN_DELTA[lt.ticketPricingPosture],
      lt.fanCulture,
    ).scaledDelta;
    if (ticketPostureDelta !== 0) {
      seasonResultSentimentRows.push({
        leagueId,
        leagueTeamId: lt.id,
        season,
        kind: "BUSINESS_DECISION",
        delta: ticketPostureDelta,
        description:
          ticketPostureDelta > 0
            ? "Fan-friendly pricing earned some goodwill this season."
            : "Premium ticket pricing quietly soured the fanbase this season.",
      });
    }
    const newFanHappiness = applyFanHappinessDelta(
      baseFanHappiness,
      (awardFanHappinessDeltaByTeam.get(lt.id) ?? 0) + ticketPostureDelta,
    );
    const starPowerTier = starPowerTierByTeam.get(lt.id) ?? null;
    // Finances as a Gameplay Pillar (Phase 4) - matches computeTeamSeasonFinances'
    // own attendance-floor/Marketing-boost treatment exactly, so this
    // persisted snapshot (the trend-chart numbers) never disagrees with
    // what actually drove that season's P&L.
    const attendancePct = Math.max(
      computeAttendancePct(newFanHappiness, lt.team.marketSize),
      computeAttendanceFloor(lt.seasonTicketBase),
    );
    return {
      leagueTeamId: lt.id,
      fanHappiness: newFanHappiness,
      attendancePct,
      franchisePopularity: computeFranchisePopularity(
        newFanHappiness,
        starPowerTier,
        lt.team.marketSize,
        departmentQualityDelta(lt.marketingLevel),
      ),
    };
  });

  await Promise.all([
    ...fanHappinessUpdates.map((u) =>
      prisma.leagueTeam.update({
        where: { id: u.leagueTeamId },
        data: { fanHappiness: u.fanHappiness },
      }),
    ),
    // Fans Page Redesign (Phase 1) - the season-result, ticket-posture, and
    // award attributions collected above, committed alongside the season
    // boundary they belong to.
    recordFanSentimentMany([...seasonResultSentimentRows, ...awardSentimentRows]),
  ]);
  await prisma.fanHappinessSnapshot.createMany({
    data: fanHappinessUpdates.map((u) => ({
      leagueId,
      leagueTeamId: u.leagueTeamId,
      season,
      fanHappiness: u.fanHappiness,
      attendancePct: u.attendancePct,
      franchisePopularity: u.franchisePopularity,
    })),
  });

  // Fans Page Redesign (Phase 3) - Fan Culture, recomputed wholesale for
  // every team right after this season's snapshot lands, so the window it
  // recomputes from already includes the season that just finished.
  const teamCultureContexts = league.teams.map((lt) => ({
    leagueTeamId: lt.id,
    marketSize: lt.team.marketSize,
    ticketPricingPosture: lt.ticketPricingPosture,
    hasRelocated: lt.relocatedCityName != null,
    iconScore: iconScoreByTeam.get(lt.id) ?? 0,
  }));
  const { traitsByTeam: cultureTraitsByTeam, inputsByTeam: cultureInputsByTeam } =
    await recomputeFanCultures(leagueId, season, teamCultureContexts);

  // Fans Page Redesign (Phase 4) - What the City Wants, computed right after
  // Fan Culture since the mandate depends on this same pass's Patience/
  // Expectation Ceiling. Reuses the culture history inputs already fetched
  // above and franchisePopularity already computed in fanHappinessUpdates,
  // rather than re-querying either.
  const franchisePopularityByTeam = new Map(
    fanHappinessUpdates.map((u) => [u.leagueTeamId, u.franchisePopularity]),
  );
  const mandatePrimaryByTeam = await recomputeFanMandates(
    leagueId,
    season,
    teamCultureContexts.map((t) => ({
      ...t,
      franchisePopularity: franchisePopularityByTeam.get(t.leagueTeamId) ?? 50,
    })),
    cultureTraitsByTeam,
    cultureInputsByTeam,
  );

  // Fans Page Redesign (Phase 5) - trajectory narratives (Rebuild Progress
  // Watch, Championship Window Watch), opened/updated/closed only here at
  // the season boundary since both depend on the mandate just recomputed
  // above. Event-driven narratives (icon-departure fallout) already opened
  // immediately in trade.ts, at the moment of the actual trade.
  await progressFanNarratives(
    leagueId,
    league.teams.map((lt) => ({
      leagueTeamId: lt.id,
      season,
      fanHappiness:
        fanHappinessUpdates.find((u) => u.leagueTeamId === lt.id)?.fanHappiness ?? lt.fanHappiness,
      primaryMandate: mandatePrimaryByTeam.get(lt.id) ?? "BE_PATIENT_WITH_THE_KIDS",
      wonChampionshipThisSeason: finals.winnerTeamId === lt.id,
    })),
  );

  // The season-boundary finance pass: the 30-team P&L, capital projects,
  // CPU business policy, CPU relocation, and the news all of that generates.
  // Lives in ./offseasonFinances so the per-team P&L is testable on its own.
  const { userBailoutConfidenceCost } = await runSeasonFinances({
    ...financeDeps,
    leagueId,
    newSeason,
    league,
    userLeagueTeamId,
    ownerConfidence,
    finals,
    fanHappinessUpdates,
    starPowerTierByTeam,
    iconPremiumByTeam,
    sponsorshipUpsideByTeam,
    teamWinPctById,
    dealsExpiringThisSeason,
    allCapitalProjects,
    completingThisPassByTeam,
  });

  // docs/FINANCE_AUDIT.md P0-2 - an owner who had to cover the season's
  // shortfall thinks less of the manager who caused it. Applied here rather
  // than inside the finance pass so confidence stays owned by one function,
  // which is also what makes repeated bailouts compound into the existing
  // firing check below rather than needing a separate failure path.
  if (userBailoutConfidenceCost > 0) {
    ownerConfidence = Math.max(
      MIN_OWNER_CONFIDENCE,
      Math.min(MAX_OWNER_CONFIDENCE, ownerConfidence - userBailoutConfidenceCost),
    );
  }

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      currentSeason: newSeason,
      ownerConfidence,
      payrollReductionTargetCents,
      payrollDirectiveSeason,
      financialMandateSeason,
      payrollDirectiveStaked,
      financialMandateStaked,
    },
  });

  // Phase 6 - ownerArchetype lives on the user's own LeagueTeam row now, a
  // separate small update rather than folding into the bulk financeResults
  // write above (that map runs for every team; this only ever concerns one).
  if (userLeagueTeamId) {
    await prisma.leagueTeam.update({
      where: { id: userLeagueTeamId },
      data: { ownerArchetype, ownerArchetypeSince },
    });
  }

  // The season just completed no longer needs its game-by-game box scores -
  // see src/lib/stats/rollupSeasonStats.ts for what that costs and preserves.
  // Deliberately after the season-advance commit and deliberately swallowing
  // its error: this is housekeeping, and a failure here must never leave a
  // user stuck mid-offseason. The sweep is idempotent, so the next advance
  // retries whatever was missed.
  try {
    await rollupCompletedSeasons(leagueId, newSeason);
  } catch (error) {
    console.error(`[rollup] league ${leagueId} season ${newSeason - 1} failed`, error);
  }

  if (ownershipMessages.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: ownershipMessages.map((description) => ({
        leagueId,
        season: newSeason,
        type: "OWNERSHIP_MESSAGE" as const,
        description,
        // No player rating attached to a season-recap message - STANDARD
        // is an honest flat default here, not a placeholder to revisit.
        importance: "STANDARD" as const,
        teamIds: userLeagueTeamId ? [userLeagueTeamId] : [],
      })),
    });
  }

  // Finances as a Gameplay Pillar (Phase 3) - the negotiation cards land in
  // the same Front Office Inbox every other BusinessDecision uses, dated to
  // the very start of the new season.
  if (userLeagueTeamId && negotiationDecisions.length > 0) {
    await prisma.businessDecision.createMany({
      data: negotiationDecisions.map((content) => ({
        leagueId,
        leagueTeamId: userLeagueTeamId,
        season: newSeason,
        dayIndex: 1,
        kind: content.kind,
        severity: content.severity,
        headline: content.headline,
        body: content.body,
        options: content.options as unknown as object,
        defaultOptionId: content.defaultOptionId,
        deadlineDayIndex: 1 + content.deadlineDays,
      })),
    });
  }

  // GM Career Mode - the firing. Owner confidence hitting the hard floor (0)
  // after this season ends the tenure. It takes several bad seasons to reach
  // the literal floor, so this reads as a real endpoint, not a cheap gotcha.
  // The career is snapshotted permanently onto the User now (league deletion
  // later is a hard cascading delete - nothing survives to reconstruct it),
  // GM reputation moves, and the league is marked ended (read-only from here).
  let fired = false;
  if (userLeagueTeamId && ownerConfidence <= MIN_OWNER_CONFIDENCE) {
    const userLeagueTeam = teamById.get(userLeagueTeamId);
    if (userLeagueTeam) {
      const [snapshot, freshTeam, owner] = await Promise.all([
        computeCareerRecordSnapshot(leagueId, userLeagueTeamId),
        prisma.leagueTeam.findUnique({
          where: { id: userLeagueTeamId },
          select: { totalPayrollPaidCents: true },
        }),
        prisma.user.findUnique({
          where: { id: league.ownerId },
          select: { gmReputation: true },
        }),
      ]);
      const reputationDelta = computeReputationDelta({
        seasons: snapshot.seasons,
        wins: snapshot.wins,
        losses: snapshot.losses,
        championships: snapshot.championships,
        playoffAppearances: snapshot.playoffAppearances,
        endReason: "FIRED",
      });
      const newReputation = Math.max(
        0,
        Math.min(100, (owner?.gmReputation ?? 50) + reputationDelta),
      );
      await prisma.$transaction([
        prisma.careerRecord.create({
          data: {
            userId: league.ownerId,
            leagueId,
            teamLabel: `${userLeagueTeam.team.city} ${userLeagueTeam.team.name}`,
            seasons: snapshot.seasons,
            wins: snapshot.wins,
            losses: snapshot.losses,
            championships: snapshot.championships,
            playoffAppearances: snapshot.playoffAppearances,
            bestPlayoffFinish: snapshot.bestPlayoffFinish,
            careerEarningsCents: freshTeam?.totalPayrollPaidCents ?? 0n,
            notableTradeDescription: snapshot.notableTradeDescription,
            endReason: "FIRED",
            finalOwnerConfidence: ownerConfidence,
            reputationDelta,
          },
        }),
        prisma.user.update({
          where: { id: league.ownerId },
          data: { gmReputation: newReputation },
        }),
        prisma.league.update({ where: { id: leagueId }, data: { endedAt: new Date() } }),
      ]);
      fired = true;
    }
  }

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/playoffs`);
  revalidatePath(`/leagues/${leagueId}/offseason`);
  revalidatePath(`/leagues/${leagueId}/free-agents`);

  return {
    newSeason,
    retiredCount: playerUpdates.filter((u) => u.retiredSeason !== null).length,
    fired,
  };
}
