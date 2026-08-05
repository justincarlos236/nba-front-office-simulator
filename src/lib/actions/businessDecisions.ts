"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { applyBusinessDecisionOption } from "@/lib/actions/leagueEvents";
import { fanSentimentCreateOps } from "@/lib/fans/recordSentiment";
import type { BusinessDecisionOption } from "@/lib/finances/businessDecisions";
import {
  buildNegotiationRound,
  ARENA_FUNDING_SUCCESS_THRESHOLD,
  computeArenaFundingDiscount,
  computeRelocationFanHappinessHit,
  computeRelocationFranchiseValueMultiplier,
  type NegotiationRoundOption,
  type FanHappinessSeverity,
} from "@/lib/finances/arena";
import {
  capitalProjectCostCents,
  capitalProjectCompletionSeason,
} from "@/lib/finances/capitalProjects";
import { formatCentsCompact } from "@/lib/money";
import type { NegotiationKind } from "@/generated/prisma/client";

/**
 * Finances as a Gameplay Pillar (Phase 1) - resolves one pending
 * BusinessDecision with the user's chosen option: applies its cash/fan-
 * happiness/owner-confidence effects, records a BusinessLedgerEntry (so it
 * shows up in the P&L before the season boundary, not just after it) and a
 * BUSINESS_DECISION news entry, then marks the decision RESOLVED. Same
 * "validate ownership, re-validate against the real enum/state server-
 * side, never trust the client" shape as updateBusinessStrategyAction.
 *
 * Phase 2 - if the chosen option carries a `sponsorshipDeal` payload, this
 * also creates the SponsorshipDeal row.
 *
 * Phase 3 - if the chosen option carries a `directiveStake`, this sets the
 * corresponding League flag.
 *
 * Phase 5 - if the decision belongs to a Negotiation (negotiationId set),
 * this dispatches to resolveNegotiationRound instead: the option's
 * instant deltas still apply the same way, but resolution also advances
 * the negotiation to its next round or finalizes it (see arena.ts).
 */
