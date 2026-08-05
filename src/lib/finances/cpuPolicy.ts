import type { OwnerArchetype } from "@/generated/prisma/client";

/**
 * Phase 6, "CPU Selective Depth" (2026-08-06) - the formula-driven policy
 * that gives CPU teams real capital-project and financing behavior without
 * replicating the user's interactive owner-confidence/mandate apparatus
 * (see docs/FINANCES_PILLAR_DESIGN.md Part 8.2 for why: none of that is
 * player-facing for a CPU team, so a parallel confidence system would be
 * substantial invisible machinery for effects nobody experiences directly).
 *
 * Every check here is a cheap read + a single probability roll, run once
 * per CPU team per season boundary inside the same pass that already
 * computes routine finances - not a second full-league pass (Part 8.3).
 * Pure functions only; src/lib/actions/offseason.ts is the thin DB shell
 * that calls these and persists the result.
 */

// ---------------------------------------------------------------------------
// Capital projects - CPU only ever auto-starts ARENA_RENOVATION (a direct
// purchase, no negotiation needed - the same button the user has). No CPU
// ARENA_NEW_BUILD (that needs the multi-round Negotiation engine, which
// stays Tier-1-expensive if run for 30 teams) and no CPU business-expansion
// projects (those represent a human's strategic choice, not a league story).
// ---------------------------------------------------------------------------

const CPU_RENOVATION_ARENA_QUALITY_THRESHOLD = 55;
const CPU_RENOVATION_MIN_CASH_CUSHION_CENTS = 90 * 1_000_000 * 100; // comfortably above the 60M cost
const CPU_RENOVATION_BASE_CHANCE = 0.15;

// A Win-Now Billionaire renovates readily; a Penny-Pincher rarely bothers
// even with the cash sitting there - same "identity, not a flat boost"
// principle the Front Office Departments already use.
const RENOVATION_CHANCE_MULTIPLIER: Record<OwnerArchetype, number> = {
  WIN_NOW_BILLIONAIRE: 2,
  PENNY_PINCHER: 0.4,
  PATIENT_BUILDER: 1,
  ABSENTEE: 0.7,
  MEDDLER: 1.3,
};

export interface CpuArenaRenovationInputs {
  arenaQualityIndex: number;
  cashReserveCents: number;
  ownerArchetype: OwnerArchetype;
  hasProjectInProgress: boolean;
}

/** Whether a CPU team auto-starts an ARENA_RENOVATION this season boundary. */
export function shouldCpuRenovateArena(
  inputs: CpuArenaRenovationInputs,
  rng: () => number = Math.random,
): boolean {
  if (inputs.hasProjectInProgress) return false;
  if (inputs.arenaQualityIndex >= CPU_RENOVATION_ARENA_QUALITY_THRESHOLD) return false;
  if (inputs.cashReserveCents < CPU_RENOVATION_MIN_CASH_CUSHION_CENTS) return false;
  const chance = CPU_RENOVATION_BASE_CHANCE * RENOVATION_CHANCE_MULTIPLIER[inputs.ownerArchetype];
  return rng() < chance;
}

// ---------------------------------------------------------------------------
// Financing - CPU only ever takes a SMALL loan when deeply in the red,
// rather than running the deficit indefinitely. No capital calls or
// distressed financing for CPU (both are priced in owner confidence, which
// CPU doesn't have).
// ---------------------------------------------------------------------------

const CPU_LOAN_CASH_THRESHOLD_CENTS = -15 * 1_000_000 * 100;
const CPU_LOAN_BASE_CHANCE = 0.5;

// A Penny-Pincher resists debt hardest; a Win-Now Billionaire takes it on
// more readily to keep spending. Deliberately not the same table as
// renovation - debt aversion and investment appetite aren't the same trait.
const LOAN_CHANCE_MULTIPLIER: Record<OwnerArchetype, number> = {
  WIN_NOW_BILLIONAIRE: 1.4,
  PENNY_PINCHER: 0.3,
  PATIENT_BUILDER: 0.9,
  ABSENTEE: 1,
  MEDDLER: 1.1,
};

