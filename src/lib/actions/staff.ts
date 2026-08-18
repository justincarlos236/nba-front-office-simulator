"use server";

import { reportFailures } from "@/lib/errors/actionResult";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { describeStaffFire, describeStaffHire } from "@/lib/transactions/describeTransaction";
import { importanceForRating } from "@/lib/transactions/newsImportance";
import { formatCentsCompact } from "@/lib/money";
import { STAFF_ROLE_LABEL } from "@/lib/staff/labels";
import { computeMinAcceptableStaffOfferCents } from "@/lib/staff/hireValidation";
import {
  applyScaledFanHappinessDelta,
  computeStaffChangeSentimentDelta,
} from "@/lib/fans/sentimentEvents";
import { recordFanSentimentManyTx } from "@/lib/fans/recordSentiment";
import { describeStaffSentiment } from "@/lib/fans/describeSentiment";

const MIN_CONTRACT_YEARS = 1;
const MAX_CONTRACT_YEARS = 4;

export interface HireStaffInput {
  leagueId: string;
  staffId: string;
  years: number;
  annualSalaryCents: string;
}

/**
 * Re-validates and executes a staff hire. Same principle as
 * signFreeAgentAction: everything is re-derived from current DB state here,
 * not trusted from the client.
 */
export async function hireStaffAction(input: HireStaffInput) {
  return reportFailures(() => runHireStaffAction(input));
}

async function runHireStaffAction(input: HireStaffInput) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) throw new Error("You don't control a team in this league");

  const myLeagueTeam = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: myLeagueTeamId },
    include: { team: true },
  });

  const staff = await prisma.staff.findUnique({ where: { id: input.staffId } });
  if (!staff || staff.leagueId !== league.id) {
    throw new Error("Staff member not found");
  }
  if (staff.leagueTeamId !== null) {
    throw new Error("This staff member has already been hired elsewhere");
  }

  const years = Math.min(MAX_CONTRACT_YEARS, Math.max(MIN_CONTRACT_YEARS, Math.round(input.years)));
  const annualSalaryCents = BigInt(input.annualSalaryCents);
  if (annualSalaryCents <= 0n) throw new Error("Offer must be a positive amount");

  const minAcceptableCents = computeMinAcceptableStaffOfferCents(staff.role, staff.quality);
  if (annualSalaryCents < minAcceptableCents) {
    throw new Error(
      `${staff.fullName} won't accept an offer that low given their reputation - try at least ${formatCentsCompact(minAcceptableCents)}/year.`,
    );
  }

  const roleLabel = STAFF_ROLE_LABEL[staff.role];

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({ where: { id: staff.id }, data: { leagueTeamId: myLeagueTeamId } });

    await tx.staffContract.upsert({
      where: { staffId: staff.id },
      create: {
        staffId: staff.id,
        leagueTeamId: myLeagueTeamId,
        signedSeason: league.currentSeason,
        startSeason: league.currentSeason,
        endSeason: league.currentSeason + years - 1,
        annualSalaryCents,
      },
      update: {
        leagueTeamId: myLeagueTeamId,
        signedSeason: league.currentSeason,
        startSeason: league.currentSeason,
        endSeason: league.currentSeason + years - 1,
        annualSalaryCents,
      },
    });

    await tx.leagueTransaction.create({
      data: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "STAFF_HIRE",
        description: describeStaffHire(
          `${myLeagueTeam.team.city} ${myLeagueTeam.team.name}`,
          staff.fullName,
          roleLabel,
        ),
        importance: importanceForRating(staff.quality),
        teamIds: [myLeagueTeamId],
      },
    });

    // Fan Engagement Deepening.
    const teamFans = await tx.leagueTeam.findUnique({
      where: { id: myLeagueTeamId },
      select: { fanHappiness: true, fanCulture: { select: { patience: true, loyalty: true } } },
    });
    if (teamFans) {
      const rawDelta = computeStaffChangeSentimentDelta({
        role: staff.role,
        quality: staff.quality,
        isHire: true,
      });
      // Fans Page Redesign.
      const { newFanHappiness, scaledDelta: delta } = applyScaledFanHappinessDelta(
        teamFans.fanHappiness,
        rawDelta,
        teamFans.fanCulture,
      );
      await tx.leagueTeam.update({
        where: { id: myLeagueTeamId },
        data: { fanHappiness: newFanHappiness },
      });
      // persist why, not just the result.
      await recordFanSentimentManyTx(tx, [
        {
          leagueId: league.id,
          leagueTeamId: myLeagueTeamId,
          season: league.currentSeason,
          kind: "STAFF_CHANGE",
          delta,
          description: describeStaffSentiment(staff.fullName, true, delta),
        },
      ]);
    }
  });

  redirect(`/leagues/${league.id}/staff`);
}

export interface FireStaffInput {
  leagueId: string;
  staffId: string;
}

/**
 * No cap/cash penalty for firing in this phase - a real buyout mechanic is a
 * documented future refinement, not simulated here.
 */
export async function fireStaffAction(input: FireStaffInput) {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: input.leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }

  const myLeagueTeamId = league.userControlledTeamId;
  if (!myLeagueTeamId) throw new Error("You don't control a team in this league");

  const myLeagueTeam = await prisma.leagueTeam.findUniqueOrThrow({
    where: { id: myLeagueTeamId },
    include: { team: true },
  });

  const staff = await prisma.staff.findUnique({ where: { id: input.staffId } });
  if (!staff || staff.leagueId !== league.id) {
    throw new Error("Staff member not found");
  }
  if (staff.leagueTeamId !== myLeagueTeamId) {
    throw new Error("You can only fire staff on your own team");
  }

  const roleLabel = STAFF_ROLE_LABEL[staff.role];

  await prisma.$transaction(async (tx) => {
    await tx.staffContract.deleteMany({ where: { staffId: staff.id } });
    await tx.staff.update({ where: { id: staff.id }, data: { leagueTeamId: null } });

    await tx.leagueTransaction.create({
      data: {
        leagueId: league.id,
        season: league.currentSeason,
        type: "STAFF_FIRE",
        description: describeStaffFire(
          `${myLeagueTeam.team.city} ${myLeagueTeam.team.name}`,
          staff.fullName,
          roleLabel,
        ),
        importance: importanceForRating(staff.quality),
        teamIds: [myLeagueTeamId],
      },
    });

    // Fan Engagement Deepening.
    const teamFans = await tx.leagueTeam.findUnique({
      where: { id: myLeagueTeamId },
      select: { fanHappiness: true, fanCulture: { select: { patience: true, loyalty: true } } },
    });
    if (teamFans) {
      const rawDelta = computeStaffChangeSentimentDelta({
        role: staff.role,
        quality: staff.quality,
        isHire: false,
      });
      // Fans Page Redesign.
      const { newFanHappiness, scaledDelta: delta } = applyScaledFanHappinessDelta(
        teamFans.fanHappiness,
        rawDelta,
        teamFans.fanCulture,
      );
      await tx.leagueTeam.update({
        where: { id: myLeagueTeamId },
        data: { fanHappiness: newFanHappiness },
      });
      // persist why, not just the result.
      await recordFanSentimentManyTx(tx, [
        {
          leagueId: league.id,
          leagueTeamId: myLeagueTeamId,
          season: league.currentSeason,
          kind: "STAFF_CHANGE",
          delta,
          description: describeStaffSentiment(staff.fullName, false, delta),
        },
      ]);
    }
  });

  redirect(`/leagues/${league.id}/staff`);
}
