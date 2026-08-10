/**
 * The season-boundary finance pass, lifted out of `advanceSeasonAction`.
 *
 * A coarse profit-and-loss for all 30 teams, plus everything that hangs off
 * it: capital projects completing, CPU business policy, CPU relocation, and
 * the financial news all of that generates. It runs late in the season
 * rollover, after fan happiness and payroll are final, because it consumes
 * both.
 *
 * Extracted so the per-team P&L (`computeTeamSeasonFinances`) is callable and
 * testable on its own rather than only from inside a 2,500-line action. Its
 * dependencies are passed explicitly as `TeamFinanceDeps` rather than closed
 * over, which is what made the extraction possible at all.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { computeActualOutcome } from "@/lib/gm/seasonEvaluation";
import type { MarketSize, TicketPricingPosture, NewsImportance } from "@/generated/prisma/client";
import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  computeSeasonRevenue,
  computeSeasonExpenses,
  computeNetIncome,
  computeFinancialHealth,
  computeFranchiseValue,
} from "@/lib/finances/finances";
import { computeCpuSponsorshipRevenueCents } from "@/lib/finances/sponsorship";
import {
  departmentQualityDelta,
  totalDepartmentBudgetCostCents,
  type DepartmentBudget,
} from "@/lib/finances/departments";
import {
  computeSeasonTicketBaseDelta,
  applySeasonTicketBaseDelta,
  computeAttendanceFloor,
} from "@/lib/fans/seasonTickets";
import { computeAttendancePct, computeFranchisePopularity } from "@/lib/fans/fanHappiness";
import { computeAnnualInterestCents, loanAmountCents } from "@/lib/finances/financing";
import {
  computeArenaAttendanceBonus,
  computeArenaAgingDelta,
  applyArenaQualityDelta,
  isRelocationEligible,
  buildNegotiationRound,
  RELOCATION_DECISION_TOTAL_ROUNDS,
  RELOCATION_DESTINATIONS,
  computeRelocationFanHappinessHit,
  computeRelocationFranchiseValueMultiplier,
} from "@/lib/finances/arena";
import {
  sumCompletedProjectEffects,
  computeConstructionAttendancePenalty,
  capitalProjectCostCents,
  capitalProjectCompletionSeason,
  ARENA_PROJECT_KINDS,
  CAPITAL_PROJECT_LABEL,
} from "@/lib/finances/capitalProjects";
import {
  shouldCpuRenovateArena,
  shouldCpuTakeLoan,
  isCpuRelocationEligible,
  shouldCpuRelocate,
  pickCpuRelocationDestinationIndex,
} from "@/lib/finances/cpuPolicy";
import {
  describeSeasonFinancialReport,
  describeFranchiseValueMilestone,
} from "@/lib/finances/financeNews";

type LeagueWithTeams = Prisma.LeagueGetPayload<{
  include: { teams: { include: { team: true; fanCulture: true } } };
}>;
type CapitalProjectRow = Prisma.CapitalProjectGetPayload<object>;

/** What a per-team P&L needs from the wider season pass to be computable. */
export interface TeamFinanceDeps {
  season: number;
  userControlledTeamId: string | null;
  completedEffectsByTeam: Map<string, ReturnType<typeof sumCompletedProjectEffects>>;
  stillInProgressKindsByTeam: Map<string, CapitalProjectRow["kind"][]>;
  financeContractsByTeam: Map<string, { playerId: string; salaryCents: bigint }[]>;
  sponsorshipRevenueByTeam: Map<string, number>;
  otherIncomeByTeam: Map<string, number>;
  otherExpenseByTeam: Map<string, number>;
  staffCentsByTeam: Map<string, bigint>;
  financeTaxLineCents: number;
}

