"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureDraftClassGenerated } from "@/lib/actions/draftClass";
import { computeDraftOrder, getSeededLotteryTeams } from "@/lib/draft/draftOrder";
import { LOTTERY_ODDS } from "@/lib/draft/draftLottery";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import {
  detectHeadlineProspect,
  detectNotableMovement,
  computeMovement,
} from "@/lib/draft/lotteryPresentation";
import {
  computeLotteryResultSentimentDelta,
  applyScaledFanHappinessDelta,
} from "@/lib/fans/sentimentEvents";
import { recordFanSentimentMany } from "@/lib/fans/recordSentiment";
import { describeLotterySentiment } from "@/lib/fans/describeSentiment";
import { Prisma, type NewsImportance } from "@/generated/prisma/client";
import { requireSessionUserId, assertLeagueOwned } from "@/lib/auth/requireOwnedLeague";

const LOTTERY_LEAGUE_INCLUDE = {
  // Fans Page Redesign (Phase 3).
  teams: { include: { team: true, fanCulture: true } },
} as const;

export type LotteryLeague = Prisma.LeagueGetPayload<{ include: typeof LOTTERY_LEAGUE_INCLUDE }>;

async function requireOwnedLeague(leagueId: string): Promise<LotteryLeague> {
  const userId = await requireSessionUserId();

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: LOTTERY_LEAGUE_INCLUDE,
  });
  assertLeagueOwned(league, userId);
  return league;
}

export interface LotteryResultPayload {
  currentOwnerTeamId: string;
  currentOwnerLabel: string;
  logoUrl: string | null;
  primaryColor: string;
  isUserTeam: boolean;
  originalTeamId: string;
  originalTeamLabel: string;
  /** True when a pre-draft trade means the team that earned this slot isn't the team receiving it. */
  ownedByAnotherTeam: boolean;
  projectedSeed: number;
  oddsForNumberOnePickPct: number;
  resultPickNumber: number;
  /** projectedSeed - resultPickNumber: positive = jumped up, negative = fell. */
  movement: number;
}

export interface DraftLotteryResult {
  /** Sorted pick 1 first - the client reveals in reverse (pick 14 down to pick 1). */
  results: LotteryResultPayload[];
  headlineProspect: { fullName: string; position: string; potentialRating: number } | null;
}

/**
 * Runs the real, already-existing lottery/draft-order math exactly once
 * (no changes to `runLottery`/`computeDraftOrder`), generates the draft
 * class, and persists everything a normal draft needs - this fully
 * replaces the old `startDraftAction`, which did the identical compute+
 * persist work with zero presentation. Additionally captures a permanent
 * `LotteryResult` snapshot (projected seed + real odds, captured before
 * the draw, plus the actual outcome), creates real news for what's
 * actually notable, and applies fan sentiment for every lottery team.
 * Returns the full 14-team result for the client to reveal progressively -
 * the reveal touches none of this data, it only paces how it's shown.
 */
