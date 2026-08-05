import type { CapitalProjectKind } from "@/generated/prisma/client";

/**
 * Finances as a Gameplay Pillar (Phase 5) - the shared "pay now, benefit
 * later, multi-season" plumbing behind both the Arena (System 2) and
 * Business Expansion (System 8). Same underlying mechanic (see
 * CapitalProject in prisma/schema.prisma), different flavor and effects
 * per kind. Cost is paid entirely up front at commit time - the multi-
 * season commitment is that the *benefit* doesn't land until
 * `completionSeason`, not an installment schedule.
 */

const DOLLARS = 100;
const M = 1_000_000 * DOLLARS;

export const CAPITAL_PROJECT_LABEL: Record<CapitalProjectKind, string> = {
  ARENA_RENOVATION: "Arena Renovation",
  ARENA_NEW_BUILD: "New Arena",
  GLEAGUE_AFFILIATE: "G-League Affiliate",
  INTERNATIONAL_ACADEMY: "International Academy",
  PRACTICE_FACILITY: "Practice & Performance Facility",
  REAL_ESTATE_MEDIA: "Real Estate & Media Arm",
};

export const CAPITAL_PROJECT_DESCRIPTION: Record<CapitalProjectKind, string> = {
  ARENA_RENOVATION:
    "A moderate-cost refresh - reduced capacity while it's underway, a permanent gate-revenue lift once it's done.",
  ARENA_NEW_BUILD:
    "The largest single investment in the game. Requires a city funding negotiation (see the Arena section) - the biggest franchise-value and revenue payoff available, and resets your arena's age and lease.",
  GLEAGUE_AFFILIATE:
    "A real development pipeline for young and two-way players - a basketball payoff, slow to arrive but real.",
  INTERNATIONAL_ACADEMY:
    "Grows your global brand and sponsorship reach - especially valuable for a market that can't win the gate-revenue game alone.",
  PRACTICE_FACILITY:
    "Compounds with your Player Development and Sports Science departments - better facilities, better outcomes on both fronts.",
  REAL_ESTATE_MEDIA:
    "The purest money play - permanent revenue diversification that insulates you from a losing season, at the cost of everything else that cash could have built.",
};

const COST_CENTS: Record<CapitalProjectKind, number> = {
  ARENA_RENOVATION: 60 * M,
  ARENA_NEW_BUILD: 320 * M,
  GLEAGUE_AFFILIATE: 25 * M,
  INTERNATIONAL_ACADEMY: 35 * M,
  PRACTICE_FACILITY: 30 * M,
  REAL_ESTATE_MEDIA: 45 * M,
};

const DURATION_SEASONS: Record<CapitalProjectKind, number> = {
  ARENA_RENOVATION: 2,
  ARENA_NEW_BUILD: 4,
  GLEAGUE_AFFILIATE: 2,
  INTERNATIONAL_ACADEMY: 3,
  PRACTICE_FACILITY: 2,
  REAL_ESTATE_MEDIA: 2,
};

export function capitalProjectCostCents(kind: CapitalProjectKind): number {
  return COST_CENTS[kind];
}

export function capitalProjectDurationSeasons(kind: CapitalProjectKind): number {
  return DURATION_SEASONS[kind];
}

/** A project committed this season completes at the start of startSeason + duration. */
export function capitalProjectCompletionSeason(
  kind: CapitalProjectKind,
  startSeason: number,
): number {
  return startSeason + DURATION_SEASONS[kind];
}

