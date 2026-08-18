import type { PlayerValueTier } from "@/lib/valuation/playerValueTier";
import type { InjuryStatus, StaffRole } from "@/generated/prisma/client";
import {
  scaleSentimentByPatience,
  scaleSentimentByLoyalty,
  happinessFloorForLoyalty,
} from "@/lib/fans/fanCulture";

/**
 * Mid-season Fan Happiness deltas -
 * applied inline at the exact existing call site where a curated event
 * actually happens (trade/signing execution, a real win/loss streak, an
 * injury or recovery, a staff hire/fire, a notable rotation change),
 * instead of retroactively guessed at from a bulk `LeagueTransaction` scan
 * once a season. Each function reuses an existing valuation/classification
 * signal as its magnitude input rather than a flat per-event bonus - a
 * near-fair trade of role players nets ~0, a lopsided star-for-scrubs swing
 * hits the cap. This is also the anti-exploitation mechanism: shuffling
 * low-stakes assets back and forth can't manufacture a real sentiment swing
 * because there's no real value/star-power behind it to weight on.
 *
 * `computeTransactionSentiment` (src/lib/fans/transactionSentiment.ts)
 * still exists and still runs at season end in advanceSeasonAction, but
 * narrowed to the categories that don't get one of these dedicated inline
 * hooks (RETIREMENT, GAME_MILESTONE, GAME_RESULT) - see offseason.ts.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps a proposed new Fan Happiness value to the model's 0-100 range - the one shared invariant every call site below relies on. */
export function applyFanHappinessDelta(current: number, delta: number): number {
  return Math.round(clamp(current + delta, 0, 100));
}

/**
 * the one chokepoint every sentiment call
 * site routes through so Fan Culture (src/lib/fans/fanCulture.ts) actually
 * changes gameplay rather than sitting as a cosmetic label (Part 3.1a,
 * "not just flavor"). Composes Patience (dampens negative-delta magnitude)
 * and Loyalty (dampens magnitude in both directions, and sets the floor
 * happiness can decay to) on top of the already-computed raw delta, then
 * applies the same clamp `applyFanHappinessDelta` always has.
 *
 * Returns the *scaled* delta alongside the new happiness value - callers
 * must persist the scaled delta to the sentiment ledger, never the raw one,
 * so a ledger row always explains the real number fanHappiness actually
 * moved by (never a number that disagrees with what culture did to it).
 */
export function applyScaledFanHappinessDelta(
  current: number,
  rawDelta: number,
  culture: { patience: number; loyalty: number } | null,
): { newFanHappiness: number; scaledDelta: number } {
  if (!culture) {
    const newFanHappiness = applyFanHappinessDelta(current, rawDelta);
    return { newFanHappiness, scaledDelta: newFanHappiness - current };
  }
  const patienceScaled = scaleSentimentByPatience(rawDelta, culture.patience);
  const loyaltyScaled = scaleSentimentByLoyalty(patienceScaled, culture.loyalty);
  const floor = happinessFloorForLoyalty(culture.loyalty);
  const newFanHappiness = Math.round(clamp(current + loyaltyScaled, floor, 100));
  return { newFanHappiness, scaledDelta: newFanHappiness - current };
}

const STAR_TIER_WEIGHT: Record<PlayerValueTier, number> = {
  SUPERSTAR: 8,
  STAR: 4,
  STARTER: 1,
  ROTATION: 0,
  MINIMUM: -1,
};

const TRADE_SENTIMENT_CAP = 6;

export interface TradeSentimentInput {
  /** evaluateTradeOffer's own score, computed from THIS team's own perspective - not a second opinion, the same judge the trade itself was graded by. */
  perspectiveScore: number;
  acquiredStarTier: PlayerValueTier | null;
  sentStarTier: PlayerValueTier | null;
}

/**
 * Fans react more to a trade that looks lopsided (either direction) than a
 * fair one, and more to losing/gaining real star power than depth pieces -
 * reusing evaluateTradeOffer's own fairness score and the same
 * PlayerValueTier classification fanHappiness.ts's star-power delta
 * already uses, not a second "is this a good trade" opinion.
 */
export function computeTradeSentimentDelta(input: TradeSentimentInput): number {
  const fairnessSwing = (input.perspectiveScore - 1) * 4;
  const starPowerSwing =
    STAR_TIER_WEIGHT[input.acquiredStarTier ?? "ROTATION"] -
    STAR_TIER_WEIGHT[input.sentStarTier ?? "ROTATION"];
  return Math.round(
    clamp(fairnessSwing + starPowerSwing, -TRADE_SENTIMENT_CAP, TRADE_SENTIMENT_CAP),
  );
}

const SIGNING_SENTIMENT_CAP = 5;
const RESIGNING_BONUS = 1;

export interface SigningSentimentInput {
  signedStarTier: PlayerValueTier;
  /** A successful re-signing (keeping their own guy) reads differently to fans than a fresh outside addition. */
  isReSigning: boolean;
}

export function computeSigningSentimentDelta(input: SigningSentimentInput): number {
  const base = Math.max(0, STAR_TIER_WEIGHT[input.signedStarTier]);
  const total = base + (input.isReSigning ? RESIGNING_BONUS : 0);
  return Math.round(clamp(total, 0, SIGNING_SENTIMENT_CAP));
}

const STREAK_SENTIMENT_CAP = 4;
const STREAK_IMPORTANCE_DELTA: Record<string, number> = {
  MINOR: 0,
  STANDARD: 2,
  MAJOR: 3,
  BREAKING: 4,
};