export async function runDraftLotteryAction(leagueId: string): Promise<DraftLotteryResult> {
  const league = await requireOwnedLeague(leagueId);
  const season = league.currentSeason;

  const finals = await prisma.playoffSeries.findFirst({
    where: { leagueId, season, round: 4 },
  });
  if (!finals?.winnerTeamId) {
    throw new Error("Crown a champion in the playoffs before the draft.");
  }

  const existingStartedPick = await prisma.draftPick.findFirst({
    where: { leagueId, season, overallPickNumber: { not: null } },
  });
  if (existingStartedPick) {
    throw new Error("The draft lottery has already run for this season.");
  }

  const round1Series = await prisma.playoffSeries.findMany({
    where: { leagueId, season, round: 1 },
  });
  const playoffTeamIds = new Set<string>();
  for (const s of round1Series) {
    playoffTeamIds.add(s.higherSeedTeamId);
    playoffTeamIds.add(s.lowerSeedTeamId);
  }

  const teams = league.teams.map((t) => ({
    leagueTeamId: t.id,
    wins: t.wins,
    losses: t.losses,
  }));

  const rng = createSeededRandom(`${leagueId}-${season}-draft`);
  // Pure sort, no rng consumed - safe to compute independently of the
  // actual draw below for display/snapshot purposes.
  const seededLotteryTeams = getSeededLotteryTeams(teams, playoffTeamIds);
  const pickOrder = computeDraftOrder(teams, playoffTeamIds, rng);

  // Scouting Pillar Redesign (Phase 1) - the class now exists for the whole
  // pre-draft window, generated the moment the league enters it (or lazily
  // here as a fallback for a save that reaches the lottery without ever
  // visiting a scouting surface). No-op if it's already there.
  await ensureDraftClassGenerated(leagueId, season);
  const prospects = await prisma.draftProspect.findMany({ where: { leagueId, season } });

  // Every pick for this season already exists as a placeholder row (Phase
  // 11a), keyed by which team's own record earned the slot
  // (`originalTeamId`), possibly already re-owned by a different team via
  // a pre-draft trade. This only fills in `overallPickNumber` on those
  // existing rows - it must never recreate them with
  // `currentOwnerId: leagueTeamId`, or any pre-draft pick trade would
  // silently revert on draft day.
  const placeholderPicks = await prisma.draftPick.findMany({ where: { leagueId, season } });
  const placeholderByKey = new Map(
    placeholderPicks.map((p) => [`${p.round}-${p.originalTeamId}`, p]),
  );

  await Promise.all(
    pickOrder.map((leagueTeamId, index) => {
      const round = index < 30 ? 1 : 2;
      const placeholder = placeholderByKey.get(`${round}-${leagueTeamId}`);
      if (!placeholder) {
        throw new Error(
          `Missing pre-generated draft pick for team ${leagueTeamId}, round ${round}, season ${season}`,
        );
      }
      return prisma.draftPick.update({
        where: { id: placeholder.id },
        data: { overallPickNumber: index + 1 },
      });
    }),
  );

  const resultPickNumberByOriginalTeamId = new Map(
    pickOrder.slice(0, 14).map((originalTeamId, i) => [originalTeamId, i + 1]),
  );
  const teamLabelById = new Map(league.teams.map((t) => [t.id, `${t.team.city} ${t.team.name}`]));
  const fanHappinessById = new Map(league.teams.map((t) => [t.id, t.fanHappiness]));
  // Fans Page Redesign (Phase 3).
  const fanCultureById = new Map(league.teams.map((t) => [t.id, t.fanCulture]));
  const userTeamId = league.userControlledTeamId;

  const lotteryRows = seededLotteryTeams.map((t) => {
    const placeholder = placeholderByKey.get(`1-${t.leagueTeamId}`)!;
    return {
      leagueId,
      season,
      originalTeamId: t.leagueTeamId,
      currentOwnerId: placeholder.currentOwnerId,
      projectedSeed: t.seed,
      resultPickNumber: resultPickNumberByOriginalTeamId.get(t.leagueTeamId)!,
      oddsForNumberOnePickPct: LOTTERY_ODDS[t.seed] ?? 0,
    };
  });

  await prisma.lotteryResult.createMany({ data: lotteryRows });

  const headlineProspect = detectHeadlineProspect(prospects);
  const { biggestJump, biggestFall } = detectNotableMovement(lotteryRows);
  const winnerRow = lotteryRows.find((r) => r.resultPickNumber === 1)!;

  const newsRows: {
    type: "DRAFT_LOTTERY";
    description: string;
    importance: NewsImportance;
    teamIds: string[];
  }[] = [
    {
      type: "DRAFT_LOTTERY",
      description: headlineProspect
        ? `${teamLabelById.get(winnerRow.currentOwnerId)} win the draft lottery and the No. 1 overall pick - and with it, the first crack at ${headlineProspect.fullName}, this class's presumptive top prospect.`
        : `${teamLabelById.get(winnerRow.currentOwnerId)} win the draft lottery and the No. 1 overall pick.`,
      importance: "BREAKING",
      teamIds: [winnerRow.currentOwnerId],
    },
  ];
  if (biggestJump) {
    newsRows.push({
      type: "DRAFT_LOTTERY",
      description: `${teamLabelById.get(biggestJump.team.currentOwnerId)} leap from a projected No. ${biggestJump.team.projectedSeed} into the No. ${biggestJump.team.resultPickNumber} pick.`,
      importance: "MAJOR",
      teamIds: [biggestJump.team.currentOwnerId],
    });
  }
  if (biggestFall) {
    newsRows.push({
      type: "DRAFT_LOTTERY",
      description: `${teamLabelById.get(biggestFall.team.currentOwnerId)} slide from a projected No. ${biggestFall.team.projectedSeed} all the way to No. ${biggestFall.team.resultPickNumber}.`,
      importance: "MAJOR",
      teamIds: [biggestFall.team.currentOwnerId],
    });
  }

  const fanHappinessUpdates = lotteryRows.map((r) => {
    const movement = computeMovement(r);
    const rawDelta = computeLotteryResultSentimentDelta(movement, r.resultPickNumber === 1);
    const current = fanHappinessById.get(r.currentOwnerId) ?? 65;
    // Fans Page Redesign (Phase 3).
    const { newFanHappiness, scaledDelta } = applyScaledFanHappinessDelta(
      current,
      rawDelta,
      fanCultureById.get(r.currentOwnerId) ?? null,
    );
    return {
      leagueTeamId: r.currentOwnerId,
      fanHappiness: newFanHappiness,
      delta: scaledDelta,
      movement,
      wonNumberOne: r.resultPickNumber === 1,
    };
  });

  await Promise.all([
    prisma.leagueTransaction.createMany({
      data: newsRows.map((row) => ({ ...row, leagueId, season })),
    }),
    ...fanHappinessUpdates.map((u) =>
      prisma.leagueTeam.update({
        where: { id: u.leagueTeamId },
        data: { fanHappiness: u.fanHappiness },
      }),
    ),
    // Fans Page Redesign (Phase 1).
    recordFanSentimentMany(
      fanHappinessUpdates.map((u) => ({
        leagueId,
        leagueTeamId: u.leagueTeamId,
        season,
        kind: "DRAFT_LOTTERY" as const,
        delta: u.delta,
        description: describeLotterySentiment(u.movement, u.wonNumberOne),
      })),
    ),
  ]);

  revalidatePath(`/leagues/${leagueId}/draft`);
  revalidatePath(`/leagues/${leagueId}/draft/lottery`);

  const results: LotteryResultPayload[] = lotteryRows
    .map((r) => {
      const currentOwnerTeam = league.teams.find((t) => t.id === r.currentOwnerId)!;
      return {
        currentOwnerTeamId: r.currentOwnerId,
        currentOwnerLabel: teamLabelById.get(r.currentOwnerId) ?? "Unknown",
        logoUrl: currentOwnerTeam.team.logoUrl,
        primaryColor: currentOwnerTeam.team.primaryColor,
        isUserTeam: r.currentOwnerId === userTeamId,
        originalTeamId: r.originalTeamId,
        originalTeamLabel: teamLabelById.get(r.originalTeamId) ?? "Unknown",
        ownedByAnotherTeam: r.originalTeamId !== r.currentOwnerId,
        projectedSeed: r.projectedSeed,
        oddsForNumberOnePickPct: r.oddsForNumberOnePickPct,
        resultPickNumber: r.resultPickNumber,
        movement: computeMovement(r),
      };
    })
    .sort((a, b) => a.resultPickNumber - b.resultPickNumber);

  return { results, headlineProspect };
}
