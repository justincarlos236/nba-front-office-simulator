import { clamp } from "@/lib/math/clamp";

/** Clamps a proposed new morale value to the model's 0-100 range - same shared-invariant pattern as applyFanHappinessDelta. */
export function applyMoraleDelta(current: number, delta: number): number {
  return Math.round(clamp(current + delta, 0, 100));
}

export type MoraleLevel = "THRILLED" | "CONTENT" | "NEUTRAL" | "UNHAPPY" | "DISGRUNTLED";

export const MORALE_LEVEL_LABEL: Record<MoraleLevel, string> = {
  THRILLED: "Thrilled",
  CONTENT: "Content",
  NEUTRAL: "Neutral",
  UNHAPPY: "Unhappy",
  DISGRUNTLED: "Disgruntled",
};

export const MORALE_LEVEL_DESCRIPTION: Record<MoraleLevel, string> = {
  THRILLED: "Couldn't be happier with the current situation.",
  CONTENT: "Generally happy with his role and the team's direction.",
  NEUTRAL: "No strong feelings either way right now.",
  UNHAPPY: "Growing frustrated with how things are going.",
  DISGRUNTLED: "Seriously unhappy - this situation needs to change.",
};

/** Buckets the 0-100 morale score into the level a user actually reads - mirrors getJobSecurityLevel's bucket-with-label pattern. */
export function getMoraleLevel(morale: number): MoraleLevel {
  if (morale >= 85) return "THRILLED";
  if (morale >= 65) return "CONTENT";
  if (morale >= 45) return "NEUTRAL";
  if (morale >= 25) return "UNHAPPY";
  return "DISGRUNTLED";
}

// Deliberately no separate "how many consecutive checks has this player
// been unhappy" counter - each individual morale delta is already capped
// (see moraleEvents.ts), so actually reaching the escalation threshold
// requires a real accumulation of negative events over time, not one bad
// game. That accumulation *is* the "sustained" requirement the escalation
// is supposed to represent, without a second piece of persisted state to
// keep in sync.
const TRADE_REQUEST_BASE_THRESHOLD = 15;
const TRADE_REQUEST_CLEAR_THRESHOLD = 30;

/**
 * Loyalty raises or lowers the bar before a player actually asks out - a
 * highly loyal player tolerates a worse situation before escalating, a
 * low-loyalty player escalates sooner. Distinct from the recovery
 * threshold below (hysteresis) so a request doesn't flip on and off
 * across one good/bad week.
 */
export function shouldActivateTradeRequest(morale: number, loyalty: number): boolean {
  const effectiveThreshold = clamp(TRADE_REQUEST_BASE_THRESHOLD - (loyalty - 50) / 5, 5, 25);
  return morale <= effectiveThreshold;
}

/** A player must climb meaningfully above the escalation line - not just cross back over it - before a standing trade request is considered resolved. */
export function shouldClearTradeRequest(morale: number): boolean {
  return morale >= TRADE_REQUEST_CLEAR_THRESHOLD;
}

export interface MoraleUpdateResult {
  morale: number;
  tradeRequestActive: boolean;
  /** True only the instant a request newly activates - callers use this to fire a one-time "has requested a trade" story, not on every check while it's still active. */
  justActivated: boolean;
  /** True only the instant a standing request newly clears. */
  justCleared: boolean;
}

/**
 * Applies a delta and resolves trade-request escalation/clearing in one
 * step - every integration point (rotation, simulation, offseason) should
 * go through this rather than re-implementing the hysteresis rule, so it
 * can never drift out of sync across call sites.
 */
export function applyMoraleChange(
  current: number,
  delta: number,
  loyalty: number,
  tradeRequestActive: boolean,
): MoraleUpdateResult {
  const morale = applyMoraleDelta(current, delta);
  if (!tradeRequestActive && shouldActivateTradeRequest(morale, loyalty)) {
    return { morale, tradeRequestActive: true, justActivated: true, justCleared: false };
  }
  if (tradeRequestActive && shouldClearTradeRequest(morale)) {
    return { morale, tradeRequestActive: false, justActivated: false, justCleared: true };
  }
  return { morale, tradeRequestActive, justActivated: false, justCleared: false };
}
