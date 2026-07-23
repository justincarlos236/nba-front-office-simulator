"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveRotation } from "@/lib/rotation/resolveRotation";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import { describeRotationChange } from "@/lib/transactions/describeTransaction";
import type { RosterPlayerForSimulation } from "@/lib/actions/leagueTeamStrength";
import type { NewsImportance } from "@/generated/prisma/client";

const MIN_TARGET_MINUTES = 0;
// Matches allocateMinutes's own hard per-player clamp (src/lib/simulation/boxScore.ts) -
// a UI input above this would silently get engine-clamped down, so the
// action enforces the same real ceiling rather than letting the user set
// an unreachable target.
const MAX_TARGET_MINUTES = 40;
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
    include: { team: true },
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
      player: { select: { fullName: true, position: true } },
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

  const newsRows: { description: string; importance: NewsImportance; teamIds: string[] }[] = [];
  for (const r of roster) {
    const wasStarting = (beforeRankById.get(r.id) ?? Infinity) < STARTER_RANK_CEILING;
    const isStarting = (afterRankById.get(r.id) ?? Infinity) < STARTER_RANK_CEILING;
    if (wasStarting === isStarting) continue;
    newsRows.push({
      description: describeRotationChange(teamLabel, r.player.fullName, isStarting),
      importance: importanceForRating(r.overallRating),
      teamIds: [league.userControlledTeamId],
    });
  }

  await prisma.$transaction([
    ...roster.map((r) => {
      const override = afterOverrides.get(r.id)!;
      return prisma.leaguePlayer.update({
        where: { id: r.id },
        data: {
          rotationSlot: override.rotationSlot,
          targetMinutesPerGame: override.targetMinutesPerGame,
        },
      });
    }),
    ...(newsRows.length > 0
      ? [
          prisma.leagueTransaction.createMany({
            data: newsRows.map((row) => ({
              leagueId,
              season: league.currentSeason,
              type: "ROTATION_CHANGE" as const,
              description: row.description,
              importance: row.importance,
              teamIds: row.teamIds,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath(`/leagues/${leagueId}/rotation`);
  revalidatePath(`/leagues/${leagueId}`);

  return { ok: true };
}
