export type JobSecurityLevel =
  "VERY_SECURE" | "SECURE" | "STABLE" | "UNDER_PRESSURE" | "HOT_SEAT" | "CRITICAL";

export const JOB_SECURITY_LABEL: Record<JobSecurityLevel, string> = {
  VERY_SECURE: "Very Secure",
  SECURE: "Secure",
  STABLE: "Stable",
  UNDER_PRESSURE: "Under Pressure",
  HOT_SEAT: "Hot Seat",
  CRITICAL: "Critical",
};

export const JOB_SECURITY_DESCRIPTION: Record<JobSecurityLevel, string> = {
  VERY_SECURE: "Ownership fully trusts your direction for this team.",
  SECURE: "Ownership is happy with how things are going.",
  STABLE: "Ownership has no major concerns right now.",
  UNDER_PRESSURE: "Ownership is starting to question your decisions.",
  HOT_SEAT: "Ownership's patience is running out - results need to turn around.",
  CRITICAL: "Your job is genuinely at risk if this doesn't turn around soon.",
};

/**
 * Buckets the 0-100 Owner Confidence score into the level a user actually
 * reads - "Confidence: 42" means nothing on its own, "Under Pressure"
 * does. Mirrors the design brief's named levels exactly.
 */
export function getJobSecurityLevel(ownerConfidence: number): JobSecurityLevel {
  if (ownerConfidence >= 85) return "VERY_SECURE";
  if (ownerConfidence >= 70) return "SECURE";
  if (ownerConfidence >= 50) return "STABLE";
  if (ownerConfidence >= 30) return "UNDER_PRESSURE";
  if (ownerConfidence >= 15) return "HOT_SEAT";
  return "CRITICAL";
}
