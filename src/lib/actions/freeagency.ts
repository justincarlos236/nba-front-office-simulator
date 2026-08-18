"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { DEFAULT_MAX_ROSTER_SIZE } from "@/lib/data-sources/rosterConstruction";
import { prisma } from "@/lib/prisma";
import { validateSigning } from "@/lib/freeagency/validateSigning";
import { computeReSigningMaxOfferCents } from "@/lib/freeagency/reSigningRights";
import { resolvePlayerAge, resolvePlayerExperience } from "@/lib/players/age";
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
import { resolveFreeAgentMarket } from "@/lib/freeagency/freeAgentMarket";
import { contractYearSalaries } from "@/lib/contracts/contractRaises";
import { formatCentsCompact } from "@/lib/money";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/userFacing";
import type { ActionFailure } from "@/lib/errors/actionResult";

export interface SignFreeAgentInput {
  leagueId: string;
  leaguePlayerId: string;
  offerSalaryCents: string;
  years: number;
}

/**
 * A signing that did not happen, and why.
 *
 * **Returned, never thrown.** Next.js redacts the message of any error thrown
 * out of a server action in a production build, so on the deployed site every
 * refusal - a cap ruling, a full roster, a player holding out for more - was
 * flattened into "That didn't go through. Nothing was changed." The user could
 * not sign anybody and was told nothing about why. A returned value crosses
 * the boundary intact.
 *
 * There is no success member: the action redirects to the new contract sheet,
 * so a caller that gets a value back is looking at a failure.
 */
export type SignFreeAgentResult = ActionFailure;

const fail = (error: UserFacingError): SignFreeAgentResult => ({ ok: false, error });

/**
 * Re-validates and executes a free-agent signing. Same principle as trade
 * execution: the client-side validateSigning check in SignOfferForm is a
 * UX affordance, not the authorization boundary - everything is re-derived
 * from current DB state here before any write happens.
 */
export async function signFreeAgentAction(input: SignFreeAgentInput): Promise<SignFreeAgentResult> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: input.leagueId },
    include: { teams: true },
  });
  if (!league || league.ownerId !== session.user.id) {
    return fail({
      summary: "That save couldn't be found.",
      remedy: "It may have been deleted. Head back to your leagues.",
    });
  }

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) {
    return fail({
      summary: "You don't control a team in this league.",
      remedy: "Only the club you run can sign players.",
    });
  }

  const freeAgent = await prisma.leaguePlayer.findUnique({
    where: { id: input.leaguePlayerId },
    include: {
      player: { include: { seasonStats: { where: { season: league.currentSeason } } } },
    },
  });
  if (!freeAgent || freeAgent.leagueId !== league.id) {
    return fail({
      summary: "That player couldn't be found.",
      remedy: "Head back to the free agent list and pick again.",
    });
  }
  if (freeAgent.leagueTeamId !== null) {
    return fail({
      summary: "Someone got there first.",
      remedy: "He has already signed elsewhere. Refresh to see who is still available.",
    });
  }
  if (!freeAgent.isActive) {
    return fail({
      summary: `${freeAgent.player.fullName} has retired.`,
      remedy: "He is no longer available to sign.",
    });
  }

  const years = Math.min(4, Math.max(1, Math.round(input.years)));
  const offerSalaryCents = BigInt(input.offerSalaryCents);
  if (offerSalaryCents <= 0n) {
    return fail({
      summary: "Enter a salary above zero.",
      remedy: "The first-year salary is in millions - type 4.5 to offer $4,500,000.",
    });
  }

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

  // Roster limit. `validateSigning` is a *cap* validator - it answers whether
  // the money is legal, and deliberately knows nothing about headcount. Nothing
  // else on this path checked either, so a user could sign free agents past the
  // 15-man limit indefinitely. CPU signings have always been guarded (see the
  // `withRoom` filter in `leagueEvents.ts`), and the trade path gained the same
  // check with docs/TRADE_AUDIT.md; this closes the last way past it.
  const activeRosterCount = myPlayers.filter((lp) => lp.isActive).length;
  if (activeRosterCount >= DEFAULT_MAX_ROSTER_SIZE) {
    return fail({
      summary: `Your roster is full at ${DEFAULT_MAX_ROSTER_SIZE} players.`,
      remedy: "Trade someone away before signing anyone else.",
    });
  }

  const validation = validateSigning({
    season: league.currentSeason,
    offerSalaryCents,
    yearsOfExperience: resolvePlayerExperience(freeAgent.player, league.currentSeason),
    team: {
      apronLevel: capSheet.apronLevel,
      capSpaceCents: capSheet.capSpaceCents,
      signingExceptionUsedCents,
    },
    reSigningRights: {
      held: freeAgent.reSigningTeamId === myLeagueTeamId,
      maxOfferCents: computeReSigningMaxOfferCents(
        freeAgent.overallRating,
        league.currentSeason,
        resolvePlayerAge(freeAgent.player, league.currentSeason),
        resolvePlayerExperience(freeAgent.player, league.currentSeason),
        freeAgent.player.position,
      ),
    },
  });
  if (!validation.isValid) {
    // Still routed through the translator: `violation` is an engine string and
    // the cap patterns there already turn it into a ruling with a remedy.
    return fail(
      toUserFacingError(validation.violation ?? "This offer isn't legal under current cap rules."),
    );
  }

  // Would he actually take it? docs/FREE_AGENCY_AUDIT.md FA-P0-1: nothing on
  // this path asked, and a minimum offer is always cap-legal, so every free
  // agent in the game signed for $1.4M. `validateSigning` above is right - it
  // answers whether the money is legal - but that is a different question from
  // whether the player says yes, and this is where the second one belongs.
  const market = await resolveFreeAgentMarket({
    leagueId: league.id,
    season: league.currentSeason,
    userLeagueTeamId: myLeagueTeamId,
    freeAgent,
  });
  if (offerSalaryCents < market.requiredSalaryCents) {
    const { requiredSalaryCents, rivalSuitors } = market;
    return fail({
      summary: `${freeAgent.player.fullName} turned this down.`,
      remedy:
        `He will sign for ${formatCentsCompact(requiredSalaryCents)} per year` +
        (rivalSuitors > 0
          ? `, with ${rivalSuitors} other ${rivalSuitors === 1 ? "club" : "clubs"} bidding.`
          : ".") +
        " Raise your offer to at least that.",
    });
  }

  const signedContractId = await prisma.$transaction(async (tx) => {
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

    // Raises follow the mechanism the deal was signed with - 8% on Bird
    // rights, 5% otherwise. This was a flat 5% for everything.
    const yearSalaries = contractYearSalaries(offerSalaryCents, years, contract.signedUsing);
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

    return contract.id;
  });

  // The contract sheet, not the dashboard. Signing was the other action that
  // computed a real consequence and then stepped over it on redirect.
  redirect(`/leagues/${league.id}/contracts/${signedContractId}?just=1`);
}
