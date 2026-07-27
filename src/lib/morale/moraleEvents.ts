import type { PlayerPersonalityAxes } from "@/lib/morale/generatePersonality";
import { applyMoraleDelta } from "@/lib/morale/moraleLevel";
import type { RotationRole } from "@/lib/rotation/roleLabel";
import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";
import type { TeamIdentity } from "@/lib/gm/teamIdentity";

/**
 * Per-event morale deltas (Player Morale & Personality System) - same
 * shape as src/lib/fans/sentimentEvents.ts: pure functions, applied inline
 * at the real call site where a curated event actually happens, each
 * bounded and personality-weighted rather than a flat per-event bonus.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Every axis is stored 0-100; this converts it into a 0.5x-1.5x weight
// around the midpoint so a maxed-out axis reacts at 1.5x baseline and a
// bottomed-out one at 0.5x - never zero, since even a low-roleSensitivity
// player still notices being benched, just less.
function axisWeight(axisValue: number): number {
  return 0.5 + axisValue / 100;
}

/** A delta below this magnitude doesn't warrant its own news story - mirrors NOTABLE_DRAFT_MOVEMENT_THRESHOLD's "don't narrate noise" precedent. */
export const MORALE_NEWS_THRESHOLD = 5;

const ROLE_RANK: Record<RotationRole, number> = {
  STARTER: 3,
  SIXTH_MAN: 2,
  ROTATION_PLAYER: 1,
  BENCH_PLAYER: 0,
};

const ROLE_CHANGE_CAP = 12;
const VALUE_TIER_ROLE_STAKES: Record<PlayerValueTier, number> = {
  SUPERSTAR: 1.4,
  STAR: 1.3,
  STARTER: 1.1,
  ROTATION: 0.9,
  MINIMUM: 0.7,
};

export interface RoleChangeMoraleInput {
  personality: PlayerPersonalityAxes;
  previousRole: RotationRole | null;
  newRole: RotationRole | null;
  valueTier: PlayerValueTier;
  age: number;
}

/**
 * Demotion stings more for a role-sensitive, established/valuable, older
 * player; a young player accepting a smaller role for development reads
 * close to neutral. Call site: src/lib/actions/rotation.ts, the exact
 * starter/bench boundary crossing where computeRotationChangeSentimentDelta
 * (the fan-happiness counterpart) already fires.
 */
export function computeRoleChangeMoraleDelta(input: RoleChangeMoraleInput): number {
  const prevRank = input.previousRole ? ROLE_RANK[input.previousRole] : ROLE_RANK.BENCH_PLAYER;
  const newRank = input.newRole ? ROLE_RANK[input.newRole] : ROLE_RANK.BENCH_PLAYER;
  const rankDelta = newRank - prevRank; // negative = demotion
  if (rankDelta === 0) return 0;

  const baseDelta = rankDelta * 4; // one rank step = 4 raw morale
  const sensitivity = axisWeight(input.personality.roleSensitivity);
  const stakes = VALUE_TIER_ROLE_STAKES[input.valueTier];
  // A young player (<=24) tolerates a demotion much better - it reads as
  // "still earning his role," not "being cast aside."
  const ageMultiplier = input.age <= 24 && rankDelta < 0 ? 0.5 : 1;

  return Math.round(
    clamp(baseDelta * sensitivity * stakes * ageMultiplier, -ROLE_CHANGE_CAP, ROLE_CHANGE_CAP),
  );
}

const MINUTES_SHORTFALL_CAP = 8;
// A gap this small is normal game-to-game noise (foul trouble, blowouts),
// not a broken promise.
const MINUTES_SHORTFALL_NOISE_FLOOR = 2;

export interface MinutesShortfallMoraleInput {
  personality: PlayerPersonalityAxes;
  targetMinutesPerGame: number;
  /** Averaged over several recent games by the caller - never a single game. */
  recentActualMinutesPerGame: number;
}

/** "Promised N, actually getting M" - only meaningful when a real target was set via Rotation Management. */
export function computeMinutesShortfallMoraleDelta(input: MinutesShortfallMoraleInput): number {
  const shortfall = input.targetMinutesPerGame - input.recentActualMinutesPerGame;
  if (shortfall <= MINUTES_SHORTFALL_NOISE_FLOOR) return 0;
  const sensitivity = axisWeight(input.personality.roleSensitivity);
  return Math.round(clamp(-shortfall * 0.6 * sensitivity, -MINUTES_SHORTFALL_CAP, 0));
}

const TEAM_PERFORMANCE_CAP = 5;

export interface TeamPerformanceMoraleInput {
  personality: PlayerPersonalityAxes;
  /** computeCompetitivenessPercentiles' own 0-1 rank - reused directly, not a new "is this team good" signal. */
  competitivenessPercentile: number;
  /** LeagueTeam.currentStreak - positive a win streak, negative a losing streak. */
  currentStreak: number;
}

