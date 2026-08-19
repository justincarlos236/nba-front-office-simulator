"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSessionUserId, assertLeagueOwned } from "@/lib/auth/requireOwnedLeague";
import { computeWaiveCost } from "@/lib/cap/waive";
import { formatCentsCompact } from "@/lib/money";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import { reportFailures, type ActionFailure } from "@/lib/errors/actionResult";

/**
 * Releasing a player, and paying for it.
 *
 * The contract does not disappear - its guaranteed money becomes dead money on
 * the releasing club's cap for every season it was owed, while the player
 * leaves and may sign anywhere, including with a rival. That charge is the
 * whole point: without it a release is an undo button for any signing mistake
 * and the salary cap stops constraining anything.
 *
 * Re-signing rights are cleared deliberately. A club that releases a player has
 * given up its claim on him; letting it keep Bird rights would mean waiving to
 * dodge the cap hit and then re-signing over the cap, which is a loophole the
 * real CBA closes and this one should not open.
 */

export interface WaivePlayerInput {
  leagueId: string;
  leaguePlayerId: string;
}

export type WaivePlayerResult = ActionFailure | { ok: true; deadMoneyCents: string };

export async function waivePlayerAction(input: WaivePlayerInput): Promise<WaivePlayerResult> {
  return reportFailures(async () => {
    const userId = await requireSessionUserId();
    const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
    assertLeagueOwned(league, userId);

    const myLeagueTeamId = league.userControlledTeamId;
    if (!myLeagueTeamId) {
      return fail(
        "You don't control a team in this league.",
        "Only the club you run can release a player.",
      );
    }

    const season = league.currentSeason;
    const player = await prisma.leaguePlayer.findUnique({
      where: { id: input.leaguePlayerId },
      include: { player: true, contract: { include: { years: true } } },
    });

    if (!player || player.leagueId !== league.id) {
      return fail("That player couldn't be found.", "Head back to your roster and try again.");
    }
    if (player.leagueTeamId !== myLeagueTeamId) {
      return fail(
        "You can only release players from your own roster.",
        "Reload the roster and pick again.",
      );
    }
    if (!player.isActive) {
      return fail(`${player.player.fullName} is no longer active.`, "He cannot be released.");
    }

    const cost = computeWaiveCost({ years: player.contract?.years ?? [], fromSeason: season });
    const teamLabel = await prisma.leagueTeam.findUniqueOrThrow({
      where: { id: myLeagueTeamId },
      include: { team: true },
    });

    await prisma.$transaction(async (tx) => {
      // The charge is written before the contract goes, because the contract is
      // where the guarantee is recorded and deleting it first would lose it.
      if (cost.years.length > 0) {
        await tx.deadMoney.createMany({
          data: cost.years.map((y) => ({
            leagueId: league.id,
            leagueTeamId: myLeagueTeamId,
            season: y.season,
            amountCents: y.deadMoneyCents,
            playerName: player.player.fullName,
            waivedSeason: season,
          })),
        });
      }

      if (player.contract) {
        await tx.contract.delete({ where: { id: player.contract.id } });
      }

      await tx.leaguePlayer.update({
        where: { id: player.id },
        data: {
          leagueTeamId: null,
          // Cleared so the releasing club cannot waive to shed the cap hit and
          // then re-sign him over the cap on rights it no longer deserves.
          reSigningTeamId: null,
          rotationSlot: null,
          targetMinutesPerGame: null,
        },
      });

      await tx.leagueTransaction.create({
        data: {
          leagueId: league.id,
          season,
          type: "PLAYER_RELEASE",
          description:
            `The ${teamLabel.team.city} ${teamLabel.team.name} released ${player.player.fullName}` +
            (cost.totalCents > 0n
              ? `, carrying ${formatCentsCompact(cost.totalCents)} in dead money.`
              : "."),
          importance: importanceForRating(player.overallRating),
          teamIds: [myLeagueTeamId],
        },
      });
    });

    revalidatePath(`/leagues/${league.id}`);
    revalidatePath(`/leagues/${league.id}/rotation`);
    revalidatePath(`/leagues/${league.id}/finances`);
    return { ok: true as const, deadMoneyCents: cost.totalCents.toString() };
  });
}

function fail(summary: string, remedy: string): ActionFailure {
  return { ok: false, error: { summary, remedy } };
}
