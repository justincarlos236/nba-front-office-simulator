"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { validateTrade, type TradeAssetInput } from "@/lib/trade/validateTrade";
import { describeTrade } from "@/lib/transactions/describeTransaction";

export interface ExecuteTradeInput {
  leagueId: string;
  fromTeamId: string;
  toTeamId: string;
  /** LeaguePlayer ids being sent away by fromTeamId. */
  myPlayerIds: string[];
  /** LeaguePlayer ids being sent away by toTeamId (i.e. received by fromTeamId). */
  theirPlayerIds: string[];
  /** DraftPick ids being sent away by fromTeamId. */
  myPickIds: string[];
  /** DraftPick ids being sent away by toTeamId (i.e. received by fromTeamId). */
  theirPickIds: string[];
}

function pickLabel(pick: { season: number; round: number }): string {
  return `${pick.season} ${pick.round === 1 ? "1st" : "2nd"} Round Pick`;
}

/** Future seasons this team currently owns its OWN round-1 pick for - the Stepien-rule input. */
async function loadOwnedFutureFirstRoundSeasons(leagueTeamId: string, currentSeason: number) {
  const picks = await prisma.draftPick.findMany({
    where: {
      originalTeamId: leagueTeamId,
      currentOwnerId: leagueTeamId,
      round: 1,
      selectedProspectId: null,
      season: { gte: currentSeason },
    },
    select: { season: true },
  });
  return picks.map((p) => p.season);
}

async function loadCapState(leagueTeamId: string, season: number) {
  const leaguePlayers = await prisma.leaguePlayer.findMany({
    where: { leagueTeamId },
    include: { contract: { include: { years: { where: { season } } } } },
  });
  const capSheet = computeCapSheet({
    season,
    contracts: leaguePlayers
      .filter((lp) => lp.contract?.years[0])
      .map((lp) => ({ playerId: lp.playerId, salaryCents: lp.contract!.years[0].salaryCents })),
  });
  return capSheet;
}

/**
 * Re-validates and executes a trade. Never trusts the client's validation
 * result - re-fetches current cap state and re-runs the same validator
 * server-side before touching the database, since the client-side check in
 * TradeBuilder is a UX affordance, not the authorization boundary.
 */