/** Competitiveness-weighted reaction to the team's actual win/loss trend - reuses existing signals, no new live expectation-vs-actual diff. */
export function computeTeamPerformanceMoraleDelta(input: TeamPerformanceMoraleInput): number {
  const percentileDelta = (input.competitivenessPercentile - 0.5) * 6;
  const streakDelta = clamp(input.currentStreak * 0.5, -3, 3);
  const weight = axisWeight(input.personality.competitiveness);
  return Math.round(
    clamp((percentileDelta + streakDelta) * weight, -TEAM_PERFORMANCE_CAP, TEAM_PERFORMANCE_CAP),
  );
}

const CONTRACT_SITUATION_CAP = 6;
// Paid below 70% of estimated market value starts to sting a financially-
// motivated player - above that reads as "fair enough."
const UNDERPAYMENT_THRESHOLD = 0.7;

export interface ContractSituationMoraleInput {
  personality: PlayerPersonalityAxes;
  currentSeasonSalaryCents: bigint;
  /** Rating-based estimate (e.g. computeReSigningMaxOfferCents) - works for generated players, not just real-stat-backed ones. */
  marketValueCents: bigint;
  /** Years left on the current deal, including this one. */
  seasonsRemaining: number;
}

/** Financially-motivated players react to being paid well below their own market rate, more so heading into an unprotected final year. */
export function computeContractSituationMoraleDelta(input: ContractSituationMoraleInput): number {
  if (input.marketValueCents <= 0n) return 0;
  const ratio = Number(input.currentSeasonSalaryCents) / Number(input.marketValueCents);
  const weight = axisWeight(input.personality.financialMotivation);
  let delta = 0;
  if (ratio < UNDERPAYMENT_THRESHOLD) {
    delta -= (UNDERPAYMENT_THRESHOLD - ratio) * 12 * weight;
  }
  if (input.seasonsRemaining <= 1 && ratio < 1) {
    delta -= 2 * weight;
  }
  return Math.round(clamp(delta, -CONTRACT_SITUATION_CAP, 0));
}

const COACH_FIT_CAP = 3;
// Matches DEV_COACH_QUALITY_ANCHOR (developPlayerRating.ts) - 72 is this
// codebase's standard "average/neutral" staff-quality anchor.
const COACH_QUALITY_ANCHOR = 72;

export interface CoachFitMoraleInput {
  personality: PlayerPersonalityAxes;
  coachQuality: number;
}

/** A competitiveness-driven player notices a weak coaching staff - same neutral anchor developPlayerRating already uses for the same input. */
export function computeCoachFitMoraleDelta(input: CoachFitMoraleInput): number {
  const weight = axisWeight(input.personality.competitiveness);
  const delta = (input.coachQuality - COACH_QUALITY_ANCHOR) * 0.05 * weight;
  return Math.round(clamp(delta, -COACH_FIT_CAP, COACH_FIT_CAP));
}

// A trade landing on a new roster is a reset, not a continuation - most of
// the accumulated grudge from the old situation doesn't carry over, but a
// player doesn't arrive perfectly neutral either (uncertainty of a new
// city/role). 60 is a mild-below-neutral landing point before new-team fit
// is applied.
const TRANSACTION_RESET_TARGET = 60;
const TRANSACTION_FIT_CAP = 8;

export interface TransactionMoraleInput {
  personality: PlayerPersonalityAxes;
  newTeamIdentity: TeamIdentity;
  fillsNeed: boolean;
}

/**
 * Returns the *new* morale value directly (not a delta) - a fresh start
 * pulls extreme morale most of the way back toward baseline before the new
 * team's competitive fit and need-fit are layered on top. Call site: any
 * trade that lands the player on a new roster; also the moment
 * tradeRequestActive is cleared.
 */
export function computeMoraleAfterTrade(
  currentMorale: number,
  input: TransactionMoraleInput,
): number {
  const reset = Math.round((currentMorale + TRANSACTION_RESET_TARGET) / 2);
  const competitiveWeight = axisWeight(input.personality.competitiveness);
  let fitDelta = 0;
  if (input.newTeamIdentity === "CONTENDER" || input.newTeamIdentity === "PLAYOFF_TEAM") {
    fitDelta += 4 * competitiveWeight;
  } else if (input.newTeamIdentity === "TANKING") {
    fitDelta -= 4 * competitiveWeight;
  }
  if (input.fillsNeed) fitDelta += 3;
  return applyMoraleDelta(reset, clamp(fitDelta, -TRANSACTION_FIT_CAP, TRANSACTION_FIT_CAP));
}

// Season-boundary regression toward baseline for grudges that were never
// otherwise addressed - nobody stays at an extreme forever without a fresh
// cause. Loyalty determines how forgiving a player is: a high-loyalty
// player drifts back toward neutral faster, a low-loyalty one holds a
// grudge longer.
const BASELINE_MORALE = 70;
const OFFSEASON_DECAY_RATE = 0.25;

export function decayMoraleTowardBaseline(morale: number, loyalty: number): number {
  const rateMultiplier = 0.5 + loyalty / 200; // 0.5x (loyalty 0) to 1.0x (loyalty 100)
  const rate = OFFSEASON_DECAY_RATE * rateMultiplier;
  return applyMoraleDelta(morale, (BASELINE_MORALE - morale) * rate);
}
