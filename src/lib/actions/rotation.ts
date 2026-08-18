"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveRotation } from "@/lib/rotation/resolveRotation";
import { MAX_TARGET_MINUTES } from "@/lib/rotation/autoRotation";
import { rotationRoleForRank } from "@/lib/rotation/roleLabel";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import {
  describeRotationChange,
  describePlayerMoraleEvent,
  describeTradeRequest,
} from "@/lib/transactions/describeTransaction";
import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import {
  applyFanHappinessDelta,
  applyScaledFanHappinessDelta,
  computeRotationChangeSentimentDelta,
} from "@/lib/fans/sentimentEvents";
import { fanSentimentCreateOps, type SentimentRecord } from "@/lib/fans/recordSentiment";
import { describeRotationSentiment } from "@/lib/fans/describeSentiment";
import { computeRoleChangeMoraleDelta, MORALE_NEWS_THRESHOLD } from "@/lib/morale/moraleEvents";
import { applyMoraleChange } from "@/lib/morale/moraleLevel";
import { resolvePlayerAge } from "@/lib/players/age";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import type { NewsImportance } from "@/generated/prisma/client";

const MIN_TARGET_MINUTES = 0;
// MAX_TARGET_MINUTES matches allocateMinutes's own hard per-player clamp
// (src/lib/simulation/boxScore.ts) - a UI input above it would silently get
// engine-clamped down, so the action enforces the same real ceiling rather
// than letting the user set an unreachable target. Imported rather than
// restated so the board, this action and the engine cannot drift.
//
// It is a full regulation 48. It was 40, which stopped a user from making the
// call a real head coach can make - ride your best player and accept what it
// costs. Two models already price that cost: the injury rate climbs with the
// heaviest assignment on the roster and again as the season wears on
// (src/lib/simulation/leagueEvents.ts), and minutes above a sustainable load
// contribute at half credit to team strength (src/lib/rotation/rotationStrength.ts).
const STARTER_RANK_CEILING = 5; // ranks 0-4 are "starting five"

export interface RotationOrderEntry {
  leaguePlayerId: string;
  targetMinutesPerGame: number | null;
}

function clampMinutes(minutes: number | null): number | null {
  if (minutes === null) return null;
  return Math.max(MIN_TARGET_MINUTES, Math.min(MAX_TARGET_MINUTES, Math.round(minutes)));
}

interface RosterRow {
  id: string;
  overallRating: number;
  rotationSlot: number | null;
  targetMinutesPerGame: number | null;
  player: { fullName: string; position: RosterPlayerForSimulation["position"] };
}

function toSimRoster(
  rows: RosterRow[],
  overrides: Map<string, { rotationSlot: number | null; targetMinutesPerGame: number | null }>,
): RosterPlayerForSimulation[] {
  return rows.map((r) => {
    const override = overrides.get(r.id);
    return {
      leaguePlayerId: r.id,
      fullName: r.player.fullName,
      overallRating: r.overallRating,
      position: r.player.position,
      realStat: null,
      rotationSlot: override ? override.rotationSlot : r.rotationSlot,
      targetMinutesPerGame: override ? override.targetMinutesPerGame : r.targetMinutesPerGame,
    };
  });
}

/**
 * Persists a user's depth chart: `order`'s array position becomes each
 * player's rotationSlot (0 = first starter), and any active roster player
 * not present in `order` is reset to rotationSlot: null (out of rotation,
 * or eligible to auto-fill an open slot below whoever is customized) - see
 * src/lib/rotation/resolveRotation.ts for how that fallback works.
 *
 * Fires a ROTATION_CHANGE news story only for players whose starter/bench
 * boundary status actually flips (rank < 5 before vs. after) - matches the
 * user's "notable moves only" instruction, not a story per minutes tweak.
 */