export async function executeTradeAction(input: ExecuteTradeInput) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  if (league.userControlledTeamId !== input.fromTeamId) {
    throw new Error("You can only trade away players from your own team");
  }

  const [
    myPlayers,
    theirPlayers,
    myPicks,
    theirPicks,
    myCapSheet,
    theirCapSheet,
    myOwnedFirstRoundSeasons,
    theirOwnedFirstRoundSeasons,
    fromLeagueTeam,
    toLeagueTeam,
  ] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { id: { in: input.myPlayerIds }, leagueTeamId: input.fromTeamId },
      include: {
        player: true,
        contract: { include: { years: { where: { season: league.currentSeason } } } },
      },
    }),
    prisma.leaguePlayer.findMany({
      where: { id: { in: input.theirPlayerIds }, leagueTeamId: input.toTeamId },
      include: {
        player: true,
        contract: { include: { years: { where: { season: league.currentSeason } } } },
      },
    }),
    prisma.draftPick.findMany({
      where: {
        id: { in: input.myPickIds },
        currentOwnerId: input.fromTeamId,
        selectedProspectId: null,
      },
    }),
    prisma.draftPick.findMany({
      where: {
        id: { in: input.theirPickIds },
        currentOwnerId: input.toTeamId,
        selectedProspectId: null,
      },
    }),
    loadCapState(input.fromTeamId, league.currentSeason),
    loadCapState(input.toTeamId, league.currentSeason),
    loadOwnedFutureFirstRoundSeasons(input.fromTeamId, league.currentSeason),
    loadOwnedFutureFirstRoundSeasons(input.toTeamId, league.currentSeason),
    prisma.leagueTeam.findUniqueOrThrow({
      where: { id: input.fromTeamId },
      include: { team: true },
    }),
    prisma.leagueTeam.findUniqueOrThrow({
      where: { id: input.toTeamId },
      include: { team: true },
    }),
  ]);

  if (myPlayers.length !== input.myPlayerIds.length) {
    throw new Error("One or more of your selected players is no longer on your roster");
  }
  if (theirPlayers.length !== input.theirPlayerIds.length) {
    throw new Error("One or more of the other team's selected players is no longer available");
  }
  if (myPicks.length !== input.myPickIds.length) {
    throw new Error("One or more of your selected picks is no longer available to trade");
  }
  if (theirPicks.length !== input.theirPickIds.length) {
    throw new Error("One or more of the other team's selected picks is no longer available");
  }

  const assets: TradeAssetInput[] = [
    ...myPlayers.map((lp): TradeAssetInput => ({
      type: "PLAYER",
      fromTeamId: input.fromTeamId,
      toTeamId: input.toTeamId,
      playerId: lp.id,
      salaryCents: lp.contract!.years[0].salaryCents,
      noTradeClause: lp.contract!.noTradeClause,
    })),
    ...theirPlayers.map((lp): TradeAssetInput => ({
      type: "PLAYER",
      fromTeamId: input.toTeamId,
      toTeamId: input.fromTeamId,
      playerId: lp.id,
      salaryCents: lp.contract!.years[0].salaryCents,
      noTradeClause: lp.contract!.noTradeClause,
    })),
    ...myPicks.map((p): TradeAssetInput => ({
      type: "DRAFT_PICK",
      fromTeamId: input.fromTeamId,
      toTeamId: input.toTeamId,
      pickId: p.id,
      season: p.season,
      round: p.round as 1 | 2,
    })),
    ...theirPicks.map((p): TradeAssetInput => ({
      type: "DRAFT_PICK",
      fromTeamId: input.toTeamId,
      toTeamId: input.fromTeamId,
      pickId: p.id,
      season: p.season,
      round: p.round as 1 | 2,
    })),
  ];

  const validation = validateTrade({
    season: league.currentSeason,
    assets,
    teamCapStates: {
      [input.fromTeamId]: {
        apronLevel: myCapSheet.apronLevel,
        capSpaceCents: myCapSheet.capSpaceCents,
        ownedFutureFirstRoundPickSeasons: myOwnedFirstRoundSeasons,
      },
      [input.toTeamId]: {
        apronLevel: theirCapSheet.apronLevel,
        capSpaceCents: theirCapSheet.capSpaceCents,
        ownedFutureFirstRoundPickSeasons: theirOwnedFirstRoundSeasons,
      },
    },
  });

  if (!validation.isValid) {
    throw new Error(validation.violations.map((v) => v.message).join(" "));
  }

  await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        leagueId: league.id,
        proposedById: input.fromTeamId,
        status: "EXECUTED",
        resolvedAt: new Date(),
        validationResult: validation as unknown as object,
      },
    });

    await tx.tradeAsset.createMany({
      data: assets.map((asset) => ({
        tradeId: trade.id,
        type: asset.type,
        fromLeagueTeamId: asset.fromTeamId,
        toLeagueTeamId: asset.toTeamId,
        leaguePlayerId: asset.type === "PLAYER" ? asset.playerId : null,
        draftPickId: asset.type === "DRAFT_PICK" ? asset.pickId : null,
      })),
    });

    for (const lp of myPlayers) {
      await tx.leaguePlayer.update({
        where: { id: lp.id },
        data: { leagueTeamId: input.toTeamId, reSigningTeamId: input.toTeamId },
      });
      await tx.contract.update({
        where: { leaguePlayerId: lp.id },
        data: { leagueTeamId: input.toTeamId },
      });
    }
    for (const lp of theirPlayers) {
      await tx.leaguePlayer.update({
        where: { id: lp.id },
        data: { leagueTeamId: input.fromTeamId, reSigningTeamId: input.fromTeamId },
      });
      await tx.contract.update({
        where: { leaguePlayerId: lp.id },
        data: { leagueTeamId: input.fromTeamId },
      });
    }

    for (const p of myPicks) {
      await tx.draftPick.update({ where: { id: p.id }, data: { currentOwnerId: input.toTeamId } });
    }
    for (const p of theirPicks) {
      await tx.draftPick.update({
        where: { id: p.id },
        data: { currentOwnerId: input.fromTeamId },
      });
    }

    await tx.leagueTransaction.create({
      data: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "TRADE",
        description: describeTrade(
          {
            teamLabel: `${fromLeagueTeam.team.city} ${fromLeagueTeam.team.name}`,
            sentAssetNames: [
              ...myPlayers.map((lp) => lp.player.fullName),
              ...myPicks.map(pickLabel),
            ],
          },
          {
            teamLabel: `${toLeagueTeam.team.city} ${toLeagueTeam.team.name}`,
            sentAssetNames: [
              ...theirPlayers.map((lp) => lp.player.fullName),
              ...theirPicks.map(pickLabel),
            ],
          },
        ),
      },
    });
  });

  redirect(`/leagues/${league.id}`);
}
