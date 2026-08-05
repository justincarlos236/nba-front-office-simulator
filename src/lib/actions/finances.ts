"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isValidDepartmentBudget, type DepartmentBudget } from "@/lib/finances/departments";
import type { TicketPricingPosture, DepartmentLevel } from "@/generated/prisma/client";

const TICKET_POSTURES: TicketPricingPosture[] = ["FAN_FRIENDLY", "STANDARD", "PREMIUM"];
const DEPARTMENT_LEVELS: DepartmentLevel[] = ["MINIMAL", "LOW", "STANDARD", "HIGH", "MAXIMUM"];

export interface BusinessStrategyInput {
  ticketPricingPosture: TicketPricingPosture;
}

/**
 * Sets the user team's ticket-pricing posture. The effect lands at the
 * usual points (gate revenue in the season P&L + a fan-happiness/season-
 * ticket-base drag at the season boundary), so this action only persists
 * the choice - nothing here touches cap/CBA rules.
 *
 * Finances as a Gameplay Pillar (Phase 4) - the facilities/medical
 * investment levers this action used to also set are gone; see
 * updateDepartmentBudgetAction below.
 */
export async function updateBusinessStrategyAction(
  leagueId: string,
  input: BusinessStrategyInput,
): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  if (!league.userControlledTeamId) {
    throw new Error("No team to manage");
  }

  if (!TICKET_POSTURES.includes(input.ticketPricingPosture)) {
    throw new Error("Invalid business strategy");
  }

  await prisma.leagueTeam.update({
    where: { id: league.userControlledTeamId },
    data: { ticketPricingPosture: input.ticketPricingPosture },
  });

  revalidatePath(`/leagues/${leagueId}/finances`);
  revalidatePath(`/leagues/${leagueId}`);
}

/**
 * Finances as a Gameplay Pillar (Phase 4) - System 6, "Front Office
 * Departments." Sets the user team's zero-sum 6-department budget
 * allocation. Re-validated server-side (never trusts the client's own
 * zero-sum bookkeeping) against both the real DepartmentLevel enum values
 * and isValidDepartmentBudget's DEPARTMENT_BUDGET_TOTAL constraint - the
 * whole point of the mechanic is that funding one department costs
 * another, so a client bug or tampering that submits an over-budget
 * allocation must be rejected, not silently accepted.
 */
export async function updateDepartmentBudgetAction(
  leagueId: string,
  budget: DepartmentBudget,
): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league || league.ownerId !== session.user.id) {
    throw new Error("League not found");
  }
  if (!league.userControlledTeamId) {
    throw new Error("No team to manage");
  }

  const levels = [
    budget.scouting,
    budget.playerDevelopment,
    budget.sportsScience,
    budget.analytics,
    budget.marketing,
    budget.coachingSupport,
  ];
  if (levels.some((level) => !DEPARTMENT_LEVELS.includes(level))) {
    throw new Error("Invalid department level");
  }
  if (!isValidDepartmentBudget(budget)) {
    throw new Error(
      "Department budget must be fully allocated - funding one department requires taking from another",
    );
  }

  await prisma.leagueTeam.update({
    where: { id: league.userControlledTeamId },
    data: {
      scoutingLevel: budget.scouting,
      playerDevelopmentLevel: budget.playerDevelopment,
      sportsScienceLevel: budget.sportsScience,
      analyticsLevel: budget.analytics,
      marketingLevel: budget.marketing,
      coachingSupportLevel: budget.coachingSupport,
    },
  });

  revalidatePath(`/leagues/${leagueId}/finances`);
  revalidatePath(`/leagues/${leagueId}`);
}