export async function updateRotationAction(
  leagueId: string,
  order: RotationOrderEntry[],
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  if (!league.userControlledTeamId) {
    throw new Error("No controlled team");
  }
  const userLeagueTeam = await prisma.leagueTeam.findUnique({
    where: { id: league.userControlledTeamId },
    include: { team: true, fanCulture: { select: { patience: true, loyalty: true } } },
  });
  const teamLabel = userLeagueTeam
    ? `${userLeagueTeam.team.city} ${userLeagueTeam.team.name}`
    : "your team";

  const roster = await prisma.leaguePlayer.findMany({
    where: { leagueId, leagueTeamId: league.userControlledTeamId, isActive: true },
    select: {
      id: true,
      overallRating: true,
      rotationSlot: true,
      targetMinutesPerGame: true,
      morale: true,
      tradeRequestActive: true,
      personalityProfile: {
        select: {
          competitiveness: true,
          roleSensitivity: true,
          loyalty: true,
          financialMotivation: true,
        },
      },
      player: { select: { fullName: true, position: true, draftYear: true, birthDate: true } },
    },
  });
  const rosterIds = new Set(roster.map((r) => r.id));
  for (const entry of order) {
    if (!rosterIds.has(entry.leaguePlayerId)) {
      throw new Error("Invalid rotation entry - player not on your active roster");
    }
  }

  const beforeRoster = toSimRoster(roster, new Map());
  const beforeRankById = new Map(
    resolveRotation(beforeRoster).map((e) => [e.player.leaguePlayerId, e.rank]),
  );

  const afterOverrides = new Map<
    string,
    { rotationSlot: number | null; targetMinutesPerGame: number | null }
  >();
  for (const r of roster) {
    afterOverrides.set(r.id, { rotationSlot: null, targetMinutesPerGame: null });
  }
  order.forEach((entry, index) => {
    afterOverrides.set(entry.leaguePlayerId, {
      rotationSlot: index,
      targetMinutesPerGame: clampMinutes(entry.targetMinutesPerGame),
    });
  });

  const afterRoster = toSimRoster(roster, afterOverrides);
  const afterRankById = new Map(
    resolveRotation(afterRoster).map((e) => [e.player.leaguePlayerId, e.rank]),
  );

  const newsRows: {
    description: string;
    importance: NewsImportance;
    teamIds: string[];
    type: "ROTATION_CHANGE" | "PLAYER_MORALE";
    subjectLeaguePlayerId?: string;
  }[] = [];
  // Fan Engagement Deepening (Phase 1) - summed across every player whose
  // starter/bench status actually flipped this call (usually one, but a
  // full reshuffle can cross more than one boundary at once).
  let fanHappinessDelta = 0;
  const rotationSentimentRows: SentimentRecord[] = [];
  // Player Morale & Personality System - keyed separately from the
  // starter/bench-only fan-happiness loop above, since a player's own
  // morale reacts to any Starter/Sixth Man/Rotation/Bench category change,
  // not just crossing the starting-five line.
  const moraleUpdateById = new Map<string, { morale: number; tradeRequestActive: boolean }>();
  for (const r of roster) {
    const wasStarting = (beforeRankById.get(r.id) ?? Infinity) < STARTER_RANK_CEILING;
    const isStarting = (afterRankById.get(r.id) ?? Infinity) < STARTER_RANK_CEILING;
    if (wasStarting !== isStarting) {
      newsRows.push({
        description: describeRotationChange(teamLabel, r.player.fullName, isStarting),
        importance: importanceForRating(r.overallRating),
        teamIds: [league.userControlledTeamId],
        type: "ROTATION_CHANGE",
      });
      const rawRotationDelta = computeRotationChangeSentimentDelta({
        starTier: getPlayerValueTier(r.overallRating),
        promoted: isStarting,
      });
      // Fans Page Redesign (Phase 3) - scaled by culture before it's summed
      // or recorded. Each player's delta is small, so the pre-loop
      // happiness value is a fine reference point for the scale even though
      // several may apply in one call.
      const rotationDelta = userLeagueTeam
        ? applyScaledFanHappinessDelta(
            userLeagueTeam.fanHappiness,
            rawRotationDelta,
            userLeagueTeam.fanCulture,
          ).scaledDelta
        : rawRotationDelta;
      fanHappinessDelta += rotationDelta;
      // Fans Page Redesign (Phase 1) - one ledger row per player whose
      // starter status actually flipped, rather than a single lumped total,
      // so the page can name who the fanbase reacted to.
      rotationSentimentRows.push({
        leagueId,
        leagueTeamId: league.userControlledTeamId,
        season: league.currentSeason,
        kind: "ROTATION_CHANGE",
        delta: rotationDelta,
        description: describeRotationSentiment(r.player.fullName, isStarting),
        leaguePlayerId: r.id,
      });
    }

    const previousRole = rotationRoleForRank(beforeRankById.get(r.id) ?? null);
    const newRole = rotationRoleForRank(afterRankById.get(r.id) ?? null);
    if (previousRole === newRole || !r.personalityProfile) continue;

    const moraleDelta = computeRoleChangeMoraleDelta({
      personality: r.personalityProfile,
      previousRole,
      newRole,
      valueTier: getPlayerValueTier(r.overallRating),
      age: resolvePlayerAge(r.player, league.currentSeason),
    });
    if (moraleDelta === 0) continue;

    const result = applyMoraleChange(
      r.morale,
      moraleDelta,
      r.personalityProfile.loyalty,
      r.tradeRequestActive,
    );
    moraleUpdateById.set(r.id, {
      morale: result.morale,
      tradeRequestActive: result.tradeRequestActive,
    });

    if (Math.abs(moraleDelta) >= MORALE_NEWS_THRESHOLD) {
      newsRows.push({
        description: describePlayerMoraleEvent(
          r.player.fullName,
          teamLabel,
          moraleDelta > 0 ? "ROLE_INCREASE" : "ROLE_DECREASE",
          moraleDelta > 0 ? "up" : "down",
        ),
        importance: importanceForRating(r.overallRating),
        teamIds: [league.userControlledTeamId],
        type: "PLAYER_MORALE",
        subjectLeaguePlayerId: r.id,
      });
    }
    if (result.justActivated) {
      newsRows.push({
        description: describeTradeRequest(r.player.fullName, teamLabel),
        importance: importanceForRating(r.overallRating),
        teamIds: [league.userControlledTeamId],
        type: "PLAYER_MORALE",
        subjectLeaguePlayerId: r.id,
      });
    }
  }

  await prisma.$transaction([
    ...roster.map((r) => {
      const override = afterOverrides.get(r.id)!;
      const moraleUpdate = moraleUpdateById.get(r.id);
      return prisma.leaguePlayer.update({
        where: { id: r.id },
        data: {
          rotationSlot: override.rotationSlot,
          targetMinutesPerGame: override.targetMinutesPerGame,
          ...(moraleUpdate ?? {}),
        },
      });
    }),
    ...(newsRows.length > 0
      ? [
          prisma.leagueTransaction.createMany({
            data: newsRows.map((row) => ({
              leagueId,
              season: league.currentSeason,
              type: row.type,
              description: row.description,
              importance: row.importance,
              teamIds: row.teamIds,
              subjectLeaguePlayerId: row.subjectLeaguePlayerId,
            })),
          }),
        ]
      : []),
    ...(fanHappinessDelta !== 0 && userLeagueTeam
      ? [
          prisma.leagueTeam.update({
            where: { id: league.userControlledTeamId },
            data: {
              fanHappiness: applyFanHappinessDelta(userLeagueTeam.fanHappiness, fanHappinessDelta),
            },
          }),
        ]
      : []),
    // Fans Page Redesign (Phase 1) - committed in the same transaction as the
    // happiness change they explain.
    ...(userLeagueTeam ? fanSentimentCreateOps(rotationSentimentRows) : []),
  ]);

  revalidatePath(`/leagues/${leagueId}/rotation`);
  revalidatePath(`/leagues/${leagueId}`);

  return { ok: true };
}
