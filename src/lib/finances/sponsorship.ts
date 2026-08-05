import type { MarketSize } from "@/generated/prisma/client";
import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";

/**
 * Finances as a Gameplay Pillar (Phase 2), System 1 "Sponsorship &
 * Commercial Deals" - pure helpers around `SponsorshipDeal`. The deals
 * themselves are only ever generated/signed for the user's team (via
 * `businessDecisions.ts`'s sponsorship cards); this module covers the two
 * things that stay pure math: (1) the CPU teams' formula-computed
 * sponsorship baseline (Tier 2 abstraction - CPU never "shops" for a deal,
 * see docs/FINANCES_PILLAR_DESIGN.md), and (2) the buyout penalty for
 * voiding a user deal's "star clause" mid-trade.
 */

const DOLLARS = 100;
const M = 1_000_000 * DOLLARS;

/** Full-value CPU sponsorship baseline by market - deliberately below what a user can negotiate for the same market/star tier, since CPU teams never shop for the best offer the way the user does. */
const CPU_SPONSORSHIP_BASELINE: Record<MarketSize, number> = {
  LARGE: 10 * M,
  MID: 6 * M,
  SMALL: 3.5 * M,
};

const CPU_SPONSORSHIP_STAR_BONUS: Record<PlayerValueTier, number> = {
  SUPERSTAR: 0.5,
  STAR: 0.25,
  STARTER: 0,
  ROTATION: 0,
  MINIMUM: 0,
};

/** A CPU team's sponsorship revenue for the season - a flat, formula-computed baseline, never a signed SponsorshipDeal. */
export function computeCpuSponsorshipRevenueCents(
  marketSize: MarketSize,
  starTier: PlayerValueTier | null,
): number {
  const base = CPU_SPONSORSHIP_BASELINE[marketSize];
  const starBonus = starTier ? CPU_SPONSORSHIP_STAR_BONUS[starTier] : 0;
  return Math.round(base * (1 + starBonus));
}

/**
 * The cost of a "star clause" deal voiding mid-trade: proportional to how
 * much guaranteed future value the team is walking away from (remaining
 * seasons x annual value), with a floor and a cap so a 1-year deal isn't
 * free to break and a 5-year megadeal isn't catastrophically punitive.
 */
const VOID_PENALTY_FRACTION = 0.4;
const VOID_PENALTY_FLOOR_CENTS = 2 * M;
const VOID_PENALTY_CAP_CENTS = 25 * M;

export function computeSponsorshipVoidPenaltyCents(
  annualValueCents: number,
  remainingSeasons: number,
): number {
  const remainingValue = annualValueCents * Math.max(1, remainingSeasons);
  const raw = remainingValue * VOID_PENALTY_FRACTION;
  return Math.round(Math.min(VOID_PENALTY_CAP_CENTS, Math.max(VOID_PENALTY_FLOOR_CENTS, raw)));
}
