import type { CoachStyle, StaffRole } from "@/generated/prisma/client";

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  HEAD_COACH: "Head Coach",
  PLAYER_DEVELOPMENT_COACH: "Player Development Coach",
  MEDICAL_STAFF: "Medical Staff",
};

export const COACH_STYLE_LABEL: Record<CoachStyle, string> = {
  PACE_AND_SPACE: "Pace & Space",
  BALANCED: "Balanced",
  GRIND_IT_OUT: "Grind It Out",
};