// Finances as a Gameplay Pillar (Phase 4) - reads a LeagueTeam row's 6
// department-level columns into the DepartmentBudget shape
// computeTeamSeasonFinances/departments.ts expect.
export function teamDepartmentBudget(lt: {
  scoutingLevel: DepartmentBudget["scouting"];
  playerDevelopmentLevel: DepartmentBudget["playerDevelopment"];
  sportsScienceLevel: DepartmentBudget["sportsScience"];
  analyticsLevel: DepartmentBudget["analytics"];
  marketingLevel: DepartmentBudget["marketing"];
  coachingSupportLevel: DepartmentBudget["coachingSupport"];
}): DepartmentBudget {
  return {
    scouting: lt.scoutingLevel,
    playerDevelopment: lt.playerDevelopmentLevel,
    sportsScience: lt.sportsScienceLevel,
    analytics: lt.analyticsLevel,
    marketing: lt.marketingLevel,
    coachingSupport: lt.coachingSupportLevel,
  };
}

export function computeTeamSeasonFinances(
  deps: TeamFinanceDeps,
  args: {
    leagueTeamId: string;
    marketSize: MarketSize;
    fanHappiness: number;
    starTier: PlayerValueTier | null;
    ticketPosture: TicketPricingPosture;
    departmentBudget: DepartmentBudget;
    seasonTicketBase: number;
    arenaQualityIndex: number;
    debtCents: bigint;
    playoffHomeGames: number;
    wonChampionship: boolean;
  },
) {
  const {
    season,
    userControlledTeamId,
    completedEffectsByTeam,
    stillInProgressKindsByTeam,
    financeContractsByTeam,
    sponsorshipRevenueByTeam,
    otherIncomeByTeam,
    otherExpenseByTeam,
    staffCentsByTeam,
    financeTaxLineCents,
  } = deps;
  const projectEffects =
    completedEffectsByTeam.get(args.leagueTeamId) ?? sumCompletedProjectEffects([]);
  const constructionPenalty = computeConstructionAttendancePenalty(
    stillInProgressKindsByTeam.get(args.leagueTeamId) ?? [],
  );
  // Finances as a Gameplay Pillar (Phase 4/5) - the season-ticket base is
  // a floor under the existing attendance model; arena quality adds a
  // small bonus on top; an in-progress arena project under construction
  // costs real usable capacity. Never lets attendance leave [0,1].
  const attendancePct = Math.max(
    0,
    Math.min(
      1,
      Math.max(
        computeAttendancePct(args.fanHappiness, args.marketSize),
        computeAttendanceFloor(args.seasonTicketBase),
      ) +
        computeArenaAttendanceBonus(args.arenaQualityIndex) -
        constructionPenalty,
    ),
  );
  // Finances as a Gameplay Pillar (Phase 4/5) - Marketing grows
  // popularity faster; a completed International Academy stacks a
  // permanent flat bonus on top.
  const franchisePopularity = computeFranchisePopularity(
    args.fanHappiness,
    args.starTier,
    args.marketSize,
    departmentQualityDelta(args.departmentBudget.marketing) + projectEffects.popularityBonus,
  );
  const capSheet = computeCapSheet({
    season,
    contracts: financeContractsByTeam.get(args.leagueTeamId) ?? [],
  });
  // Finances as a Gameplay Pillar (Phase 2) - the user's team draws on
  // its real signed SponsorshipDeal total; every other team (CPU, never
  // shops for a deal) gets the formula baseline instead.
  const sponsorshipRevenueCents =
    args.leagueTeamId === userControlledTeamId
      ? (sponsorshipRevenueByTeam.get(args.leagueTeamId) ?? 0)
      : computeCpuSponsorshipRevenueCents(args.marketSize, args.starTier);
  const revenue = computeSeasonRevenue({
    marketSize: args.marketSize,
    attendancePct,
    franchisePopularity,
    starTier: args.starTier,
    ticketPosture: args.ticketPosture,
    playoffHomeGames: args.playoffHomeGames,
    wonChampionship: args.wonChampionship,
    // Finances as a Gameplay Pillar (Phase 5) - a completed Real Estate &
    // Media arm adds permanent recurring income here.
    otherIncomeCents:
      (otherIncomeByTeam.get(args.leagueTeamId) ?? 0) + projectEffects.recurringIncomeCents,
    sponsorshipCents: sponsorshipRevenueCents,
  });
  const expenses = computeSeasonExpenses({
    marketSize: args.marketSize,
    payrollCents: Number(capSheet.totalSalaryCents),
    luxuryTaxLineCents: financeTaxLineCents,
    staffCents: Number(staffCentsByTeam.get(args.leagueTeamId) ?? 0n),
    departmentBudgetCostCents: totalDepartmentBudgetCostCents(args.departmentBudget),
    otherExpenseCents: otherExpenseByTeam.get(args.leagueTeamId) ?? 0,
    // Finances as a Gameplay Pillar (Phase 5) - debt interest, charged
    // every season on the full outstanding balance.
    interestExpenseCents: computeAnnualInterestCents(Number(args.debtCents)),
  });
  return {
    revenue,
    expenses,
    netIncome: computeNetIncome(revenue, expenses),
    franchisePopularity,
  };
}

