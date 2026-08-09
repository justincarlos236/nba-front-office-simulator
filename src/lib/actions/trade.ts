"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { prisma } from "@/lib/prisma";
import { validateTrade, type TradeAssetInput } from "@/lib/trade/validateTrade";
import { buildTradeCapSnapshotSide, type TradeCapSnapshot } from "@/lib/trade/capSnapshot";
import { describeTrade } from "@/lib/transactions/describeTransaction";
import { highestImportance, importanceForRating } from "@/lib/transactions/newsImportance";
import { computeCompetitivenessPercentiles } from "@/lib/actions/competitiveness";
import { computeTeamIdentity } from "@/lib/gm/teamIdentity";
import { computeTeamNeeds } from "@/lib/gm/teamNeeds";
import { resolvePlayerAge } from "@/lib/players/age";
import {
  evaluateTradeOffer,
  playerFillsNeed,
  type TradeAssetForEvaluation,
  type TradePlayerAsset,
} from "@/lib/trade/evaluateTradeOffer";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  applyFanHappinessDelta,
  applyScaledFanHappinessDelta,
  computeTradeSentimentDelta,
} from "@/lib/fans/sentimentEvents";
import { recordFanSentimentManyTx, type SentimentRecord } from "@/lib/fans/recordSentiment";
import { describeTradeSentiment } from "@/lib/fans/describeSentiment";
import { openIconDepartureFalloutIfEligible } from "@/lib/actions/fanNarrative";
import { computeMoraleAfterTrade } from "@/lib/morale/moraleEvents";
import {
  computeFranchiseIconScore,
  computeIconDepartureImpact,
} from "@/lib/finances/franchiseIcon";
import { describeIconDeparture } from "@/lib/finances/financeNews";
import { computeSponsorshipVoidPenaltyCents } from "@/lib/finances/sponsorship";
import { formatCentsCompact } from "@/lib/money";

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
  // Kept alongside the sheet so the trade cap snapshot can recompute the
  // "after" sheet from the same contracts (with traded salary moved across)
  // without issuing a second round of queries.
  const contracts = leaguePlayers
    .filter((lp) => lp.contract?.years[0])
    .map((lp) => ({
      leaguePlayerId: lp.id,
      playerId: lp.playerId,
      salaryCents: lp.contract!.years[0].salaryCents,
    }));
  const capSheet = computeCapSheet({ season, contracts });
  return { capSheet, contracts };
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

  const league = await prisma.league.findUnique({
    where: { id: input.leagueId },
    include: { teams: true },
  });
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
    myCapState,
    theirCapState,
    myOwnedFirstRoundSeasons,
    theirOwnedFirstRoundSeasons,
    fromLeagueTeam,
    toLeagueTeam,
    toTeamRoster,
    fromTeamRoster,
    competitivenessPercentiles,
    // Finances as a Gameplay Pillar (Phase 2) - "star clause" sponsorship
    // deals whose condition player is among the players the user is
    // sending away. Only the user's team ever has real SponsorshipDeal
    // rows (CPU teams use a formula baseline, never a signed deal), so
    // theirPlayers never needs the same check.
    voidCandidateDeals,
  ] = await Promise.all([
    prisma.leaguePlayer.findMany({
      where: { id: { in: input.myPlayerIds }, leagueTeamId: input.fromTeamId },
      include: {
        player: true,
        contract: { include: { years: { where: { season: league.currentSeason } } } },
        personalityProfile: true,
      },
    }),
    prisma.leaguePlayer.findMany({
      where: { id: { in: input.theirPlayerIds }, leagueTeamId: input.toTeamId },
      include: {
        player: true,
        contract: { include: { years: { where: { season: league.currentSeason } } } },
        personalityProfile: true,
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
    // The CPU team's own full active roster - identity/needs/untouchable
    // context for evaluateTradeOffer, distinct from theirPlayers (just the
    // players actually being traded away).
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId: input.toTeamId, isActive: true },
      include: { player: true },
    }),
    // Fan Engagement Deepening (Phase 1) - the user's own roster, so their
    // own fans' reaction can be judged from the user's own side via the
    // same evaluateTradeOffer call the CPU side already gets, not a
    // simplified proxy.
    prisma.leaguePlayer.findMany({
      where: { leagueTeamId: input.fromTeamId, isActive: true },
      include: { player: true },
    }),
    computeCompetitivenessPercentiles(league.teams),
    prisma.sponsorshipDeal.findMany({
      where: {
        leagueId: league.id,
        leagueTeamId: input.fromTeamId,
        status: "ACTIVE",
        conditionLeaguePlayerId: { in: input.myPlayerIds },
      },
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
        apronLevel: myCapState.capSheet.apronLevel,
        capSpaceCents: myCapState.capSheet.capSpaceCents,
        ownedFutureFirstRoundPickSeasons: myOwnedFirstRoundSeasons,
      },
      [input.toTeamId]: {
        apronLevel: theirCapState.capSheet.apronLevel,
        capSpaceCents: theirCapState.capSheet.capSpaceCents,
        ownedFutureFirstRoundPickSeasons: theirOwnedFirstRoundSeasons,
      },
    },
  });

  if (!validation.isValid) {
    throw new Error(validation.violations.map((v) => v.message).join(" "));
  }

  // Trade-AI evaluation (Phase 11c): does the CPU team actually want this
  // deal? Runs only after legality passes - a real GM never considers a
  // trade its team can't even legally make.
  const toTeamAvgAge =
    toTeamRoster.length > 0
      ? toTeamRoster.reduce(
          (sum, lp) => sum + resolvePlayerAge(lp.player, league.currentSeason),
          0,
        ) / toTeamRoster.length
      : 27;
  const toTeamIdentity = computeTeamIdentity(
    competitivenessPercentiles.get(input.toTeamId) ?? 0.5,
    toTeamAvgAge,
  );
  const toTeamNeeds = computeTeamNeeds(
    toTeamRoster.map((lp) => ({ position: lp.player.position, overallRating: lp.overallRating })),
  );

  const toPlayerAsset = (lp: (typeof myPlayers)[number]): TradeAssetForEvaluation => ({
    type: "PLAYER",
    overallRating: lp.overallRating,
    potentialRating: lp.potentialRating,
    age: resolvePlayerAge(lp.player, league.currentSeason),
    position: lp.player.position,
    currentSalaryCents: lp.contract!.years[0].salaryCents,
    injuryStatus: lp.injuryStatus,
    careerGamesMissedToInjury: lp.careerGamesMissedToInjury,
  });
  const toPickAsset = (p: (typeof myPicks)[number]): TradeAssetForEvaluation => ({
    type: "DRAFT_PICK",
    pickSeason: p.season,
    round: p.round as 1 | 2,
    overallPickNumber: p.overallPickNumber,
    originalTeamCompetitivenessPercentile: competitivenessPercentiles.get(p.originalTeamId) ?? 0.5,
  });

  const evaluation = evaluateTradeOffer({
    respondingTeam: {
      identity: toTeamIdentity,
      needs: toTeamNeeds,
      personality: toLeagueTeam.gmPersonality,
      roster: toTeamRoster.map((lp) => ({
        overallRating: lp.overallRating,
        age: resolvePlayerAge(lp.player, league.currentSeason),
      })),
    },
    currentSeason: league.currentSeason,
    incoming: [...myPlayers.map(toPlayerAsset), ...myPicks.map(toPickAsset)],
    outgoing: [...theirPlayers.map(toPlayerAsset), ...theirPicks.map(toPickAsset)],
  });

  if (evaluation.decision !== "ACCEPT") {
    const teamLabel = `${toLeagueTeam.team.city} ${toLeagueTeam.team.name}`;
    if (evaluation.reasons.includes("UNTOUCHABLE_PLAYER")) {
      throw new Error(`The ${teamLabel} are unwilling to move that player for what's on offer.`);
    }
    if (evaluation.decision === "COUNTER") {
      throw new Error(
        `The ${teamLabel} don't think this deal quite works for them - try sweetening the offer.`,
      );
    }
    throw new Error(`The ${teamLabel} don't believe this trade is in their favor.`);
  }

  // Fan Engagement Deepening (Phase 1) - the same evaluateTradeOffer call,
  // asked from the user's own side too (the "ask both sides" pattern
  // CPU-CPU trades already use), purely to judge how the user's own fans
  // read this deal - it never gates whether the trade executes, only how
  // much it moves fanHappiness.
  const fromTeamAvgAge =
    fromTeamRoster.length > 0
      ? fromTeamRoster.reduce(
          (sum, lp) => sum + resolvePlayerAge(lp.player, league.currentSeason),
          0,
        ) / fromTeamRoster.length
      : 27;
  const fromTeamIdentity = computeTeamIdentity(
    competitivenessPercentiles.get(input.fromTeamId) ?? 0.5,
    fromTeamAvgAge,
  );
  const fromTeamNeeds = computeTeamNeeds(
    fromTeamRoster.map((lp) => ({ position: lp.player.position, overallRating: lp.overallRating })),
  );
  const myEvaluation = evaluateTradeOffer({
    respondingTeam: {
      identity: fromTeamIdentity,
      needs: fromTeamNeeds,
      personality: fromLeagueTeam.gmPersonality,
      roster: fromTeamRoster.map((lp) => ({
        overallRating: lp.overallRating,
        age: resolvePlayerAge(lp.player, league.currentSeason),
      })),
    },
    currentSeason: league.currentSeason,
    incoming: [...theirPlayers.map(toPlayerAsset), ...theirPicks.map(toPickAsset)],
    outgoing: [...myPlayers.map(toPlayerAsset), ...myPicks.map(toPickAsset)],
  });
  const bestSentRating = myPlayers.reduce((best, lp) => Math.max(best, lp.overallRating), 0);
  const bestAcquiredRating = theirPlayers.reduce((best, lp) => Math.max(best, lp.overallRating), 0);
  const fromTeamFanDelta = computeTradeSentimentDelta({
    perspectiveScore: myEvaluation.score,
    acquiredStarTier: bestAcquiredRating > 0 ? getPlayerValueTier(bestAcquiredRating) : null,
    sentStarTier: bestSentRating > 0 ? getPlayerValueTier(bestSentRating) : null,
  });
  const toTeamFanDelta = computeTradeSentimentDelta({
    perspectiveScore: evaluation.score,
    acquiredStarTier: bestSentRating > 0 ? getPlayerValueTier(bestSentRating) : null,
    sentStarTier: bestAcquiredRating > 0 ? getPlayerValueTier(bestAcquiredRating) : null,
  });

  // Franchise Finances (Phase D) - losing a franchise icon is a business event
  // beyond the box score. Compute each departing player's pre-trade icon score
  // (star tier + tenure + homegrown); a genuine icon leaving costs the team it
  // leaves a franchise-value hit, an extra fan-happiness hit, and an "end of an
  // era" story. fromTeam loses myPlayers; toTeam loses theirPlayers.
  // `tradeSeason` is captured here (where `league` is narrowed non-null) because
  // the narrowing wouldn't survive into the nested function below.
  const tradeSeason = league.currentSeason;
  function iconLoss(players: typeof myPlayers) {
    let valueHitCents = 0;
    let fanHit = 0;
    const departedNames: string[] = [];
    // Fans Page Redesign (Phase 1) - the per-player hit is kept alongside the
    // aggregate so the sentiment ledger can attribute each icon's departure
    // its own real number, rather than splitting a summed hit evenly across
    // however many icons happened to move in the same deal.
    const departed: { leaguePlayerId: string; name: string; fanHit: number }[] = [];
    for (const lp of players) {
      const tenure =
        lp.joinedTeamSeason != null ? Math.max(0, tradeSeason - lp.joinedTeamSeason) : 0;
      const score = computeFranchiseIconScore({
        starTier: getPlayerValueTier(lp.overallRating),
        tenureSeasons: tenure,
        homegrown: lp.homegrown,
        careerAwards: 0,
      });
      const impact = computeIconDepartureImpact(score);
      if (impact.notable) {
        valueHitCents += impact.franchiseValueHitCents;
        fanHit += impact.fanHappinessHit;
        departedNames.push(lp.player.fullName);
        departed.push({
          leaguePlayerId: lp.id,
          name: lp.player.fullName,
          fanHit: impact.fanHappinessHit,
        });
      }
    }
    return { valueHitCents, fanHit, departedNames, departed };
  }
  const fromIconLoss = iconLoss(myPlayers);
  const toIconLoss = iconLoss(theirPlayers);

  // Finances as a Gameplay Pillar (Phase 2) - trading away a "star clause"
  // deal's condition player voids the deal: a real, understood cost for
  // the roster flexibility the clause was pricing in the first place. Cap/
  // CBA legality is untouched - this only ever adds a cash penalty, never
  // blocks the move (see docs/FINANCES_PILLAR_DESIGN.md's trade-builder
  // warning finding).
  const sponsorshipVoids = voidCandidateDeals.map((deal) => ({
    deal,
    penaltyCents: computeSponsorshipVoidPenaltyCents(
      Number(deal.annualValueCents),
      deal.endSeason - tradeSeason + 1,
    ),
  }));
  const totalVoidPenaltyCents = sponsorshipVoids.reduce((sum, v) => sum + v.penaltyCents, 0);

  // Immutable cap evidence for the trade outcome surface. The "before" sheets
  // are the ones validation already loaded (no extra queries); the "after"
  // sheets are recomputed from the same contracts with the traded salary moved
  // across, which is exactly what the roster will look like once the writes
  // below land. Frozen here because cap sheets are otherwise always computed
  // from *current* state - see src/lib/trade/capSnapshot.ts.
  const salaryFor = (lp: (typeof myPlayers)[number]) => lp.contract?.years[0]?.salaryCents ?? 0n;

  const capSnapshot: TradeCapSnapshot = {
    season: tradeSeason,
    from: buildTradeCapSnapshotSide(
      myCapState.capSheet,
      computeCapSheet({
        season: tradeSeason,
        contracts: [
          ...myCapState.contracts.filter((c) => !input.myPlayerIds.includes(c.leaguePlayerId)),
          ...theirPlayers.map((lp) => ({
            leaguePlayerId: lp.id,
            playerId: lp.playerId,
            salaryCents: salaryFor(lp),
          })),
        ],
      }),
      fromTeamRoster.length,
      fromTeamRoster.length - myPlayers.length + theirPlayers.length,
    ),
    to: buildTradeCapSnapshotSide(
      theirCapState.capSheet,
      computeCapSheet({
        season: tradeSeason,
        contracts: [
          ...theirCapState.contracts.filter(
            (c) => !input.theirPlayerIds.includes(c.leaguePlayerId),
          ),
          ...myPlayers.map((lp) => ({
            leaguePlayerId: lp.id,
            playerId: lp.playerId,
            salaryCents: salaryFor(lp),
          })),
        ],
      }),
      toTeamRoster.length,
      toTeamRoster.length - theirPlayers.length + myPlayers.length,
    ),
  };
  const executedTradeId = await prisma.$transaction(async (tx) => {
    const trade = await tx.trade.create({
      data: {
        leagueId: league.id,
        proposedById: input.fromTeamId,
        status: "EXECUTED",
        resolvedAt: new Date(),
        validationResult: validation as unknown as object,
        capSnapshot: capSnapshot as unknown as object,
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
      // Player Morale & Personality System - a trade is a fresh start:
      // most of whatever grudge caused/didn't cause this trade doesn't
      // carry over, and any standing trade request is resolved by the
      // move itself.
      const moraleUpdate = lp.personalityProfile
        ? {
            morale: computeMoraleAfterTrade(lp.morale, {
              personality: lp.personalityProfile,
              newTeamIdentity: toTeamIdentity,
              fillsNeed: toTeamNeeds.some((need) =>
                playerFillsNeed(toPlayerAsset(lp) as TradePlayerAsset, need),
              ),
            }),
            tradeRequestActive: false,
          }
        : {};
      await tx.leaguePlayer.update({
        where: { id: lp.id },
        data: {
          leagueTeamId: input.toTeamId,
          reSigningTeamId: input.toTeamId,
          // A depth-chart slot from the old team is meaningless on the new
          // one - reset so it doesn't collide with the new team's own
          // numbering (see src/lib/rotation/).
          rotationSlot: null,
          targetMinutesPerGame: null,
          // Franchise Finances (Phase D) - a traded player's tenure clock
          // restarts on the new team, and they're no longer homegrown there.
          joinedTeamSeason: league.currentSeason,
          homegrown: false,
          ...moraleUpdate,
        },
      });
      await tx.contract.update({
        where: { leaguePlayerId: lp.id },
        data: { leagueTeamId: input.toTeamId },
      });
    }
    for (const lp of theirPlayers) {
      const moraleUpdate = lp.personalityProfile
        ? {
            morale: computeMoraleAfterTrade(lp.morale, {
              personality: lp.personalityProfile,
              newTeamIdentity: fromTeamIdentity,
              fillsNeed: fromTeamNeeds.some((need) =>
                playerFillsNeed(toPlayerAsset(lp) as TradePlayerAsset, need),
              ),
            }),
            tradeRequestActive: false,
          }
        : {};
      await tx.leaguePlayer.update({
        where: { id: lp.id },
        data: {
          leagueTeamId: input.fromTeamId,
          reSigningTeamId: input.fromTeamId,
          rotationSlot: null,
          targetMinutesPerGame: null,
          joinedTeamSeason: league.currentSeason,
          homegrown: false,
          ...moraleUpdate,
        },
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

    // Finances as a Gameplay Pillar (Phase 2) - void every sponsorship deal
    // whose condition player just left, and charge the buyout penalty.
    if (sponsorshipVoids.length > 0) {
      await Promise.all(
        sponsorshipVoids.map(({ deal }) =>
          tx.sponsorshipDeal.update({
            where: { id: deal.id },
            data: { status: "VOIDED", voidedReason: "Condition player traded away" },
          }),
        ),
      );
    }

    // Fan Engagement Deepening (Phase 1) + Franchise Finances (Phase D) - the
    // trade sentiment delta and any franchise-icon-departure hit (fan + value)
    // are applied together in one update per team.
    const [fromTeamState, toTeamState] = await Promise.all([
      tx.leagueTeam.findUnique({
        where: { id: input.fromTeamId },
        select: {
          fanHappiness: true,
          franchiseValueCents: true,
          cashReserveCents: true,
          fanCulture: { select: { patience: true, loyalty: true } },
        },
      }),
      tx.leagueTeam.findUnique({
        where: { id: input.toTeamId },
        select: {
          fanHappiness: true,
          franchiseValueCents: true,
          fanCulture: { select: { patience: true, loyalty: true } },
        },
      }),
    ]);

    // Fans Page Redesign (Phase 3) - each component delta is scaled by this
    // team's culture BEFORE it's summed for the actual fanHappiness write,
    // and the same scaled value is what gets recorded to the ledger below -
    // never the raw one, so a ledger row always explains the real number.
    const tradeSentimentRows: SentimentRecord[] = [];
    let fromScaledTotal = 0;
    let toScaledTotal = 0;

    if (fromTeamState) {
      const tradeScaled = applyScaledFanHappinessDelta(
        fromTeamState.fanHappiness,
        fromTeamFanDelta,
        fromTeamState.fanCulture,
      ).scaledDelta;
      fromScaledTotal += tradeScaled;
      tradeSentimentRows.push({
        leagueId: league.id,
        leagueTeamId: input.fromTeamId,
        season: tradeSeason,
        kind: "TRADE",
        delta: tradeScaled,
        description: describeTradeSentiment({
          delta: tradeScaled,
          sentNames: myPlayers.map((lp) => lp.player.fullName),
          acquiredNames: theirPlayers.map((lp) => lp.player.fullName),
        }),
      });
      for (const icon of fromIconLoss.departed) {
        const iconScaled = applyScaledFanHappinessDelta(
          fromTeamState.fanHappiness,
          icon.fanHit,
          fromTeamState.fanCulture,
        ).scaledDelta;
        fromScaledTotal += iconScaled;
        tradeSentimentRows.push({
          leagueId: league.id,
          leagueTeamId: input.fromTeamId,
          season: tradeSeason,
          kind: "ICON_DEPARTURE",
          delta: iconScaled,
          description: `${icon.name} - a franchise icon - was traded away.`,
          leaguePlayerId: icon.leaguePlayerId,
        });
      }
      const fromNewFanHappiness = applyFanHappinessDelta(
        fromTeamState.fanHappiness,
        fromScaledTotal,
      );
      await tx.leagueTeam.update({
        where: { id: input.fromTeamId },
        data: {
          fanHappiness: fromNewFanHappiness,
          franchiseValueCents: BigInt(
            Math.max(0, Number(fromTeamState.franchiseValueCents) - fromIconLoss.valueHitCents),
          ),
          cashReserveCents: fromTeamState.cashReserveCents - BigInt(totalVoidPenaltyCents),
        },
      });
      // Fans Page Redesign (Phase 5) - "The Reed Trade Fallout" opens the
      // moment the departure actually happens, not deferred to season end.
      for (const icon of fromIconLoss.departed) {
        await openIconDepartureFalloutIfEligible(tx, {
          leagueId: league.id,
          leagueTeamId: input.fromTeamId,
          season: tradeSeason,
          dayIndex: 0,
          playerName: icon.name,
          leaguePlayerId: icon.leaguePlayerId,
          isTrade: true,
          fanHappinessAfterDeparture: fromNewFanHappiness,
        });
      }
    }
    if (toTeamState) {
      const tradeScaled = applyScaledFanHappinessDelta(
        toTeamState.fanHappiness,
        toTeamFanDelta,
        toTeamState.fanCulture,
      ).scaledDelta;
      toScaledTotal += tradeScaled;
      tradeSentimentRows.push({
        leagueId: league.id,
        leagueTeamId: input.toTeamId,
        season: tradeSeason,
        kind: "TRADE",
        delta: tradeScaled,
        description: describeTradeSentiment({
          delta: tradeScaled,
          sentNames: theirPlayers.map((lp) => lp.player.fullName),
          acquiredNames: myPlayers.map((lp) => lp.player.fullName),
        }),
      });
      for (const icon of toIconLoss.departed) {
        const iconScaled = applyScaledFanHappinessDelta(
          toTeamState.fanHappiness,
          icon.fanHit,
          toTeamState.fanCulture,
        ).scaledDelta;
        toScaledTotal += iconScaled;
        tradeSentimentRows.push({
          leagueId: league.id,
          leagueTeamId: input.toTeamId,
          season: tradeSeason,
          kind: "ICON_DEPARTURE",
          delta: iconScaled,
          description: `${icon.name} - a franchise icon - was traded away.`,
          leaguePlayerId: icon.leaguePlayerId,
        });
      }
      const toNewFanHappiness = applyFanHappinessDelta(toTeamState.fanHappiness, toScaledTotal);
      await tx.leagueTeam.update({
        where: { id: input.toTeamId },
        data: {
          fanHappiness: toNewFanHappiness,
          franchiseValueCents: BigInt(
            Math.max(0, Number(toTeamState.franchiseValueCents) - toIconLoss.valueHitCents),
          ),
        },
      });
      for (const icon of toIconLoss.departed) {
        await openIconDepartureFalloutIfEligible(tx, {
          leagueId: league.id,
          leagueTeamId: input.toTeamId,
          season: tradeSeason,
          dayIndex: 0,
          playerName: icon.name,
          leaguePlayerId: icon.leaguePlayerId,
          isTrade: true,
          fanHappinessAfterDeparture: toNewFanHappiness,
        });
      }
    }

    // Fans Page Redesign (Phase 1) - record *why* the numbers just moved.
    // The trade reaction and the franchise-icon departure are logged
    // separately even though they're summed into one fanHappiness write
    // above: fans remember "we got fleeced" and "they traded our guy" as
    // two different grievances, and the page's contributor ranking needs
    // them apart to say which one actually drove the swing.
    await recordFanSentimentManyTx(tx, tradeSentimentRows);

    // "End of an era" news for each genuine franchise-icon departure.
    const iconDepartureNews = [
      ...fromIconLoss.departedNames.map((name) => ({
        teamId: input.fromTeamId,
        teamLabel: `${fromLeagueTeam.team.city} ${fromLeagueTeam.team.name}`,
        name,
      })),
      ...toIconLoss.departedNames.map((name) => ({
        teamId: input.toTeamId,
        teamLabel: `${toLeagueTeam.team.city} ${toLeagueTeam.team.name}`,
        name,
      })),
    ];
    if (iconDepartureNews.length > 0) {
      await tx.leagueTransaction.createMany({
        data: iconDepartureNews.map((d) => ({
          leagueId: league.id,
          season: league.currentSeason,
          type: "FRANCHISE_MILESTONE" as const,
          description: describeIconDeparture(d.name, d.teamLabel),
          importance: "MAJOR" as const,
          teamIds: [d.teamId],
          tradeId: trade.id,
        })),
      });
    }

    // Finances as a Gameplay Pillar (Phase 2) - a news beat for every
    // voided sponsorship deal, naming the real buyout cost.
    if (sponsorshipVoids.length > 0) {
      await tx.leagueTransaction.createMany({
        data: sponsorshipVoids.map(({ deal, penaltyCents }) => ({
          leagueId: league.id,
          season: league.currentSeason,
          type: "BUSINESS_DECISION" as const,
          description: `The ${deal.label} deal has voided - trading away its condition player triggered a ${formatCentsCompact(penaltyCents)} buyout penalty.`,
          importance: "MAJOR" as const,
          teamIds: [input.fromTeamId],
          tradeId: trade.id,
        })),
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
        // As big as the biggest piece changing hands - a superstar trade
        // is real news regardless of what else is attached to it.
        importance: highestImportance(
          [...myPlayers, ...theirPlayers].map((lp) => importanceForRating(lp.overallRating)),
        ),
        teamIds: [fromLeagueTeam.id, toLeagueTeam.id],
        tradeId: trade.id,
      },
    });

    return trade.id;
  });

  // The outcome surface, not the dashboard. Every consequence this action just
  // computed - fan reaction, icon departures, the cap move - is reconstructable
  // from the trade row, and landing on it is what turns executing a trade into
  // a moment rather than a silent redirect.
  redirect(`/leagues/${league.id}/trades/${executedTradeId}?just=1`);
}