export async function resolveBusinessDecisionAction(
  leagueId: string,
  decisionId: string,
  optionId: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  if (!league.userControlledTeamId) {
    throw new Error("No team to manage");
  }
  const userControlledTeamId = league.userControlledTeamId;

  const decision = await prisma.businessDecision.findUnique({ where: { id: decisionId } });
  if (
    !decision ||
    decision.leagueId !== leagueId ||
    decision.leagueTeamId !== userControlledTeamId
  ) {
    throw new Error("Decision not found");
  }
  if (decision.status !== "PENDING") {
    throw new Error("This decision has already been resolved");
  }

  if (decision.negotiationId) {
    await resolveNegotiationRound(leagueId, league, userControlledTeamId, decision, optionId);
  } else {
    await resolveStandardDecision(leagueId, league, userControlledTeamId, decision, optionId);
  }

  revalidatePath(`/leagues/${leagueId}/finances`);
  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/schedule`);
}

async function resolveStandardDecision(
  leagueId: string,
  league: { currentSeason: number; ownerConfidence: number },
  userControlledTeamId: string,
  decision: { id: string; options: unknown; headline: string; dayIndex: number; severity: string },
  optionId: string,
): Promise<void> {
  const options = decision.options as unknown as BusinessDecisionOption[];
  const chosen = options.find((o) => o.id === optionId);
  if (!chosen) {
    throw new Error("Invalid option");
  }

  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: {
      cashReserveCents: true,
      fanHappiness: true,
      fanCulture: { select: { patience: true, loyalty: true } },
    },
  });

  const applied = applyBusinessDecisionOption(chosen, {
    cashReserveCents: team.cashReserveCents,
    fanHappiness: team.fanHappiness,
    ownerConfidence: league.ownerConfidence,
    fanCulture: team.fanCulture,
  });

  await prisma.$transaction([
    prisma.businessDecision.update({
      where: { id: decision.id },
      data: { status: "RESOLVED", resolvedOptionId: optionId, resolvedAt: new Date() },
    }),
    prisma.leagueTeam.update({
      where: { id: userControlledTeamId },
      data: {
        cashReserveCents: applied.cashReserveCents,
        fanHappiness: applied.fanHappiness,
      },
    }),
    prisma.league.update({
      where: { id: leagueId },
      data: {
        ownerConfidence: applied.ownerConfidence,
        ...(chosen.directiveStake === "PAYROLL_DIRECTIVE" ? { payrollDirectiveStaked: true } : {}),
        ...(chosen.directiveStake === "FINANCIAL_MANDATE" ? { financialMandateStaked: true } : {}),
      },
    }),
    ...(chosen.cashDeltaCents !== 0
      ? [
          prisma.businessLedgerEntry.create({
            data: {
              leagueId,
              leagueTeamId: userControlledTeamId,
              season: league.currentSeason,
              dayIndex: decision.dayIndex,
              category: chosen.cashDeltaCents > 0 ? "EVENT_INCOME" : "EVENT_EXPENSE",
              amountCents: BigInt(Math.abs(Math.round(chosen.cashDeltaCents))),
              description: `${decision.headline} - ${chosen.label}`,
              businessDecisionId: decision.id,
            },
          }),
        ]
      : []),
    ...(chosen.sponsorshipDeal
      ? [
          prisma.sponsorshipDeal.create({
            data: {
              leagueId,
              leagueTeamId: userControlledTeamId,
              kind: chosen.sponsorshipDeal.kind,
              label: chosen.sponsorshipDeal.label,
              annualValueCents: BigInt(Math.round(chosen.sponsorshipDeal.annualValueCents)),
              startSeason: league.currentSeason,
              endSeason: league.currentSeason + chosen.sponsorshipDeal.termSeasons - 1,
              conditionLeaguePlayerId: chosen.sponsorshipDeal.conditionLeaguePlayerId,
              franchiseValueUpsideFraction: chosen.sponsorshipDeal.franchiseValueUpsideFraction,
            },
          }),
        ]
      : []),
    prisma.leagueTransaction.create({
      data: {
        leagueId,
        season: league.currentSeason,
        type: "BUSINESS_DECISION",
        description: `${decision.headline}: you chose to "${chosen.label}."`,
        importance: decision.severity as never,
        teamIds: [userControlledTeamId],
      },
    }),
    // Fans Page Redesign (Phase 1) - business decisions (ticket pricing,
    // sponsorship trade-offs, crisis responses) are among the most direct
    // ways a GM moves public opinion, so they belong in the ledger.
    ...fanSentimentCreateOps([
      {
        leagueId,
        leagueTeamId: userControlledTeamId,
        season: league.currentSeason,
        dayIndex: decision.dayIndex,
        kind: "BUSINESS_DECISION",
        delta: applied.scaledFanHappinessDelta,
        description: `${decision.headline} - you chose "${chosen.label}."`,
      },
    ]),
  ]);
}

/**
 * Finances as a Gameplay Pillar (Phase 5) - resolves one round of a
 * multi-round Negotiation (ARENA_FUNDING or RELOCATION_DECISION). The
 * chosen option's instant deltas apply the same way a standard decision's
 * do; additionally, its cityWillingnessDelta moves the negotiation's
 * running score and its outcomePatch merges into the negotiation's
 * accumulated outcome. If the option ends the negotiation explicitly (a
 * "walk away"/"refuse" choice) or this was the final round, the
 * negotiation finalizes and its real consequences (a CapitalProject, a
 * failed-negotiation mark, or an actual relocation) are applied. Otherwise
 * the next round's BusinessDecision is created in the same inbox.
 */
async function resolveNegotiationRound(
  leagueId: string,
  league: { currentSeason: number; ownerConfidence: number },
  userControlledTeamId: string,
  decision: {
    id: string;
    options: unknown;
    headline: string;
    dayIndex: number;
    severity: string;
    negotiationId: string | null;
  },
  optionId: string,
): Promise<void> {
  const negotiation = await prisma.negotiation.findUniqueOrThrow({
    where: { id: decision.negotiationId! },
  });
  if (negotiation.status !== "IN_PROGRESS") {
    throw new Error("This negotiation has already concluded");
  }

  const options = decision.options as unknown as NegotiationRoundOption[];
  const chosen = options.find((o) => o.id === optionId);
  if (!chosen) {
    throw new Error("Invalid option");
  }

  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: {
      cashReserveCents: true,
      fanHappiness: true,
      fanCulture: { select: { patience: true, loyalty: true } },
    },
  });

  const applied = applyBusinessDecisionOption(chosen, {
    cashReserveCents: team.cashReserveCents,
    fanHappiness: team.fanHappiness,
    ownerConfidence: league.ownerConfidence,
    fanCulture: team.fanCulture,
  });

  const newWillingness = Math.max(
    0,
    Math.min(100, negotiation.cityWillingness + (chosen.cityWillingnessDelta ?? 0)),
  );
  const newOutcome = {
    ...((negotiation.outcome as Record<string, unknown> | null) ?? {}),
    ...(chosen.outcomePatch ?? {}),
  };

  const isLastRound = negotiation.round >= negotiation.totalRounds;
  let finalStatus: "SUCCEEDED" | "FAILED" | null = null;
  if (chosen.endsNegotiation) {
    finalStatus = chosen.endsNegotiation;
  } else if (isLastRound) {
    finalStatus =
      negotiation.kind === "ARENA_FUNDING"
        ? newWillingness >= ARENA_FUNDING_SUCCESS_THRESHOLD
          ? "SUCCEEDED"
          : "FAILED"
        : "SUCCEEDED"; // RELOCATION_DECISION - round 1's "refuse" is the only early-exit path
  }

  const nextRound = negotiation.round + 1;
  const nextRoundContent =
    finalStatus === null
      ? buildNegotiationRound(negotiation.kind, nextRound, newWillingness)
      : null;

  await prisma.$transaction([
    prisma.businessDecision.update({
      where: { id: decision.id },
      data: { status: "RESOLVED", resolvedOptionId: optionId, resolvedAt: new Date() },
    }),
    prisma.leagueTeam.update({
      where: { id: userControlledTeamId },
      data: { cashReserveCents: applied.cashReserveCents, fanHappiness: applied.fanHappiness },
    }),
    prisma.league.update({
      where: { id: leagueId },
      data: { ownerConfidence: applied.ownerConfidence },
    }),
    // Fans Page Redesign (Phase 1) - negotiation rounds (arena funding, and
    // especially the relocation sequence) carry some of the largest fan
    // deltas in the game.
    ...fanSentimentCreateOps([
      {
        leagueId,
        leagueTeamId: userControlledTeamId,
        season: league.currentSeason,
        dayIndex: decision.dayIndex,
        kind: "BUSINESS_DECISION",
        delta: applied.scaledFanHappinessDelta,
        description: `${decision.headline} - you chose "${chosen.label}."`,
      },
    ]),
    ...(chosen.cashDeltaCents !== 0
      ? [
          prisma.businessLedgerEntry.create({
            data: {
              leagueId,
              leagueTeamId: userControlledTeamId,
              season: league.currentSeason,
              dayIndex: decision.dayIndex,
              category: chosen.cashDeltaCents > 0 ? "EVENT_INCOME" : "EVENT_EXPENSE",
              amountCents: BigInt(Math.abs(Math.round(chosen.cashDeltaCents))),
              description: `${decision.headline} - ${chosen.label}`,
              businessDecisionId: decision.id,
            },
          }),
        ]
      : []),
    ...(nextRoundContent
      ? [
          prisma.negotiation.update({
            where: { id: negotiation.id },
            data: {
              round: nextRound,
              cityWillingness: newWillingness,
              outcome: newOutcome as object,
            },
          }),
          prisma.businessDecision.create({
            data: {
              leagueId,
              leagueTeamId: userControlledTeamId,
              season: league.currentSeason,
              dayIndex: decision.dayIndex,
              kind: "NEGOTIATION_ROUND",
              severity: "MAJOR",
              headline: nextRoundContent.headline,
              body: nextRoundContent.body,
              options: nextRoundContent.options as unknown as object,
              defaultOptionId: nextRoundContent.defaultOptionId,
              deadlineDayIndex: decision.dayIndex + nextRoundContent.deadlineDays,
              negotiationId: negotiation.id,
            },
          }),
        ]
      : []),
    ...(finalStatus !== null
      ? [
          prisma.negotiation.update({
            where: { id: negotiation.id },
            data: {
              status: finalStatus,
              cityWillingness: newWillingness,
              outcome: newOutcome as object,
              resolvedAt: new Date(),
            },
          }),
        ]
      : []),
  ]);

  if (finalStatus !== null) {
    await applyNegotiationOutcome(
      leagueId,
      userControlledTeamId,
      league.currentSeason,
      negotiation.kind,
      finalStatus,
      newOutcome,
    );
  }
}

async function applyNegotiationOutcome(
  leagueId: string,
  leagueTeamId: string,
  currentSeason: number,
  kind: NegotiationKind,
  status: "SUCCEEDED" | "FAILED",
  outcome: Record<string, unknown>,
): Promise<void> {
  if (kind === "ARENA_FUNDING") {
    if (status === "SUCCEEDED") {
      const negotiation = await prisma.negotiation.findFirst({
        where: { leagueId, leagueTeamId, kind: "ARENA_FUNDING", status: "SUCCEEDED" },
        orderBy: { resolvedAt: "desc" },
      });
      const discount = computeArenaFundingDiscount(
        negotiation?.cityWillingness ?? ARENA_FUNDING_SUCCESS_THRESHOLD,
      );
      const costCents = Math.round(capitalProjectCostCents("ARENA_NEW_BUILD") * (1 - discount));
      const team = await prisma.leagueTeam.findUniqueOrThrow({
        where: { id: leagueTeamId },
        select: { cashReserveCents: true },
      });
      await prisma.$transaction([
        prisma.capitalProject.create({
          data: {
            leagueId,
            leagueTeamId,
            kind: "ARENA_NEW_BUILD",
            startSeason: currentSeason,
            completionSeason: capitalProjectCompletionSeason("ARENA_NEW_BUILD", currentSeason),
            totalCostCents: BigInt(costCents),
          },
        }),
        prisma.leagueTeam.update({
          where: { id: leagueTeamId },
          data: { cashReserveCents: team.cashReserveCents - BigInt(costCents) },
        }),
        prisma.leagueTransaction.create({
          data: {
            leagueId,
            season: currentSeason,
            type: "FRANCHISE_MILESTONE",
            description: `The city has agreed to fund a new arena - ${formatCentsCompact(costCents)}, breaking ground now.`,
            importance: "MAJOR",
            teamIds: [leagueTeamId],
          },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.leagueTeam.update({
          where: { id: leagueTeamId },
          data: { failedArenaNegotiations: { increment: 1 } },
        }),
        prisma.leagueTransaction.create({
          data: {
            leagueId,
            season: currentSeason,
            type: "BUSINESS_DECISION",
            description: "The arena funding negotiation with the city has collapsed. No deal.",
            importance: "MAJOR",
            teamIds: [leagueTeamId],
          },
        }),
      ]);
    }
    return;
  }

  // RELOCATION_DECISION
  if (status === "FAILED") {
    await prisma.leagueTransaction.create({
      data: {
        leagueId,
        season: currentSeason,
        type: "OWNERSHIP_MESSAGE",
        description:
          "The franchise will stay put. Ownership has decided to keep fighting for a future in this market.",
        importance: "MAJOR",
        teamIds: [leagueTeamId],
      },
    });
    return;
  }

  const cityName = (outcome.cityName as string | undefined) ?? "a new market";
  const marketSize = (outcome.marketSize as "LARGE" | "MID" | "SMALL" | undefined) ?? "MID";
  const severity = (outcome.fanHappinessSeverity as FanHappinessSeverity | undefined) ?? "SEVERE";

  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: leagueTeamId },
    select: { fanHappiness: true, franchiseValueCents: true },
  });
  // Fans Page Redesign (Phase 3) - deliberately NOT scaled by Fan Culture.
  // Relocation is itself one of the inputs recomputeFanCultures reads to
  // set next season's Loyalty; softening the hit by the very trait it's
  // meant to damage would be circular. This permanent, severe wound is
  // exactly what a low-loyalty culture is the *record* of, not something
  // culture should protect a fanbase from feeling.
  const newFanHappiness = Math.max(
    0,
    Math.min(100, team.fanHappiness + computeRelocationFanHappinessHit(severity)),
  );
  const newFranchiseValue = BigInt(
    Math.round(Number(team.franchiseValueCents) * computeRelocationFranchiseValueMultiplier()),
  );

  await prisma.$transaction([
    prisma.leagueTeam.update({
      where: { id: leagueTeamId },
      data: {
        marketSizeOverride: marketSize,
        relocatedCityName: cityName,
        relocatedAtSeason: currentSeason,
        fanHappiness: newFanHappiness,
        franchiseValueCents: newFranchiseValue,
        failedArenaNegotiations: 0,
        arenaLeaseExpiresSeason: currentSeason + 20,
      },
    }),
    prisma.leagueTransaction.create({
      data: {
        leagueId,
        season: currentSeason,
        type: "FRANCHISE_MILESTONE",
        description: `The franchise has relocated to ${cityName}. A permanent, franchise-defining moment in the team's history.`,
        importance: "BREAKING",
        teamIds: [leagueTeamId],
      },
    }),
    // Fans Page Redesign (Phase 1) - the single largest fan-happiness event
    // in the game; it belongs in the "Franchise Memory" this fanbase will
    // reference for the rest of the save.
    ...fanSentimentCreateOps([
      {
        leagueId,
        leagueTeamId,
        season: currentSeason,
        kind: "BUSINESS_DECISION",
        delta: newFanHappiness - team.fanHappiness,
        description: `The franchise relocated to ${cityName} - a wound this fanbase won't forget.`,
      },
    ]),
  ]);
}
