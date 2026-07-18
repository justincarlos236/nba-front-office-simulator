"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { validateSigning } from "@/lib/freeagency/validateSigning";

export interface SignFreeAgentInput {
  leagueId: string;
  leaguePlayerId: string;
  offerSalaryCents: string;
  years: number;
}

/**
 * Re-validates and executes a free-agent signing. Same principle as trade
 * execution: the client-side validateSigning check in SignOfferForm is a
 * UX affordance, not the authorization boundary - everything is re-derived
 * from current DB state here before any write happens.
 */
export async function signFreeAgentAction(input: SignFreeAgentInput) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: input.leagueId },
    include: { teams: true },
  });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) throw new Error("You don't control a team in this league");

  const freeAgent = await prisma.leaguePlayer.findUnique({ where: { id: input.leaguePlayerId } });
  if (!freeAgent || freeAgent.leagueId !== league.id) {
    throw new Error("Player not found");
  }
  if (freeAgent.leagueTeamId !== null) {
    throw new Error("This player has already signed elsewhere");
  }

  const years = Math.min(4, Math.max(1, Math.round(input.years)));
  const offerSalaryCents = BigInt(input.offerSalaryCents);
  if (offerSalaryCents <= 0n) throw new Error("Offer must be a positive amount");

  const myPlayers = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId: myLeagueTeamId },
    include: { contract: { include: { years: { where: { season: league.currentSeason } } } } },
  });
  const capSheet = computeCapSheet({
    season: league.currentSeason,
    contracts: myPlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({ playerId: lp.playerId, salaryCents: lp.contract!.years[0].salaryCents })),
  });

  const validation = validateSigning({
    season: league.currentSeason,
    offerSalaryCents,
    team: { apronLevel: capSheet.apronLevel, capSpaceCents: capSheet.capSpaceCents },
  });
  if (!validation.isValid) {
    throw new Error(validation.violation ?? "This offer isn't legal under current cap rules.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaguePlayer.update({
      where: { id: freeAgent.id },
      data: { leagueTeamId: myLeagueTeamId },
    });

    const contract = await tx.contract.create({
      data: {
        leaguePlayerId: freeAgent.id,
        leagueTeamId: myLeagueTeamId,
        signedSeason: league.currentSeason,
        startSeason: league.currentSeason,
        endSeason: league.currentSeason + years - 1,
        signedUsing:
          validation.mechanism === "VETERAN_MINIMUM"
            ? "VETERAN_MINIMUM"
            : validation.mechanism === "CAP_SPACE"
              ? "NONE"
              : validation.mechanism === "NON_TAXPAYER_MLE"
                ? "MID_LEVEL_NON_TAXPAYER"
                : "MID_LEVEL_TAXPAYER",
      },
    });

    await tx.contractYear.createMany({
      data: Array.from({ length: years }, (_, i) => ({
        contractId: contract.id,
        season: league.currentSeason + i,
        salaryCents: BigInt(Math.round(Number(offerSalaryCents) * (1 + 0.05 * i))),
        guaranteedCents: BigInt(Math.round(Number(offerSalaryCents) * (1 + 0.05 * i))),
      })),
    });
  });

  redirect(`/leagues/${league.id}`);
}
