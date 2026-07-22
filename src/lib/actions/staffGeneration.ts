import { prisma } from "@/lib/prisma";
import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { generateStaffMember } from "@/lib/staff/generateStaff";
import type { StaffRole } from "@/generated/prisma/client";

const STAFF_ROLES: StaffRole[] = ["HEAD_COACH", "PLAYER_DEVELOPMENT_COACH", "MEDICAL_STAFF"];
const FREE_AGENT_STAFF_POOL_SIZE_PER_ROLE = 6;

/**
 * Generates this league's staff (every team's Head Coach/Player Dev
 * Coach/Medical Staff, plus a small free-agent pool per role) if it
 * doesn't have any yet - a no-op otherwise. Called both at league
 * creation and lazily from the Staff page, so leagues created before
 * Phase 15a shipped self-heal on first visit instead of staying
 * permanently staff-less. Seeded per league+team+role (same determinism
 * convention as `pickRandomGmPersonality`), so a given league's staff are
 * reproducible regardless of when this actually runs.
 */
export async function ensureStaffGenerated(leagueId: string, season: number): Promise<void> {
  const existingCount = await prisma.staff.count({ where: { leagueId } });
  if (existingCount > 0) return;

  const leagueTeams = await prisma.leagueTeam.findMany({ where: { leagueId } });

  const rosteredStaffGenerated = leagueTeams.flatMap((lt) =>
    STAFF_ROLES.map((role) => ({
      leagueTeamId: lt.id as string | null,
      generated: generateStaffMember(role, createSeededRandom(`${leagueId}-${lt.id}-${role}`)),
    })),
  );
  const freeAgentStaffGenerated = STAFF_ROLES.flatMap((role) =>
    Array.from({ length: FREE_AGENT_STAFF_POOL_SIZE_PER_ROLE }, (_, i) => ({
      leagueTeamId: null as string | null,
      generated: generateStaffMember(
        role,
        createSeededRandom(`${leagueId}-freeagent-${role}-${i}`),
      ),
    })),
  );
  const allStaffGenerated = [...rosteredStaffGenerated, ...freeAgentStaffGenerated];

  // createManyAndReturn on Postgres compiles to a single INSERT...RETURNING,
  // which preserves input row order - safe to zip back up by array index
  // (staff has no natural external key to join on the way players join on
  // playerId).
  const createdStaff = await prisma.staff.createManyAndReturn({
    data: allStaffGenerated.map(({ leagueTeamId, generated }) => ({
      leagueId,
      leagueTeamId,
      role: generated.role,
      fullName: generated.fullName,
      age: generated.age,
      quality: generated.quality,
      reputation: generated.reputation,
      style: generated.style,
    })),
  });
  const staffContractInputs = createdStaff
    .map((staff, i) => ({ staffId: staff.id, ...allStaffGenerated[i] }))
    .filter((s) => s.leagueTeamId !== null)
    .map((s) => ({
      staffId: s.staffId,
      leagueTeamId: s.leagueTeamId!,
      signedSeason: season,
      startSeason: season,
      endSeason: season + s.generated.contractYears - 1,
      annualSalaryCents: s.generated.annualSalaryCents,
    }));
  if (staffContractInputs.length > 0) {
    await prisma.staffContract.createMany({ data: staffContractInputs });
  }
}
