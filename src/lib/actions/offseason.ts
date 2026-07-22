"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { estimateAge, estimateExperience } from "@/lib/players/age";
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
import { describeRetirement } from "@/lib/transactions/describeTransaction";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import type { NewsImportance } from "@/generated/prisma/client";
import { computeCapSheet } from "@/lib/cap/capSheet";
import { computeTeamStrength } from "@/lib/simulation/teamStrength";
import { computePayrollTier } from "@/lib/gm/payrollTier";
import { computeExpectationLevel } from "@/lib/gm/expectationLevel";
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

async function requireOwnedLeague(leagueId: string) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { include: { team: true } } },
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
    include: { player: true, contract: true },
  });
  const teamById = new Map(league.teams.map((t) => [t.id, t]));

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
  }[] = [];
  const contractIdsToDelete: string[] = [];
  const retirementEvents: {
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[] = [];

  const rng = createSeededRandom(`${leagueId}-${season}-offseason`);

  for (const lp of leaguePlayers) {
    const oldRating = lp.overallRating;
    const newAge = estimateAge(lp.player.draftYear, newSeason);
    const experience = estimateExperience(lp.player.draftYear, season);

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

      const boxAgg = boxScoreAggByPlayer.get(lp.id);
      if (boxAgg && boxAgg._count._all > 0) {
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
    });
    const retiring = shouldRetire(newAge, developedRating, rng);
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

    playerUpdates.push({
      id: lp.id,
      overallRating: finalRating,
      isActive: !retiring,
      leagueTeamId: retiring || contractExpired ? null : lp.leagueTeamId,
      retiredSeason: retiring ? season : null,
    });
  }

  const mvp = computeMVP(rosteredSnapshots);
  const roy = computeRookieOfTheYear(rosteredSnapshots);
  const mip = computeMostImprovedPlayer(developmentSnapshots);
  const dpoy = computeDefensivePlayerOfTheYear(defensiveSnapshots);
  const sixthMan = computeSixthManOfTheYear(benchSnapshots);

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
  // rows just written above, using data already fetched (leaguePlayers)
  // rather than a second query.
  const leaguePlayerById = new Map(leaguePlayers.map((lp) => [lp.id, lp]));
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

  const schedule = generateRoundRobinSchedule(
    league.teams.map((t) => t.id),
    `${leagueId}-${newSeason}`,
  );
  await prisma.game.createMany({
    data: schedule.map((game) => ({
      leagueId,
      season: newSeason,
      gameNumber: game.gameNumber,
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
  const ownershipMessages: string[] = [];

  if (userLeagueTeamId && priorExpectation) {
    // `newSeasonContractYears` doesn't depend on anything computed below (only
    // on `newSeason`/`userLeagueTeamId`, both already known) - fetched here
    // alongside the other independent queries rather than later in its own
    // round trip.
    const [series, playInGame, newSeasonContractYears] = await Promise.all([
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
    const confidenceDelta = computeConfidenceDelta(verdict, oldPayrollTier);
    ownerConfidence = ownerConfidence + confidenceDelta;

    ownershipMessages.push(
      describeSeasonEvaluation(
        verdict,
        priorExpectation.expectationLevel,
        actualOutcome.label,
        oldPayrollTier,
      ),
    );

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
      ownerConfidence = ownerConfidence + (complied ? 5 : -15);
      ownershipMessages.push(describeDirectiveCompliance(complied));
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
    const newExpectationLevel = computeExpectationLevel(newPayrollTier, newTeamStrength);

    await prisma.seasonExpectation.create({
      data: { leagueId, season: newSeason, expectationLevel: newExpectationLevel },
    });
    ownershipMessages.push(describeNewExpectation(newExpectationLevel));

    // A fresh directive only fires when ownership is already unhappy and
    // the team is still spending heavily - see the constants' comments.
    const stillHeavySpend = newPayrollTier === "SIGNIFICANT" || newPayrollTier === "EXTREME";
    if (ownerConfidence < DIRECTIVE_CONFIDENCE_THRESHOLD && stillHeavySpend) {
      payrollReductionTargetCents = BigInt(
        Math.round(Number(newCapSheet.totalSalaryCents) * DIRECTIVE_PAYROLL_REDUCTION_FRACTION),
      );
      payrollDirectiveSeason = newSeason + 1;
      ownershipMessages.push(
        describePayrollDirective(payrollReductionTargetCents, payrollDirectiveSeason),
      );
    }
  }

  await prisma.league.update({
    where: { id: leagueId },
    data: {
      currentSeason: newSeason,
      ownerConfidence,
      payrollReductionTargetCents,
      payrollDirectiveSeason,
    },
  });

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

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/playoffs`);
  revalidatePath(`/leagues/${leagueId}/offseason`);
  revalidatePath(`/leagues/${leagueId}/free-agents`);

  return {
    newSeason,
    retiredCount: playerUpdates.filter((u) => u.retiredSeason !== null).length,
  };
}
