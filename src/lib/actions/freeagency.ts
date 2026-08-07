"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { validateSigning } from "@/lib/freeagency/validateSigning";
import { computeReSigningMaxOfferCents } from "@/lib/freeagency/reSigningRights";
import { getSigningExceptionUsage } from "@/lib/actions/signingException";
import { describeSigning } from "@/lib/transactions/describeTransaction";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  applyScaledFanHappinessDelta,
  computeSigningSentimentDelta,
} from "@/lib/fans/sentimentEvents";
import { recordFanSentimentManyTx } from "@/lib/fans/recordSentiment";
import { describeSigningSentiment } from "@/lib/fans/describeSentiment";

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

  const freeAgent = await prisma.leaguePlayer.findUnique({
    where: { id: input.leaguePlayerId },
    include: { player: true },
  });
  if (!freeAgent || freeAgent.leagueId !== league.id) {
    throw new Error("Player not found");
  }
  if (freeAgent.leagueTeamId !== null) {
    throw new Error("This player has already signed elsewhere");
  }
  if (!freeAgent.isActive) {
    throw new Error("This player has retired");
  }

  const years = Math.min(4, Math.max(1, Math.round(input.years)));
  const offerSalaryCents = BigInt(input.offerSalaryCents);
  if (offerSalaryCents <= 0n) throw new Error("Offer must be a positive amount");

  const [myPlayers, myLeagueTeam, signingExceptionUsedCents] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId: myLeagueTeamId },
      include: { contract: { include: { years: { where: { season: league.currentSeason } } } } },
    }),
    prisma.leagueTeam.findUniqueOrThrow({ where: { id: myLeagueTeamId }, include: { team: true } }),
    getSigningExceptionUsage(myLeagueTeamId, league.currentSeason),
  ]);
  const capSheet = computeCapSheet({
    season: league.currentSeason,
    contracts: myPlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({ playerId: lp.playerId, salaryCents: lp.contract!.years[0].salaryCents })),
  });

  const validation = validateSigning({
    season: league.currentSeason,
    offerSalaryCents,
    team: {
      apronLevel: capSheet.apronLevel,
      capSpaceCents: capSheet.capSpaceCents,
      signingExceptionUsedCents,
    },
    reSigningRights: {
      held: freeAgent.reSigningTeamId === myLeagueTeamId,
      maxOfferCents: computeReSigningMaxOfferCents(freeAgent.overallRating, league.currentSeason),
    },
  });
  if (!validation.isValid) {
    throw new Error(validation.violation ?? "This offer isn't legal under current cap rules.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaguePlayer.update({
      where: { id: freeAgent.id },
      data: {
        leagueTeamId: myLeagueTeamId,
        reSigningTeamId: myLeagueTeamId,
        // A stale depth-chart slot from a prior team is meaningless here -
        // reset so it doesn't collide with this team's own numbering.
        rotationSlot: null,
        targetMinutesPerGame: null,
        // Franchise Finances (Phase D) - a signed free agent starts fresh:
        // tenure clock resets, not homegrown (they weren't drafted here).
        joinedTeamSeason: league.currentSeason,
        homegrown: false,
      },
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
            : validation.mechanism === "RE_SIGNING_RIGHTS"
              ? "BIRD_RIGHTS"
              : validation.mechanism === "CAP_SPACE"
                ? "NONE"
                : validation.mechanism === "NON_TAXPAYER_MLE"
                  ? "MID_LEVEL_NON_TAXPAYER"
                  : "MID_LEVEL_TAXPAYER",
      },
    });

    const yearSalaries = Array.from({ length: years }, (_, i) =>
      BigInt(Math.round(Number(offerSalaryCents) * (1 + 0.05 * i))),
    );
    await tx.contractYear.createMany({
      data: yearSalaries.map((salaryCents, i) => ({
        contractId: contract.id,
        season: league.currentSeason + i,
        salaryCents,
        guaranteedCents: salaryCents,
      })),
    });

    const totalSalaryCents = yearSalaries.reduce((sum, cents) => sum + cents, 0n);
    await tx.leagueTransaction.create({
      data: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "SIGNING",
        description: describeSigning(
          `${myLeagueTeam.team.city} ${myLeagueTeam.team.name}`,
          freeAgent.player.fullName,
          years,
          totalSalaryCents,
        ),
        importance: importanceForRating(freeAgent.overallRating),
        teamIds: [myLeagueTeamId],
      },
    });

    // Fan Engagement Deepening (Phase 1).
    const teamFans = await tx.leagueTeam.findUnique({
      where: { id: myLeagueTeamId },
      select: { fanHappiness: true, fanCulture: { select: { patience: true, loyalty: true } } },
    });
    if (teamFans) {
      const isReSigning = freeAgent.reSigningTeamId === myLeagueTeamId;
      const rawDelta = computeSigningSentimentDelta({
        signedStarTier: getPlayerValueTier(freeAgent.overallRating),
        isReSigning,
      });
      // Fans Page Redesign (Phase 3) - scaled by this team's Fan Culture
      // before it's applied or recorded.
      const { newFanHappiness, scaledDelta: delta } = applyScaledFanHappinessDelta(
        teamFans.fanHappiness,
        rawDelta,
        teamFans.fanCulture,
      );
      await tx.leagueTeam.update({
        where: { id: myLeagueTeamId },
        data: { fanHappiness: newFanHappiness },
      });
      // Fans Page Redesign (Phase 1) - persist why, not just the result.
      await recordFanSentimentManyTx(tx, [
        {
          leagueId: league.id,
          leagueTeamId: myLeagueTeamId,
          season: league.currentSeason,
          kind: "SIGNING",
          delta,
          description: describeSigningSentiment({
            playerName: freeAgent.player.fullName,
            isReSigning,
            delta,
          }),
          leaguePlayerId: freeAgent.id,
        },
      ]);
    }
  });

  redirect(`/leagues/${league.id}`);
}
