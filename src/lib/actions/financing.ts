"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  loanAmountCents,
  capitalCallAmountCents,
  capitalCallConfidenceCost,
  distressedFinancingAmountCents,
  isDistressedFinancingEligible,
  DISTRESSED_FINANCING_CONFIDENCE_COST,
  DISTRESSED_FINANCING_FAN_HAPPINESS_COST,
  type LoanTier,
  type CapitalCallTier,
} from "@/lib/finances/financing";
import { applyScaledFanHappinessDelta } from "@/lib/fans/sentimentEvents";
import { fanSentimentCreateOps } from "@/lib/fans/recordSentiment";

const MIN_OWNER_CONFIDENCE = 0;
const MAX_OWNER_CONFIDENCE = 100;
function clampConfidence(value: number): number {
  return Math.max(MIN_OWNER_CONFIDENCE, Math.min(MAX_OWNER_CONFIDENCE, value));
}

async function requireOwnedLeagueTeam(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  if (!league.userControlledTeamId) {
    throw new Error("No team to manage");
  }
  return { league, userControlledTeamId: league.userControlledTeamId };
}

const LOAN_TIERS: LoanTier[] = ["SMALL", "MEDIUM", "LARGE"];

/**
 * Finances as a Gameplay Pillar (Phase 5) - System 3, "Financing." Adds to
 * the team's single revolving debt balance - interest-only, charged every
 * season boundary on the outstanding total (see advanceSeasonAction).
 */
export async function takeOutLoanAction(leagueId: string, tier: LoanTier): Promise<void> {
  const { userControlledTeamId } = await requireOwnedLeagueTeam(leagueId);
  if (!LOAN_TIERS.includes(tier)) throw new Error("Invalid loan tier");

  const amountCents = loanAmountCents(tier);
  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: { cashReserveCents: true, debtCents: true },
  });
  await prisma.leagueTeam.update({
    where: { id: userControlledTeamId },
    data: {
      cashReserveCents: team.cashReserveCents + BigInt(amountCents),
      debtCents: team.debtCents + BigInt(amountCents),
    },
  });

  revalidatePath(`/leagues/${leagueId}/finances`);
}

/** Voluntary principal repayment - no forced amortization schedule exists, so this is the only way debt actually goes down. */
export async function repayDebtAction(leagueId: string, amountCents: number): Promise<void> {
  const { userControlledTeamId } = await requireOwnedLeagueTeam(leagueId);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Invalid repayment amount");
  }

  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: { cashReserveCents: true, debtCents: true },
  });
  const repayment = BigInt(Math.min(Math.round(amountCents), Number(team.debtCents)));
  if (repayment <= 0n) throw new Error("No outstanding debt to repay");

  await prisma.leagueTeam.update({
    where: { id: userControlledTeamId },
    data: {
      cashReserveCents: team.cashReserveCents - repayment,
      debtCents: team.debtCents - repayment,
    },
  });

  revalidatePath(`/leagues/${leagueId}/finances`);
}

const CAPITAL_CALL_TIERS: CapitalCallTier[] = ["SMALL", "MEDIUM", "LARGE"];

/**
 * Finances as a Gameplay Pillar (Phase 5) - "the cleanest trade-off in the
 * design": free money, priced entirely in owner confidence. Never touches
 * debt at all.
 */
export async function requestOwnerCapitalAction(
  leagueId: string,
  tier: CapitalCallTier,
): Promise<void> {
  const { league, userControlledTeamId } = await requireOwnedLeagueTeam(leagueId);
  if (!CAPITAL_CALL_TIERS.includes(tier)) throw new Error("Invalid capital call tier");

  const amountCents = capitalCallAmountCents(tier);
  const confidenceCost = capitalCallConfidenceCost(tier);
  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: { cashReserveCents: true },
  });

  await prisma.$transaction([
    prisma.leagueTeam.update({
      where: { id: userControlledTeamId },
      data: { cashReserveCents: team.cashReserveCents + BigInt(amountCents) },
    }),
    prisma.league.update({
      where: { id: leagueId },
      data: { ownerConfidence: clampConfidence(league.ownerConfidence - confidenceCost) },
    }),
  ]);

  revalidatePath(`/leagues/${leagueId}/finances`);
}

/**
 * Finances as a Gameplay Pillar (Phase 5) - "terms bad enough that taking
 * it is an admission." Only available once cash is genuinely, deeply
 * negative; priced through an immediate, real reputational cost rather
 * than a separately-tracked worse interest rate.
 */
export async function takeDistressedFinancingAction(leagueId: string): Promise<void> {
  const { league, userControlledTeamId } = await requireOwnedLeagueTeam(leagueId);

  const team = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: userControlledTeamId },
    select: {
      cashReserveCents: true,
      debtCents: true,
      fanHappiness: true,
      fanCulture: { select: { patience: true, loyalty: true } },
    },
  });
  if (!isDistressedFinancingEligible(Number(team.cashReserveCents))) {
    throw new Error("Distressed financing is only available when the books are genuinely bad");
  }

  const amountCents = distressedFinancingAmountCents();
  // Fans Page Redesign (Phase 3).
  const { newFanHappiness, scaledDelta } = applyScaledFanHappinessDelta(
    team.fanHappiness,
    -DISTRESSED_FINANCING_FAN_HAPPINESS_COST,
    team.fanCulture,
  );

  await prisma.$transaction([
    prisma.leagueTeam.update({
      where: { id: userControlledTeamId },
      data: {
        cashReserveCents: team.cashReserveCents + BigInt(amountCents),
        debtCents: team.debtCents + BigInt(amountCents),
        fanHappiness: newFanHappiness,
      },
    }),
    prisma.league.update({
      where: { id: leagueId },
      data: {
        ownerConfidence: clampConfidence(
          league.ownerConfidence - DISTRESSED_FINANCING_CONFIDENCE_COST,
        ),
      },
    }),
    prisma.leagueTransaction.create({
      data: {
        leagueId,
        season: league.currentSeason,
        type: "BUSINESS_DECISION",
        description:
          "The front office has taken on distressed financing to stay afloat - a real admission of how bad things have gotten.",
        importance: "MAJOR",
        teamIds: [userControlledTeamId],
      },
    }),
    // Fans Page Redesign (Phase 1).
    ...fanSentimentCreateOps([
      {
        leagueId,
        leagueTeamId: userControlledTeamId,
        season: league.currentSeason,
        kind: "DISTRESSED_FINANCING",
        delta: scaledDelta,
        description:
          "The front office took on distressed financing just to stay afloat - fans see it for what it is.",
      },
    ]),
  ]);

  revalidatePath(`/leagues/${leagueId}/finances`);
}