export interface CapitalProjectEffects {
  /** Permanent bump to LeagueTeam.arenaQualityIndex on completion. */
  arenaQualityBonus?: number;
  /** ARENA_NEW_BUILD only - resets arenaAgeSeasons to 0 on completion. */
  resetsArenaAge?: boolean;
  /** ARENA_NEW_BUILD only - extends arenaLeaseExpiresSeason by this many years on completion. */
  extendsLeaseYears?: number;
  /** Added to departmentQualityDelta(playerDevelopmentLevel) before feeding developPlayerRating. */
  playerDevelopmentBonus?: number;
  /** Added to departmentQualityDelta(sportsScienceLevel) before feeding the injury roll. */
  sportsScienceBonus?: number;
  /** Added to departmentQualityDelta(marketingLevel) before feeding computeFranchisePopularity. */
  popularityBonus?: number;
  /** Additive bonus to computeMarketingSponsorshipMultiplier's result. */
  sponsorshipMultiplierBonus?: number;
  /** Added to otherIncomeCents every season, forever, once COMPLETE. */
  recurringIncomeCents?: number;
}

const EFFECTS_BY_KIND: Record<CapitalProjectKind, CapitalProjectEffects> = {
  ARENA_RENOVATION: { arenaQualityBonus: 15 },
  ARENA_NEW_BUILD: { arenaQualityBonus: 35, resetsArenaAge: true, extendsLeaseYears: 25 },
  GLEAGUE_AFFILIATE: { playerDevelopmentBonus: 3 },
  INTERNATIONAL_ACADEMY: { popularityBonus: 4, sponsorshipMultiplierBonus: 0.1 },
  PRACTICE_FACILITY: { playerDevelopmentBonus: 2, sportsScienceBonus: 2 },
  REAL_ESTATE_MEDIA: { recurringIncomeCents: 6 * M },
};

export function capitalProjectEffects(kind: CapitalProjectKind): CapitalProjectEffects {
  return EFFECTS_BY_KIND[kind];
}

/** Sums every numeric/boolean effect across a team's COMPLETE projects - the aggregate bonus set offseason.ts's various call sites read from. */
export function sumCompletedProjectEffects(
  completedKinds: CapitalProjectKind[],
): Required<Omit<CapitalProjectEffects, "resetsArenaAge">> & { resetsArenaAge: boolean } {
  const totals = {
    arenaQualityBonus: 0,
    resetsArenaAge: false,
    extendsLeaseYears: 0,
    playerDevelopmentBonus: 0,
    sportsScienceBonus: 0,
    popularityBonus: 0,
    sponsorshipMultiplierBonus: 0,
    recurringIncomeCents: 0,
  };
  for (const kind of completedKinds) {
    const e = EFFECTS_BY_KIND[kind];
    totals.arenaQualityBonus += e.arenaQualityBonus ?? 0;
    totals.resetsArenaAge = totals.resetsArenaAge || (e.resetsArenaAge ?? false);
    totals.extendsLeaseYears += e.extendsLeaseYears ?? 0;
    totals.playerDevelopmentBonus += e.playerDevelopmentBonus ?? 0;
    totals.sportsScienceBonus += e.sportsScienceBonus ?? 0;
    totals.popularityBonus += e.popularityBonus ?? 0;
    totals.sponsorshipMultiplierBonus += e.sponsorshipMultiplierBonus ?? 0;
    totals.recurringIncomeCents += e.recurringIncomeCents ?? 0;
  }
  return totals;
}

// A project under construction is a real, felt cost beyond the up-front
// cash - only the two arena kinds reduce usable capacity while building.
const CONSTRUCTION_ATTENDANCE_PENALTY: Partial<Record<CapitalProjectKind, number>> = {
  ARENA_RENOVATION: 0.05,
  ARENA_NEW_BUILD: 0.08,
};

export function computeConstructionAttendancePenalty(
  inProgressKinds: CapitalProjectKind[],
): number {
  return inProgressKinds.reduce(
    (sum, kind) => sum + (CONSTRUCTION_ATTENDANCE_PENALTY[kind] ?? 0),
    0,
  );
}

export const ARENA_PROJECT_KINDS: CapitalProjectKind[] = ["ARENA_RENOVATION", "ARENA_NEW_BUILD"];
export const BUSINESS_EXPANSION_PROJECT_KINDS: CapitalProjectKind[] = [
  "GLEAGUE_AFFILIATE",
  "INTERNATIONAL_ACADEMY",
  "PRACTICE_FACILITY",
  "REAL_ESTATE_MEDIA",
];