/**
 * Reuses describeWinStreak's own STANDARD/MAJOR/BREAKING importance tiers
 * (src/lib/transactions/describeGameEvents.ts) directly - no new streak-
 * length thresholds, and only ever called when describeWinStreak already
 * returned a real event, the same self-limiting gate that already exists.
 * Pass a negative sign for a losing streak.
 */
export function computeStreakSentimentDelta(importance: string, sign: 1 | -1): number {
  const magnitude = STREAK_IMPORTANCE_DELTA[importance] ?? 0;
  return Math.round(clamp(magnitude * sign, -STREAK_SENTIMENT_CAP, STREAK_SENTIMENT_CAP));
}

const INJURY_SENTIMENT_CAP = 3;
const INJURY_SEVERITY_WEIGHT: Record<InjuryStatus, number> = {
  HEALTHY: 0,
  DAY_TO_DAY: -1,
  OUT: -2,
  SEASON_ENDING: -3,
};

export interface InjurySentimentInput {
  starTier: PlayerValueTier;
  severity: InjuryStatus;
}

/** Reuses PlayerValueTier and the existing injury-severity classification already computed in rollForTeamInjury - a role player's day-to-day tweak barely registers, a star's season-ending injury hits hard. */
export function computeInjurySentimentDelta(input: InjurySentimentInput): number {
  const starMultiplier = input.starTier === "SUPERSTAR" || input.starTier === "STAR" ? 1.5 : 1;
  const total = INJURY_SEVERITY_WEIGHT[input.severity] * starMultiplier;
  return Math.round(clamp(total, -INJURY_SENTIMENT_CAP, 0));
}

export function computeInjuryRecoverySentimentDelta(starTier: PlayerValueTier): number {
  const total = starTier === "SUPERSTAR" || starTier === "STAR" ? 2 : 1;
  return Math.round(clamp(total, 0, INJURY_SENTIMENT_CAP));
}

const STAFF_SENTIMENT_CAP = 3;
// Head coaches are the only role fans really have an opinion on - the
// other roles (medical/dev/etc.) work behind the scenes.
const STAFF_ROLES_FANS_NOTICE: StaffRole[] = ["HEAD_COACH"];

export interface StaffChangeSentimentInput {
  role: StaffRole;
  quality: number;
  isHire: boolean;
}

export function computeStaffChangeSentimentDelta(input: StaffChangeSentimentInput): number {
  if (!STAFF_ROLES_FANS_NOTICE.includes(input.role)) return 0;
  const qualityDelta = Math.round((input.quality - 65) / 10);
  const total = input.isHire ? qualityDelta : -qualityDelta;
  return Math.round(clamp(total, -STAFF_SENTIMENT_CAP, STAFF_SENTIMENT_CAP));
}

const ROTATION_SENTIMENT_CAP = 2;

export interface RotationChangeSentimentInput {
  starTier: PlayerValueTier;
  promoted: boolean;
}

/** Only ever called for the same starter-boundary crossings ROTATION_CHANGE news already requires - a small, deliberately quiet nudge next to trades/signings. */
export function computeRotationChangeSentimentDelta(input: RotationChangeSentimentInput): number {
  const magnitude = input.starTier === "SUPERSTAR" || input.starTier === "STAR" ? 2 : 1;
  return Math.round(
    clamp(input.promoted ? magnitude : -magnitude, -ROTATION_SENTIMENT_CAP, ROTATION_SENTIMENT_CAP),
  );
}

// Both computed once at their own natural determination point - awards
// only at season end (advanceSeasonAction), All-Star only at the break
// (generateAllStarWeekend) - not artificially delayed or moved earlier.
const AWARD_SENTIMENT: Record<
  | "MVP"
  | "ROOKIE_OF_THE_YEAR"
  | "MOST_IMPROVED_PLAYER"
  | "DEFENSIVE_PLAYER_OF_THE_YEAR"
  | "SIXTH_MAN_OF_THE_YEAR",
  number
> = {
  MVP: 5,
  DEFENSIVE_PLAYER_OF_THE_YEAR: 3,
  ROOKIE_OF_THE_YEAR: 3,
  MOST_IMPROVED_PLAYER: 3,
  SIXTH_MAN_OF_THE_YEAR: 2,
};

export function computeAwardSentimentDelta(category: keyof typeof AWARD_SENTIMENT): number {
  return AWARD_SENTIMENT[category];
}

const ALL_STAR_SELECTION_SENTIMENT = 3;
const ALL_STAR_SNUB_SENTIMENT = -2;
const ALL_STAR_STRONG_RESULT_SENTIMENT = 2;

export function computeAllStarSelectionSentimentDelta(): number {
  return ALL_STAR_SELECTION_SENTIMENT;
}

export function computeAllStarSnubSentimentDelta(): number {
  return ALL_STAR_SNUB_SENTIMENT;
}

export function computeAllStarResultSentimentDelta(): number {
  return ALL_STAR_STRONG_RESULT_SENTIMENT;
}

const LOTTERY_SENTIMENT_CAP = 5;
const NUMBER_ONE_PICK_BONUS = 3;

/**
 * `movement` is `projectedSeed - resultPickNumber` (positive = jumped up
 * to a better pick, negative = fell) - the same real, honest signal the
 * Draft Lottery Experience's UI and news both use, not a second opinion.
 * Landing the actual #1 pick is its own extra jolt of excitement on top
 * of whatever movement got them there.
 */
export function computeLotteryResultSentimentDelta(
  movement: number,
  wonNumberOnePick: boolean,
): number {
  const total = movement + (wonNumberOnePick ? NUMBER_ONE_PICK_BONUS : 0);
  return Math.round(clamp(total, -LOTTERY_SENTIMENT_CAP, LOTTERY_SENTIMENT_CAP));
}