export interface CpuLoanInputs {
  cashReserveCents: number;
  ownerArchetype: OwnerArchetype;
}

/** Whether a CPU team takes out a SMALL loan this season boundary. */
export function shouldCpuTakeLoan(inputs: CpuLoanInputs, rng: () => number = Math.random): boolean {
  if (inputs.cashReserveCents >= CPU_LOAN_CASH_THRESHOLD_CENTS) return false;
  const chance = CPU_LOAN_BASE_CHANCE * LOAN_CHANCE_MULTIPLIER[inputs.ownerArchetype];
  return rng() < chance;
}

// ---------------------------------------------------------------------------
// Relocation - a simplified eligibility check reusing the same *shape* as
// isRelocationEligible (arena.ts), substituting CPU-available signals for
// the two gates that depend on the user's interactive owner-confidence
// system, which CPU doesn't have (Part 8.2):
//   - "failed arena negotiations" -> arena quality stuck at the aging floor
//     for several seasons (CPU never negotiates, so it never accumulates
//     failures - a long-neglected arena is the CPU-visible equivalent).
//   - "owner confidence at breaking point" -> a longer sustained-distress
//     requirement than the user's gate, so the CPU bar is at least as hard
//     to clear, never easier.
// Resolved as a single weighted outcome (no round-by-round negotiation -
// there's no one for a CPU team to negotiate with), not the multi-round
// Negotiation engine.
// ---------------------------------------------------------------------------

const CPU_RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS = 5;
// Below the neutral start of 65, reachable within a realistic distress
// window: decay is -1/season, so this takes ~15-20 seasons of an unrenovated
// arena to reach - overlapping the same multi-season stretch the
// sustained-distress gate above already requires, rather than a separate,
// much longer clock. ARENA_MIN_QUALITY_FROM_DECAY in arena.ts (the true
// aging floor, 20) was tried first and found unreachable inside any
// realistic save via the balance harness (Part 8.5) - decades of neglect
// needed even with zero renovations, so a genuinely bankrupt CPU team could
// never relocate. Tuned here instead of there, since 20 is correct as the
// aging floor itself; this is relocation's own, higher bar.
const CPU_RELOCATION_STUCK_ARENA_QUALITY = 48;

export interface CpuRelocationEligibilityInputs {
  /** Most recent season first; needs at least CPU_RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS entries to ever qualify. */
  recentNetIncomesCents: number[];
  currentCashCents: number;
  arenaQualityIndex: number;
  leaseExpiresSeason: number;
  currentSeason: number;
}

export function isCpuRelocationEligible(inputs: CpuRelocationEligibilityInputs): boolean {
  const sustainedDistress =
    inputs.recentNetIncomesCents.length >= CPU_RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS &&
    inputs.recentNetIncomesCents
      .slice(0, CPU_RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS)
      .every((net) => net < 0) &&
    inputs.currentCashCents < 0;
  const arenaNeglected = inputs.arenaQualityIndex <= CPU_RELOCATION_STUCK_ARENA_QUALITY;
  const leaseExpired = inputs.leaseExpiresSeason <= inputs.currentSeason;

  return sustainedDistress && arenaNeglected && leaseExpired;
}

// A CPU relocation, once eligible, still isn't guaranteed every single
// season it stays eligible - keeps it from firing the very instant every
// gate first clears, same "not a light switch" feel the user's own gate has
// (the user's gate is naturally probabilistic because it depends on the
// user's own choices; CPU needs an explicit roll to get the same texture).
const CPU_RELOCATION_CHANCE_PER_SEASON = 0.35;

export function shouldCpuRelocate(rng: () => number = Math.random): boolean {
  return rng() < CPU_RELOCATION_CHANCE_PER_SEASON;
}

/** Deterministic destination pick from RELOCATION_DESTINATIONS - separate from the eligibility/chance rolls so a re-run with the same seed always relocates the same team to the same city. */
export function pickCpuRelocationDestinationIndex(
  destinationCount: number,
  rng: () => number = Math.random,
): number {
  return Math.floor(rng() * destinationCount);
}
