import { randomInRange } from "@/lib/contracts/seededRandom";
import { generateProspectName } from "@/lib/draft/prospectNames";
import type { CoachStyle, StaffRole } from "@/generated/prisma/client";

/**
 * Algorithmic staff generation - no real-world coach/executive data is
 * sourced (same reasoning as this project's real contract generation: no
 * clean, ToS-safe source exists, and presenting a guess as a real person's
 * bio would be worse than an honest fictional one). Reuses
 * `generateProspectName` rather than a second name pool - generic enough
 * not to read as prospect-specific.
 */
export interface GeneratedStaff {
  role: StaffRole;
  fullName: string;
  age: number;
  quality: number;
  reputation: number;
  style: CoachStyle | null;
  contractYears: number;
  annualSalaryCents: bigint;
}

const AGE_RANGE: Record<StaffRole, [number, number]> = {
  HEAD_COACH: [38, 68],
  PLAYER_DEVELOPMENT_COACH: [32, 60],
  MEDICAL_STAFF: [32, 60],
};

const QUALITY_MIN = 60;
const QUALITY_MAX = 99;
const REPUTATION_SPREAD = 15;

// Neutral-quality (72, same anchor the rest of this codebase uses) annual
// salary per role - flavor-scaled, not tied to the real player salary cap.
const BASE_SALARY_CENTS: Record<StaffRole, bigint> = {
  HEAD_COACH: 4_000_000_00n,
  PLAYER_DEVELOPMENT_COACH: 600_000_00n,
  MEDICAL_STAFF: 500_000_00n,
};
const SALARY_QUALITY_ANCHOR = 72;

const COACH_STYLES: CoachStyle[] = ["PACE_AND_SPACE", "BALANCED", "GRIND_IT_OUT"];

const MIN_CONTRACT_YEARS = 2;
const MAX_CONTRACT_YEARS = 4;

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Averaging two uniform draws biases toward the middle of the range, so extreme hires (60 or 99) stay rare - same shape as a real hiring pool. */
function generateQuality(rng: () => number): number {
  const a = randomInRange(rng, QUALITY_MIN, QUALITY_MAX);
  const b = randomInRange(rng, QUALITY_MIN, QUALITY_MAX);
  return Math.round((a + b) / 2);
}

/** Exported for reuse where a contract needs regenerating for an already-existing staff member (e.g. a CPU team's auto-backfilled hire) without generating a whole new person. */
export function computeStaffSalary(role: StaffRole, quality: number): bigint {
  const multiplier = Math.pow(quality / SALARY_QUALITY_ANCHOR, 2);
  return BigInt(Math.round(Number(BASE_SALARY_CENTS[role]) * multiplier));
}

/** Generates one staff candidate for a given role - deterministic given `rng`, matching this codebase's seeded-RNG convention. */
export function generateStaffMember(
  role: StaffRole,
  rng: () => number = Math.random,
): GeneratedStaff {
  const [minAge, maxAge] = AGE_RANGE[role];
  const quality = generateQuality(rng);
  const reputation = clamp(
    Math.round(quality + randomInRange(rng, -REPUTATION_SPREAD, REPUTATION_SPREAD)),
    0,
    100,
  );

  return {
    role,
    fullName: generateProspectName(rng),
    age: randomIntInclusive(rng, minAge, maxAge),
    quality,
    reputation,
    style: role === "HEAD_COACH" ? COACH_STYLES[Math.floor(rng() * COACH_STYLES.length)] : null,
    contractYears: randomIntInclusive(rng, MIN_CONTRACT_YEARS, MAX_CONTRACT_YEARS),
    annualSalaryCents: computeStaffSalary(role, quality),
  };
}