/** Everything the season-boundary finance pass needs, passed in explicitly. */
export interface SeasonFinanceContext extends TeamFinanceDeps {
  leagueId: string;
  newSeason: number;
  league: LeagueWithTeams;
  userLeagueTeamId: string | null;
  ownerConfidence: number;
  finals: { winnerTeamId: string | null };
  fanHappinessUpdates: { leagueTeamId: string; fanHappiness: number }[];
  starPowerTierByTeam: Map<string, Parameters<typeof computeFranchisePopularity>[1]>;
  iconPremiumByTeam: Map<string, number>;
  sponsorshipUpsideByTeam: Map<string, number>;
  teamWinPctById: Map<string, number>;
  dealsExpiringThisSeason: { id: string }[];
  allCapitalProjects: CapitalProjectRow[];
  completingThisPassByTeam: Map<string, CapitalProjectRow[]>;
}

export async function runSeasonFinances(ctx: SeasonFinanceContext) {
  const {
    leagueId,
    season,
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
  } = ctx;
  // ---- Franchise Finances & Business Operations (league-wide season P&L) ----
  // A coarse profit-and-loss for every one of the 30 teams, consuming the
  // fan happiness / attendance / popularity just finalized above, the
  // in-memory per-team payroll + staff salaries, and this season's playoff
  // results. Net income rolls into each team's cash reserve; franchise value
  // is recomputed as a slow-moving asset. Playoff Game/PlayoffSeries rows are
  // permanent history, so they're still present at this point.
  const [financeSeries, financePlayoffGames] = await Promise.all([
    prisma.playoffSeries.findMany({
      where: { leagueId, season },
      select: {
        round: true,
        higherSeedTeamId: true,
        lowerSeedTeamId: true,
        winnerTeamId: true,
      },
    }),
    prisma.game.findMany({
      where: { leagueId, season, type: { in: ["PLAYOFF", "PLAY_IN"] } },
      select: { homeLeagueTeamId: true, awayLeagueTeamId: true, type: true },
    }),
  ]);
  const playoffHomeGamesByTeam = new Map<string, number>();
  const playInTeamIds = new Set<string>();
  for (const g of financePlayoffGames) {
    playoffHomeGamesByTeam.set(
      g.homeLeagueTeamId,
      (playoffHomeGamesByTeam.get(g.homeLeagueTeamId) ?? 0) + 1,
    );
    if (g.type === "PLAY_IN") {
      playInTeamIds.add(g.homeLeagueTeamId);
      playInTeamIds.add(g.awayLeagueTeamId);
    }
  }
  const fanUpdateByTeam = new Map(fanHappinessUpdates.map((u) => [u.leagueTeamId, u]));
  const priorLeagueTeamById = new Map(league.teams.map((lt) => [lt.id, lt]));

  const financeResults = league.teams.map((lt) => {
    const fan = fanUpdateByTeam.get(lt.id);
    const fanHappiness = fan?.fanHappiness ?? lt.fanHappiness;
    // Finances as a Gameplay Pillar (Phase 5) - a relocated team's real
    // market resolves through its override, never the canonical (shared,
    // immutable) Team fixture directly.
    const marketSize = lt.marketSizeOverride ?? lt.team.marketSize;
    const outcome = computeActualOutcome(lt.id, playInTeamIds.has(lt.id), financeSeries);
    const fin = computeTeamSeasonFinances(ctx, {
      leagueTeamId: lt.id,
      marketSize,
      fanHappiness,
      starTier: starPowerTierByTeam.get(lt.id) ?? null,
      ticketPosture: lt.ticketPricingPosture,
      departmentBudget: teamDepartmentBudget(lt),
      seasonTicketBase: lt.seasonTicketBase,
      arenaQualityIndex: lt.arenaQualityIndex,
      debtCents: lt.debtCents,
      playoffHomeGames: playoffHomeGamesByTeam.get(lt.id) ?? 0,
      wonChampionship: finals.winnerTeamId === lt.id,
    });
    const priorCash = Number(priorLeagueTeamById.get(lt.id)?.cashReserveCents ?? 0n);
    const newCash = priorCash + fin.netIncome;
    const priorValue = Number(priorLeagueTeamById.get(lt.id)?.franchiseValueCents ?? 0n);
    const newValue = computeFranchiseValue({
      marketSize,
      franchisePopularity: fin.franchisePopularity,
      playoffOutcomeIndex: outcome.index,
      cashReserveCents: newCash,
      priorValueCents: priorValue,
      // Finances as a Gameplay Pillar (Phase 2) - the "equity swap"
      // sponsorship option's franchiseValueUpsideFraction stacks with the
      // existing icon premium; both are bounded value-premium fractions,
      // so summing them is the same reuse computeFranchiseValue already
      // expects (see its own iconPremiumFraction doc comment).
      iconPremiumFraction:
        (iconPremiumByTeam.get(lt.id) ?? 0) + (sponsorshipUpsideByTeam.get(lt.id) ?? 0),
    });
    // Finances as a Gameplay Pillar (Phase 4) - the season-ticket base
    // evolves at the same season boundary its own floor effect (above)
    // just fed into this season's attendance/gate revenue.
    const seasonTicketDelta = computeSeasonTicketBaseDelta({
      winPct: teamWinPctById.get(lt.id) ?? 0.5,
      ticketPosture: lt.ticketPricingPosture,
      fanHappiness,
    });
    const newSeasonTicketBase = applySeasonTicketBaseDelta(lt.seasonTicketBase, seasonTicketDelta);

    // Finances as a Gameplay Pillar (Phase 5) - a project completing this
    // pass applies its permanent arena bump/reset/lease-extension; a team
    // with nothing completing this season instead ages, same "either
    // invest or slowly decline" shape the design calls for.
    const completingProjects = completingThisPassByTeam.get(lt.id) ?? [];
    const completingEffects = sumCompletedProjectEffects(completingProjects.map((p) => p.kind));
    const agingDelta =
      completingProjects.length > 0 ? 0 : computeArenaAgingDelta(lt.arenaQualityIndex);
    const newArenaQualityIndex = applyArenaQualityDelta(
      lt.arenaQualityIndex,
      completingEffects.arenaQualityBonus + agingDelta,
    );
    const newArenaAgeSeasons = completingEffects.resetsArenaAge ? 0 : lt.arenaAgeSeasons + 1;
    const newArenaLeaseExpiresSeason =
      lt.arenaLeaseExpiresSeason + completingEffects.extendsLeaseYears;

    return {
      lt,
      fin,
      newCash: Math.round(newCash),
      newValue: Math.round(newValue),
      newSeasonTicketBase,
      newArenaQualityIndex,
      newArenaAgeSeasons,
      newArenaLeaseExpiresSeason,
      completingProjects,
      priorValue,
      health: computeFinancialHealth(newCash, fin.netIncome),
    };
  });

  await prisma.financialSnapshot.createMany({
    data: financeResults.map(({ lt, fin, newCash, newValue }) => ({
      leagueId,
      leagueTeamId: lt.id,
      season,
      ticketRevenueCents: BigInt(fin.revenue.ticketCents),
      mediaRevenueCents: BigInt(fin.revenue.mediaCents),
      playoffRevenueCents: BigInt(fin.revenue.playoffCents),
      leagueRevenueCents: BigInt(fin.revenue.leagueCents),
      otherIncomeCents: BigInt(fin.revenue.otherIncomeCents),
      sponsorshipRevenueCents: BigInt(fin.revenue.sponsorshipCents),
      payrollExpenseCents: BigInt(fin.expenses.payrollCents),
      luxuryTaxExpenseCents: BigInt(fin.expenses.luxuryTaxCents),
      staffExpenseCents: BigInt(fin.expenses.staffCents),
      investmentExpenseCents: BigInt(fin.expenses.investmentCents),
      operatingExpenseCents: BigInt(fin.expenses.operatingCents),
      otherExpenseCents: BigInt(fin.expenses.otherExpenseCents),
      interestExpenseCents: BigInt(fin.expenses.interestExpenseCents),
      netIncomeCents: BigInt(fin.netIncome),
      cashReserveCents: BigInt(newCash),
      franchiseValueCents: BigInt(newValue),
    })),
  });

  // Finances as a Gameplay Pillar (Phase 2) - a deal counted toward
  // revenue for its final season above; now that the season's actually
  // closing out, transition it so next season's boundary stops counting
  // it. VOIDED deals (traded-away condition player) already left ACTIVE
  // at trade time, so they're never in this set.
  if (dealsExpiringThisSeason.length > 0) {
    await prisma.sponsorshipDeal.updateMany({
      where: { id: { in: dealsExpiringThisSeason.map((d) => d.id) } },
      data: { status: "EXPIRED" },
    });
  }

  await Promise.all(
    financeResults.map(
      ({
        lt,
        fin,
        newCash,
        newValue,
        newSeasonTicketBase,
        newArenaQualityIndex,
        newArenaAgeSeasons,
        newArenaLeaseExpiresSeason,
      }) =>
        prisma.leagueTeam.update({
          where: { id: lt.id },
          data: {
            cashReserveCents: BigInt(newCash),
            franchiseValueCents: BigInt(newValue),
            // Finances as a Gameplay Pillar (Phase 4).
            seasonTicketBase: newSeasonTicketBase,
            // Finances as a Gameplay Pillar (Phase 5).
            arenaQualityIndex: newArenaQualityIndex,
            arenaAgeSeasons: newArenaAgeSeasons,
            arenaLeaseExpiresSeason: newArenaLeaseExpiresSeason,
            // GM Career Mode - accumulate this completed season's payroll into the
            // running career-earnings total. Must happen incrementally (here, at
            // the season boundary): expired Contract/ContractYear rows are deleted
            // in this same function, so it can't be reconstructed after the fact.
            totalPayrollPaidCents: { increment: BigInt(fin.expenses.payrollCents) },
          },
        }),
    ),
  );

  // Finances as a Gameplay Pillar (Phase 5) - mark every project that
  // completed this pass, and post a news beat per completion.
  const completedProjectIds = financeResults.flatMap((r) => r.completingProjects.map((p) => p.id));
  if (completedProjectIds.length > 0) {
    await prisma.capitalProject.updateMany({
      where: { id: { in: completedProjectIds } },
      data: { status: "COMPLETE" },
    });
    await prisma.leagueTransaction.createMany({
      data: financeResults.flatMap((r) =>
        r.completingProjects.map((p) => ({
          leagueId,
          season: newSeason,
          type: "FRANCHISE_MILESTONE" as const,
          description: `${CAPITAL_PROJECT_LABEL[p.kind]} complete - a permanent upgrade to the franchise.`,
          importance: "MAJOR" as const,
          teamIds: [r.lt.id],
        })),
      ),
    });
  }

  // Finances as a Gameplay Pillar (Phase 5) - relocation eligibility, the
  // deliberately near-unreachable last resort. Checked only for the user's
  // own team (Tier 1 - a franchise-defining moment, never a CPU-abstracted
  // one), once per season boundary, and only if nothing is already
  // pending. Every gate must hold simultaneously - see arena.ts.
  if (userLeagueTeamId) {
    const [userResult, existingRelocationNegotiation] = await Promise.all([
      Promise.resolve(financeResults.find((r) => r.lt.id === userLeagueTeamId)),
      prisma.negotiation.findFirst({
        where: {
          leagueId,
          leagueTeamId: userLeagueTeamId,
          kind: "RELOCATION_DECISION",
          status: "IN_PROGRESS",
        },
      }),
    ]);
    if (userResult && !existingRelocationNegotiation) {
      const recentSnapshotsForRelocation = await prisma.financialSnapshot.findMany({
        where: { leagueId, leagueTeamId: userLeagueTeamId },
        orderBy: { season: "desc" },
        take: 2,
        select: { netIncomeCents: true },
      });
      const recentNetIncomes = [
        userResult.fin.netIncome,
        ...recentSnapshotsForRelocation.map((s) => Number(s.netIncomeCents)),
      ];
      const eligible = isRelocationEligible({
        recentNetIncomesCents: recentNetIncomes,
        currentCashCents: userResult.newCash,
        failedArenaNegotiations: userResult.lt.failedArenaNegotiations,
        leaseExpiresSeason: userResult.newArenaLeaseExpiresSeason,
        currentSeason: newSeason,
        ownerConfidence,
      });
      if (eligible) {
        const negotiation = await prisma.negotiation.create({
          data: {
            leagueId,
            leagueTeamId: userLeagueTeamId,
            kind: "RELOCATION_DECISION",
            season: newSeason,
            totalRounds: RELOCATION_DECISION_TOTAL_ROUNDS,
          },
        });
        const content = buildNegotiationRound("RELOCATION_DECISION", 1, 50);
        await prisma.businessDecision.create({
          data: {
            leagueId,
            leagueTeamId: userLeagueTeamId,
            season: newSeason,
            dayIndex: 1,
            kind: "NEGOTIATION_ROUND",
            severity: "BREAKING",
            headline: content.headline,
            body: content.body,
            options: content.options as unknown as object,
            defaultOptionId: content.defaultOptionId,
            deadlineDayIndex: 1 + content.deadlineDays,
            negotiationId: negotiation.id,
          },
        });
      }
    }
  }

  // Phase 6 - CPU capital-project + financing policy (formula-driven, not a
  // parallel confidence/negotiation system - see
  // docs/FINANCES_PILLAR_DESIGN.md Part 8.2). Runs once per CPU team per
  // season boundary, seeded so re-running an unrelated part of the offseason
  // pass never reshuffles which CPU teams renovate/borrow this season.
  const cpuPolicyRng = createSeededRandom(`${leagueId}-${newSeason}-cpuPolicy`);
  const cpuPolicyNewsRows: { leagueId: string; season: number; description: string }[] = [];
  const cpuPolicyProjectCreates: {
    leagueId: string;
    leagueTeamId: string;
    kind: "ARENA_RENOVATION";
    startSeason: number;
    completionSeason: number;
    totalCostCents: bigint;
  }[] = [];
  const cpuPolicyCashUpdates = new Map<string, bigint>();
  const cpuPolicyDebtUpdates = new Map<string, bigint>();

  for (const result of financeResults) {
    if (result.lt.id === userLeagueTeamId) continue;

    let cash = BigInt(result.newCash);
    const hasProjectInProgress = allCapitalProjects.some(
      (p) =>
        p.leagueTeamId === result.lt.id &&
        p.status === "IN_PROGRESS" &&
        ARENA_PROJECT_KINDS.includes(p.kind) &&
        !completingThisPassByTeam.get(result.lt.id)?.some((c) => c.id === p.id),
    );

    if (
      shouldCpuRenovateArena(
        {
          arenaQualityIndex: result.newArenaQualityIndex,
          cashReserveCents: Number(cash),
          ownerArchetype: result.lt.ownerArchetype,
          hasProjectInProgress,
        },
        cpuPolicyRng,
      )
    ) {
      const costCents = capitalProjectCostCents("ARENA_RENOVATION");
      cash -= BigInt(costCents);
      cpuPolicyProjectCreates.push({
        leagueId,
        leagueTeamId: result.lt.id,
        kind: "ARENA_RENOVATION",
        startSeason: newSeason,
        completionSeason: capitalProjectCompletionSeason("ARENA_RENOVATION", newSeason),
        totalCostCents: BigInt(costCents),
      });
      cpuPolicyNewsRows.push({
        leagueId,
        season: newSeason,
        description: `The ${result.lt.team.city} ${result.lt.team.name} have committed to an arena renovation.`,
      });
    } else if (
      shouldCpuTakeLoan(
        { cashReserveCents: Number(cash), ownerArchetype: result.lt.ownerArchetype },
        cpuPolicyRng,
      )
    ) {
      const amountCents = loanAmountCents("SMALL");
      cash += BigInt(amountCents);
      cpuPolicyDebtUpdates.set(result.lt.id, result.lt.debtCents + BigInt(amountCents));
      cpuPolicyNewsRows.push({
        leagueId,
        season: newSeason,
        description: `The ${result.lt.team.city} ${result.lt.team.name} have taken out a loan to shore up the books.`,
      });
    }

    if (cash !== BigInt(result.newCash)) {
      cpuPolicyCashUpdates.set(result.lt.id, cash);
    }
  }

  if (cpuPolicyProjectCreates.length > 0) {
    await prisma.capitalProject.createMany({ data: cpuPolicyProjectCreates });
  }
  await Promise.all([
    ...Array.from(cpuPolicyCashUpdates.entries()).map(([leagueTeamId, cashReserveCents]) =>
      prisma.leagueTeam.update({ where: { id: leagueTeamId }, data: { cashReserveCents } }),
    ),
    ...Array.from(cpuPolicyDebtUpdates.entries()).map(([leagueTeamId, debtCents]) =>
      prisma.leagueTeam.update({ where: { id: leagueTeamId }, data: { debtCents } }),
    ),
  ]);
  if (cpuPolicyNewsRows.length > 0) {
    await prisma.leagueTransaction.createMany({
      data: cpuPolicyNewsRows.map((row) => ({
        leagueId: row.leagueId,
        season: row.season,
        type: "BUSINESS_DECISION" as const,
        description: row.description,
        importance: "MINOR" as const,
        teamIds: [],
      })),
    });
  }

  // Phase 6 - CPU relocation. A simplified, single-weighted-outcome version
  // of the user's multi-round Negotiation - there's no one for a CPU team
  // to negotiate with. Same near-unreachable rarity target as the user's
  // own gate (isCpuRelocationEligible substitutes CPU-available signals for
  // the two gates that depend on interactive owner confidence - see
  // docs/FINANCES_PILLAR_DESIGN.md Part 8.2), checked once per CPU team per
  // season boundary, after the capital-project/financing policy above so a
  // team that just took on debt or renovated is judged on its actual
  // resulting state, not a stale snapshot.
  const cpuRelocationCandidates = financeResults.filter((r) => r.lt.id !== userLeagueTeamId);
  if (cpuRelocationCandidates.length > 0) {
    const cpuRecentSnapshots = await prisma.financialSnapshot.findMany({
      where: {
        leagueId,
        leagueTeamId: { in: cpuRelocationCandidates.map((r) => r.lt.id) },
      },
      orderBy: { season: "desc" },
      select: { leagueTeamId: true, season: true, netIncomeCents: true },
    });
    const recentNetIncomesByTeam = new Map<string, number[]>();
    for (const snap of cpuRecentSnapshots) {
      const list = recentNetIncomesByTeam.get(snap.leagueTeamId) ?? [];
      list.push(Number(snap.netIncomeCents));
      recentNetIncomesByTeam.set(snap.leagueTeamId, list);
    }
    const cpuRelocationRng = createSeededRandom(`${leagueId}-${newSeason}-cpuRelocation`);

    for (const result of cpuRelocationCandidates) {
      const cpuCash = cpuPolicyCashUpdates.get(result.lt.id) ?? BigInt(result.newCash);
      const recentNetIncomes = [
        result.fin.netIncome,
        ...(recentNetIncomesByTeam.get(result.lt.id) ?? []),
      ];
      const eligible = isCpuRelocationEligible({
        recentNetIncomesCents: recentNetIncomes,
        currentCashCents: Number(cpuCash),
        arenaQualityIndex: result.newArenaQualityIndex,
        leaseExpiresSeason: result.newArenaLeaseExpiresSeason,
        currentSeason: newSeason,
      });
      if (!eligible || !shouldCpuRelocate(cpuRelocationRng)) continue;

      const destIndex = pickCpuRelocationDestinationIndex(
        RELOCATION_DESTINATIONS.length,
        cpuRelocationRng,
      );
      const destination = RELOCATION_DESTINATIONS[destIndex];
      const oldTeamLabel = `${result.lt.team.city} ${result.lt.team.name}`;
      const currentFanHappiness =
        fanUpdateByTeam.get(result.lt.id)?.fanHappiness ?? result.lt.fanHappiness;
      const newFanHappiness = Math.max(
        0,
        Math.min(100, currentFanHappiness + computeRelocationFanHappinessHit("SEVERE")),
      );
      const newFranchiseValue = BigInt(
        Math.round(result.newValue * computeRelocationFranchiseValueMultiplier()),
      );

      await prisma.$transaction([
        prisma.leagueTeam.update({
          where: { id: result.lt.id },
          data: {
            marketSizeOverride: destination.marketSize,
            relocatedCityName: destination.cityName,
            relocatedAtSeason: newSeason,
            fanHappiness: newFanHappiness,
            franchiseValueCents: newFranchiseValue,
            failedArenaNegotiations: 0,
            arenaLeaseExpiresSeason: newSeason + 20,
          },
        }),
        prisma.leagueTransaction.create({
          data: {
            leagueId,
            season: newSeason,
            type: "FRANCHISE_MILESTONE",
            description: `${oldTeamLabel} have relocated to ${destination.cityName} after years of financial struggle and a neglected arena - a permanent, franchise-defining moment.`,
            importance: "BREAKING",
            teamIds: [result.lt.id],
          },
        }),
      ]);
    }
  }

  // News: the user's own business recap every season (relevant to them, like
  // the ownership recap); a franchise-value milestone for any team only on a
  // genuine billion-dollar crossing (rare, real league news - not per-team
  // spam). Posted at newSeason alongside the ownership recap so it's visible
  // in the feed the user lands on.
  const ONE_BILLION_CENTS = 1_000_000_000 * 100;
  type FinanceNewsRow = {
    leagueId: string;
    season: number;
    type: "FINANCIAL_REPORT" | "FRANCHISE_MILESTONE";
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  };
  const financeNewsRows = financeResults.flatMap(({ lt, fin, newValue, priorValue, health }) => {
    const rows: FinanceNewsRow[] = [];
    const teamLabel = `${lt.team.city} ${lt.team.name}`;
    if (lt.id === userLeagueTeamId) {
      rows.push({
        leagueId,
        season: newSeason,
        type: "FINANCIAL_REPORT",
        description: describeSeasonFinancialReport({
          teamLabel,
          netIncomeCents: fin.netIncome,
          health,
        }),
        importance: "STANDARD",
        teamIds: [lt.id],
      });
    }
    if (priorValue > 0) {
      const priorB = Math.floor(priorValue / ONE_BILLION_CENTS);
      const newB = Math.floor(newValue / ONE_BILLION_CENTS);
      if (newB > priorB) {
        rows.push({
          leagueId,
          season: newSeason,
          type: "FRANCHISE_MILESTONE",
          description: describeFranchiseValueMilestone({
            teamLabel,
            valueCents: newValue,
            direction: "up",
          }),
          importance: "MAJOR",
          teamIds: [lt.id],
        });
      } else if (newB < priorB) {
        rows.push({
          leagueId,
          season: newSeason,
          type: "FRANCHISE_MILESTONE",
          description: describeFranchiseValueMilestone({
            teamLabel,
            valueCents: newValue,
            direction: "down",
          }),
          importance: "STANDARD",
          teamIds: [lt.id],
        });
      }
    }
    return rows;
  });
  if (financeNewsRows.length > 0) {
    await prisma.leagueTransaction.createMany({ data: financeNewsRows });
  }
}
