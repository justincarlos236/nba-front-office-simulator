import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";

/**
 * Franchise Finances (Phase D) - "franchise icon" status, derived (never a
 * user-assigned label) from a player's actual relationship with the club:
 * how good they are (star tier), how long they've been here (tenure), whether
 * the team drafted them (homegrown), and what they've achieved in the league
 * (awards). This is what distinguishes a homegrown, decorated 10-year legend
 * from a superstar acquired at last season's deadline - and it's why losing
 * the former is a business earthquake while losing the latter is just a trade.
 *
 * Pure and Prisma-free; the caller supplies the already-known facts.
 */

const M = 1_000_000 * 100; // one million dollars, in cents

export interface FranchiseIconInput {
  starTier: PlayerValueTier;
  /** Seasons on the current team (currentSeason - joinedTeamSeason), >= 0. */
  tenureSeasons: number;
  /** True only if this team drafted the player. */
  homegrown: boolean;
  /** Count of notable career awards (MVP/All-NBA/All-Star/DPOY/etc.). */
  careerAwards: number;
}

const STAR_TIER_BASE: Record<PlayerValueTier, number> = {
  SUPERSTAR: 55,
  STAR: 40,
  STARTER: 22,
  ROTATION: 10,
  MINIMUM: 5,
};

const TENURE_POINTS_PER_SEASON = 2.5;
const TENURE_SEASONS_CAP = 12;
const HOMEGROWN_BONUS = 12;
const AWARD_POINTS_EACH = 2.5;
const AWARDS_CAP = 8;

/** 0-100 franchise-icon score. Star power is the biggest single input, but a
 *  long-tenured homegrown fan favorite with hardware can out-score a freshly
 *  acquired star. */
export function computeFranchiseIconScore(input: FranchiseIconInput): number {
  const base = STAR_TIER_BASE[input.starTier];
  const tenureBonus =
    Math.min(TENURE_SEASONS_CAP, Math.max(0, input.tenureSeasons)) * TENURE_POINTS_PER_SEASON;
  const homegrownBonus = input.homegrown ? HOMEGROWN_BONUS : 0;
  const awardBonus = Math.min(AWARDS_CAP, Math.max(0, input.careerAwards)) * AWARD_POINTS_EACH;
  return Math.round(Math.max(0, Math.min(100, base + tenureBonus + homegrownBonus + awardBonus)));
}

export type FranchiseIconLevel = "LEGEND" | "ICON" | "CORNERSTONE" | "CORE" | "REGULAR";

export const FRANCHISE_ICON_LABEL: Record<FranchiseIconLevel, string> = {
  LEGEND: "Franchise Legend",
  ICON: "Franchise Icon",
  CORNERSTONE: "Franchise Cornerstone",
  CORE: "Core Player",
  REGULAR: "Regular",
};

export function getFranchiseIconLevel(score: number): FranchiseIconLevel {
  if (score >= 85) return "LEGEND";
  if (score >= 68) return "ICON";
  if (score >= 50) return "CORNERSTONE";
  if (score >= 32) return "CORE";
  return "REGULAR";
}

/** The score at/above which a departure is a genuine business event, not just
 *  a roster move. */
export const ICON_DEPARTURE_THRESHOLD = 50; // CORNERSTONE and up

export interface IconDepartureImpact {
  /** True if this departure is notable enough to have business consequences. */
  notable: boolean;
  /** One-time franchise-value hit (cents, positive number to subtract). */
  franchiseValueHitCents: number;
  /** Fan-happiness delta (negative), in the same units as src/lib/fans deltas. */
  fanHappinessHit: number;
}

/**
 * The business fallout of an icon leaving (traded away, or walking in free
 * agency). Scales with icon score above the threshold, so trading a homegrown
 * legend guts the business while moving a role player does nothing. Bounded.
 */
export function computeIconDepartureImpact(iconScore: number): IconDepartureImpact {
  if (iconScore < ICON_DEPARTURE_THRESHOLD) {
    return { notable: false, franchiseValueHitCents: 0, fanHappinessHit: 0 };
  }
  // 0 at the threshold, 1 at a max-icon (100) departure.
  const intensity = (iconScore - ICON_DEPARTURE_THRESHOLD) / (100 - ICON_DEPARTURE_THRESHOLD);
  return {
    notable: true,
    franchiseValueHitCents: Math.round(80 * M + intensity * 320 * M), // ~$80M .. $400M
    fanHappinessHit: -(4 + Math.round(intensity * 8)), // -4 .. -12
  };
}

/**
 * The franchise-value premium a marquee player brings - the "value beyond
 * basketball production" the design brief asks for. A beloved homegrown legend
 * makes the whole franchise more valuable (drawing power, jersey sales,
 * cultural cachet) than an equally-rated player just passing through. Returned
 * as a bounded fraction added to the computed franchise value, so it
 * supplements market/success/popularity rather than dwarfing them. 0 below
 * Core level.
 */
export function iconValuePremiumFraction(iconScore: number): number {
  if (iconScore < 32) return 0; // below CORE adds nothing
  // 0 at 32, up to ~0.18 at a max-icon franchise legend.
  return Math.min(0.18, ((iconScore - 32) / (100 - 32)) * 0.18);
}
