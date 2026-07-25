"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { computeCareerRecordSnapshot } from "@/lib/actions/careerRecord";
import { computeReputationDelta } from "@/lib/gm/careerRecord";

/**
 * GM Career Mode - voluntarily end the current tenure and retire. Snapshots
 * the career onto the User exactly like a firing does (same permanence
 * reasoning - league deletion can't reconstruct it later), but with a
 * RETIRED end reason and no firing penalty, so a GM going out on their own
 * terms keeps (and can even build) their reputation. The league becomes a
 * permanent, read-only record afterward.
 */
export async function retireFromLeagueAction(leagueId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: { teams: { include: { team: true } } },
  });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  if (league.endedAt) {
    throw new Error("This franchise has already ended.");
  }
  const userLeagueTeam = league.teams.find((lt) => lt.id === league.userControlledTeamId);
  if (!userLeagueTeam) {
    throw new Error("No team to retire from");
  }

  const [snapshot, owner] = await Promise.all([
    computeCareerRecordSnapshot(leagueId, userLeagueTeam.id),
    prisma.user.findUnique({ where: { id: league.ownerId }, select: { gmReputation: true } }),
  ]);
  const reputationDelta = computeReputationDelta({
    seasons: snapshot.seasons,
    wins: snapshot.wins,
    losses: snapshot.losses,
    championships: snapshot.championships,
    playoffAppearances: snapshot.playoffAppearances,
    endReason: "RETIRED",
  });
  const newReputation = Math.max(0, Math.min(100, (owner?.gmReputation ?? 50) + reputationDelta));

  await prisma.$transaction([
    prisma.careerRecord.create({
      data: {
        userId: league.ownerId,
        leagueId,
        teamLabel: `${userLeagueTeam.team.city} ${userLeagueTeam.team.name}`,
        seasons: snapshot.seasons,
        wins: snapshot.wins,
        losses: snapshot.losses,
        championships: snapshot.championships,
        playoffAppearances: snapshot.playoffAppearances,
        bestPlayoffFinish: snapshot.bestPlayoffFinish,
        careerEarningsCents: userLeagueTeam.totalPayrollPaidCents,
        notableTradeDescription: snapshot.notableTradeDescription,
        endReason: "RETIRED",
        finalOwnerConfidence: league.ownerConfidence,
        reputationDelta,
      },
    }),
    prisma.user.update({ where: { id: league.ownerId }, data: { gmReputation: newReputation } }),
    prisma.league.update({ where: { id: leagueId }, data: { endedAt: new Date() } }),
  ]);

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath("/career");
  revalidatePath("/leagues");
  redirect(`/leagues/${leagueId}`);
}
