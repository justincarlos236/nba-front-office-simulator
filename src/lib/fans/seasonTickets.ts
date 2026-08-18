import type { TicketPricingPosture } from "@/generated/prisma/client";

/**
 * Finances as a Gameplay Pillar, System 5 - "Season Tickets."
 * A sticky 0-100 index (LeagueTeam.seasonTicketBase) that forms a floor
 * under the existing computeAttendancePct model (src/lib/fans/
 * fanHappiness.ts) - never replaces it. The asymmetry is the whole
 * mechanic: the base grows *slowly* with sustained winning, happy fans,
 * and fair pricing, but erodes *quickly* the moment you gouge on price or
 * put a bad product on the floor. A premium-pricing cash grab during a
 * rebuild is genuinely tempting in the short term and genuinely costly for
 * years afterward - the single clearest "immediate payoff, delayed
 * asymmetric cost" decision in the whole pillar.
 */

const TICKET_POSTURE_SEASON_TICKET_DELTA: Record<TicketPricingPosture, number> = {
  FAN_FRIENDLY: 1,
  STANDARD: 0,
  PREMIUM: -3,
};

const GROWTH_SCALE = 0.3;
const EROSION_SCALE = 0.7;
const GROWTH_CAP = 3;
const EROSION_CAP = 9;

export interface SeasonTicketBaseInputs {
  /** This season's win percentage. */
  winPct: number;
  ticketPosture: TicketPricingPosture;
  fanHappiness: number;
}

/**
 * The season-boundary delta to LeagueTeam.seasonTicketBase - the caller
 * clamps the result into 0-100, same convention as every other bounded
 * counter in this codebase (fanHappiness, ownerConfidence).
 */
export function computeSeasonTicketBaseDelta(inputs: SeasonTicketBaseInputs): number {
  const signal =
    (inputs.winPct - 0.5) * 10 +
    (inputs.fanHappiness - 65) / 5 +
    TICKET_POSTURE_SEASON_TICKET_DELTA[inputs.ticketPosture];

  if (signal >= 0) {
    return Math.min(GROWTH_CAP, Math.round(signal * GROWTH_SCALE));
  }
  return Math.max(-EROSION_CAP, Math.round(signal * EROSION_SCALE));
}

export function applySeasonTicketBaseDelta(current: number, delta: number): number {
  return Math.max(0, Math.min(100, current + delta));
}

// Deliberately modest at the neutral starting base (65, LeagueTeam's own
// default) - the floor should stay inert for a fresh save and only become
// genuinely protective once a team has earned real season-ticket loyalty
// through sustained good stewardship, while a base eroded toward 0 offers
// no protection at all.
const MIN_ATTENDANCE_FLOOR = 0.1;
const MAX_ATTENDANCE_FLOOR = 0.9;

/** The floor computeAttendancePct's result gets maxed against - never lowers attendance, only ever protects it. */
export function computeAttendanceFloor(seasonTicketBase: number): number {
  return (
    MIN_ATTENDANCE_FLOOR + (seasonTicketBase / 100) * (MAX_ATTENDANCE_FLOOR - MIN_ATTENDANCE_FLOOR)
  );
}
