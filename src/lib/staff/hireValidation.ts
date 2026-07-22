import type { StaffRole } from "@/generated/prisma/client";
import { computeStaffSalary } from "@/lib/staff/generateStaff";

// A lowball offer is rejected outright rather than silently accepted - the
// user can't hire a 95-quality Head Coach for veteran-minimum money. Mirrors
// validateSigning's accept/reject shape for player free agency, scaled to
// this system's much simpler flat-salary model instead of full cap rules.
const MIN_ACCEPTABLE_OFFER_RATIO = 0.6;

export function computeMinAcceptableStaffOfferCents(role: StaffRole, quality: number): bigint {
  const fairSalaryCents = computeStaffSalary(role, quality);
  return BigInt(Math.round(Number(fairSalaryCents) * MIN_ACCEPTABLE_OFFER_RATIO));
}
