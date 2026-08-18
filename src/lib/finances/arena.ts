import type { FinancialStanding } from "@/lib/finances/ownershipFinance";
import type { MarketSize, NegotiationKind, OwnerArchetype } from "@/generated/prisma/client";

/**
 * Finances as a Gameplay Pillar, System 2 - "The Arena," plus the
 * relocation last resort. Two things live here:
 *
 * 1. Arena quality/age/attendance math - small, bounded, neutral-anchored,
 *    same shape as every other quality lever in this codebase.
 * 2. The Negotiation round-content engine - a bounded (2-4 round), stateful
 *    decision sequence delivered entirely through the existing
 *    BusinessDecision/Front Office Inbox pipeline (see
 *    src/lib/actions/businessDecisions.ts's negotiation-round handling).
 *    Genuinely reused for two flows: ARENA_FUNDING (negotiating a new
 *    arena build with the city - can fail, tracked toward relocation
 *    eligibility) and RELOCATION_DECISION (the near-unreachable last
 *    resort itself, once every gate is met). Each round's options are a
 *    real choice with a real, visible effect on the outcome - never a
 *    single dice roll standing in for "negotiate."
 */

// ---------------------------------------------------------------------------
// Arena quality/age
// ---------------------------------------------------------------------------

const DOLLARS = 100;
const M = 1_000_000 * DOLLARS;

const ARENA_QUALITY_NEUTRAL = 65;
const ARENA_ATTENDANCE_BONUS_SCALE = 0.0015; // +/-100 quality delta -> +/-0.15 attendance, capped below
const ARENA_ATTENDANCE_BONUS_CAP = 0.08;

/** A small, bounded attendance-fraction bonus (or drag) from arena quality - added on top of computeAttendancePct's own market/happiness model, never replacing it. */
export function computeArenaAttendanceBonus(arenaQualityIndex: number): number {
  const raw = (arenaQualityIndex - ARENA_QUALITY_NEUTRAL) * ARENA_ATTENDANCE_BONUS_SCALE;
  return Math.max(-ARENA_ATTENDANCE_BONUS_CAP, Math.min(ARENA_ATTENDANCE_BONUS_CAP, raw));
}

const ARENA_ANNUAL_DECAY = 1;
const ARENA_MIN_QUALITY_FROM_DECAY = 20;

/** Applied once per season boundary when no capital project completed this season for this team - buildings age. */
export function computeArenaAgingDelta(currentQuality: number): number {
  if (currentQuality <= ARENA_MIN_QUALITY_FROM_DECAY) return 0;
  return -ARENA_ANNUAL_DECAY;
}

export function applyArenaQualityDelta(current: number, delta: number): number {
  return Math.max(0, Math.min(100, current + delta));
}

// ---------------------------------------------------------------------------
// Relocation eligibility - the deliberately near-unreachable last resort.
// Every gate must hold simultaneously; this is checked once per season
// boundary in advanceSeasonAction, never something the user can trigger.
// ---------------------------------------------------------------------------

const RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS = 3;
const RELOCATION_MIN_FAILED_NEGOTIATIONS = 2;
/** Same CRITICAL job-security band jobSecurity.ts already defines - ownership pressure has to be at its worst, not just "under pressure." */
const RELOCATION_MAX_OWNER_CONFIDENCE = 15;

export interface RelocationEligibilityInputs {
  /** Most recent season first; needs at least RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS entries to ever qualify. */
  recentNetIncomesCents: number[];
  currentCashCents: number;
  failedArenaNegotiations: number;
  leaseExpiresSeason: number;
  currentSeason: number;
  ownerConfidence: number;
}

export function isRelocationEligible(inputs: RelocationEligibilityInputs): boolean {
  const sustainedDistress =
    inputs.recentNetIncomesCents.length >= RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS &&
    inputs.recentNetIncomesCents
      .slice(0, RELOCATION_MIN_CONSECUTIVE_LOSING_SEASONS)
      .every((net) => net < 0) &&
    inputs.currentCashCents < 0;
  const negotiationsExhausted =
    inputs.failedArenaNegotiations >= RELOCATION_MIN_FAILED_NEGOTIATIONS;
  const leaseExpired = inputs.leaseExpiresSeason <= inputs.currentSeason;
  const ownershipAtBreakingPoint = inputs.ownerConfidence <= RELOCATION_MAX_OWNER_CONFIDENCE;

  return sustainedDistress && negotiationsExhausted && leaseExpired && ownershipAtBreakingPoint;
}

// ---------------------------------------------------------------------------
// Negotiation engine - shared round-content shape for both flows.
// ---------------------------------------------------------------------------

export interface NegotiationRoundOption {
  id: string;
  label: string;
  description: string;
  cashDeltaCents: number;
  fanHappinessDelta: number;
  ownerConfidenceDelta: number;
  /** ARENA_FUNDING only - how this choice moves the city's willingness to cooperate (0-100 running score). */
  cityWillingnessDelta?: number;
  /** Ends the negotiation immediately with this status instead of advancing to the next round - "walk away," "back out." */
  endsNegotiation?: "SUCCEEDED" | "FAILED";
  /** Shallow-merged into Negotiation.outcome - e.g. a chosen relocation destination or a scope compromise flag. */
  outcomePatch?: Record<string, unknown>;
}

export interface NegotiationRoundContent {
  headline: string;
  body: string;
  options: NegotiationRoundOption[];
  defaultOptionId: string;
  deadlineDays: number;
}

const NEGOTIATION_ROUND_DEADLINE_DAYS = 10;

export const ARENA_FUNDING_TOTAL_ROUNDS = 3;
export const RELOCATION_DECISION_TOTAL_ROUNDS = 3;

function describeCityWillingness(value: number): string {
  if (value >= 70) return "Enthusiastic";
  if (value >= 50) return "Receptive";
  if (value >= 30) return "Cautious";
  return "Cold";
}

export const ARENA_FUNDING_SUCCESS_THRESHOLD = 60;
const ARENA_FUNDING_MAX_DISCOUNT_FRACTION = 0.35;

/** Derives the new-build cost discount from the negotiation's final willingness margin above the success threshold - a stronger close buys a real discount, not just a pass/fail. */
export function computeArenaFundingDiscount(finalCityWillingness: number): number {
  if (finalCityWillingness < ARENA_FUNDING_SUCCESS_THRESHOLD) return 0;
  const margin = finalCityWillingness - ARENA_FUNDING_SUCCESS_THRESHOLD;
  return Math.min(ARENA_FUNDING_MAX_DISCOUNT_FRACTION, margin / 100);
}

export interface StartingWillingnessInputs {
  financialStanding: FinancialStanding;
  marketSize: MarketSize;
  ownerArchetype: OwnerArchetype;
  failedArenaNegotiations: number;
}

const STANDING_WILLINGNESS_DELTA: Record<FinancialStanding, number> = {
  STRONG: 12,
  SOLID: 6,
  STABLE: 0,
  STRAINED: -8,
  DISTRESSED: -18,
};
const MARKET_SIZE_WILLINGNESS_DELTA: Record<MarketSize, number> = {
  LARGE: 8,
  MID: 0,
  SMALL: -5,
};
const ARCHETYPE_WILLINGNESS_DELTA: Record<OwnerArchetype, number> = {
  WIN_NOW_BILLIONAIRE: 6,
  PENNY_PINCHER: 0,
  PATIENT_BUILDER: 0,
  ABSENTEE: -6,
  MEDDLER: 2,
};
const FAILED_NEGOTIATION_WILLINGNESS_PENALTY = 6;

/** A believable "how receptive is the city today" starting point before any of the user's own round choices move it - the city remembers past failed talks. */
export function computeStartingCityWillingness(inputs: StartingWillingnessInputs): number {
  const raw =
    50 +
    STANDING_WILLINGNESS_DELTA[inputs.financialStanding] +
    MARKET_SIZE_WILLINGNESS_DELTA[inputs.marketSize] +
    ARCHETYPE_WILLINGNESS_DELTA[inputs.ownerArchetype] -
    inputs.failedArenaNegotiations * FAILED_NEGOTIATION_WILLINGNESS_PENALTY;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ---------------------------------------------------------------------------
// ARENA_FUNDING round content
// ---------------------------------------------------------------------------

function buildArenaFundingRound(round: number, cityWillingness: number): NegotiationRoundContent {
  const willingnessLabel = describeCityWillingness(cityWillingness);

  if (round === 1) {
    return {
      headline: "Opening the negotiation",
      body: `You're sitting down with the city to fund a new arena. How do you open?`,
      options: [
        {
          id: "aggressive",
          label: "Come in strong - demand major public funding",
          description: "A bold ask. The city pushes back hard on the opening move.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
          cityWillingnessDelta: -10,
        },
        {
          id: "reasonable",
          label: "Open reasonably, ask for modest support",
          description: "A measured opening the city can work with.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
          cityWillingnessDelta: 8,
        },
        {
          id: "commit-private",
          label: "Lead by committing significant private money",
          description: "A real signal of good faith - costs cash now, buys real trust.",
          cashDeltaCents: -8 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
          cityWillingnessDelta: 15,
        },
      ],
      defaultOptionId: "reasonable",
      deadlineDays: NEGOTIATION_ROUND_DEADLINE_DAYS,
    };
  }

  if (round === 2) {
    return {
      headline: "The city responds",
      body: `The city's willingness to cooperate: ${cityWillingness}/100 (${willingnessLabel}). How do you proceed?`,
      options: [
        {
          id: "hold-firm",
          label: "Push for more, hold firm",
          description: "Keep pressing your original terms - a real risk of souring the room.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
          cityWillingnessDelta: -8,
        },
        {
          id: "compromise-scope",
          label: "Offer a compromise on the project's scope",
          description:
            "A smaller building than you wanted, but the city appreciates the flexibility.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
          cityWillingnessDelta: 10,
          outcomePatch: { scopeCompromised: true },
        },
        {
          id: "community-support",
          label: "Rally local business and community support",
          description: "A real PR push - costs money, builds real momentum.",
          cashDeltaCents: -2 * M,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
          cityWillingnessDelta: 12,
        },
      ],
      defaultOptionId: "hold-firm",
      deadlineDays: NEGOTIATION_ROUND_DEADLINE_DAYS,
    };
  }

  return {
    headline: "Closing the deal",
    body: `The city's willingness to cooperate: ${cityWillingness}/100 (${willingnessLabel}). This is your last chance to close it.`,
    options: [
      {
        id: "final-offer",
        label: "Make your final offer",
        description:
          "Close on the terms as they stand - straightforward, and the city appreciates not being played.",
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 0,
        cityWillingnessDelta: 3,
      },
      {
        id: "threaten-relocation",
        label: "Threaten to explore relocation as leverage",
        description:
          "A real gamble - it can push a hesitant city over the edge, but the threat becomes public either way.",
        cashDeltaCents: 0,
        fanHappinessDelta: -3,
        ownerConfidenceDelta: -2,
        cityWillingnessDelta: 20,
      },
      {
        id: "walk-away",
        label: "Walk away from the table",
        description: "Cut your losses now rather than risk a worse public failure.",
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 0,
        endsNegotiation: "FAILED",
      },
    ],
    defaultOptionId: "final-offer",
    deadlineDays: NEGOTIATION_ROUND_DEADLINE_DAYS,
  };
}

// ---------------------------------------------------------------------------
// RELOCATION_DECISION round content
// ---------------------------------------------------------------------------

export interface RelocationDestination {
  cityName: string;
  marketSize: MarketSize;
  description: string;
}

export const RELOCATION_DESTINATIONS: RelocationDestination[] = [
  {
    cityName: "Seattle",
    marketSize: "MID",
    description:
      "A hungry, mid-size market with deep NBA history and a fanbase that's waited years for this.",
  },
  {
    cityName: "Las Vegas",
    marketSize: "MID",
    description:
      "Flashy, unproven as an NBA market, but growing fast and hungry for a marquee tenant.",
  },
  {
    cityName: "Louisville",
    marketSize: "SMALL",
    description: "A smaller market, but basketball-mad - a passionate, loyal built-in audience.",
  },
];

function buildRelocationDecisionRound(round: number): NegotiationRoundContent {
  if (round === 1) {
    return {
      headline: "The board wants a decision",
      body: "Every path to staying has been exhausted. Ownership wants to know: are you really doing this?",
      options: [
        {
          id: "commit",
          label: "Commit to exploring relocation",
          description: "Move forward - the next steps decide where you go and how it's handled.",
          cashDeltaCents: 0,
          fanHappinessDelta: 0,
          ownerConfidenceDelta: 0,
        },
        {
          id: "refuse",
          label: "Refuse - fight to keep the team here",
          description:
            "Whatever it takes, this franchise stays put. Ownership respects the conviction.",
          cashDeltaCents: 0,
          fanHappinessDelta: 2,
          ownerConfidenceDelta: 1,
          endsNegotiation: "FAILED",
        },
      ],
      defaultOptionId: "refuse",
      deadlineDays: NEGOTIATION_ROUND_DEADLINE_DAYS,
    };
  }

  if (round === 2) {
    return {
      headline: "Choose your new home",
      body: "Three markets have expressed real interest. Where do you go?",
      options: RELOCATION_DESTINATIONS.map((dest) => ({
        id: dest.cityName.toLowerCase().replace(/\s+/g, "-"),
        label: dest.cityName,
        description: dest.description,
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 0,
        outcomePatch: { cityName: dest.cityName, marketSize: dest.marketSize },
      })),
      defaultOptionId: RELOCATION_DESTINATIONS[0].cityName.toLowerCase().replace(/\s+/g, "-"),
      deadlineDays: NEGOTIATION_ROUND_DEADLINE_DAYS,
    };
  }

  return {
    headline: "How do you handle the fans you're leaving behind?",
    body: "The current market deserves an answer. How do you break the news?",
    options: [
      {
        id: "compensate",
        label: "Offer season-ticket holders real compensation",
        description: "Costs real money, but softens the blow for the fans who stuck with you.",
        cashDeltaCents: -15 * M,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 0,
        outcomePatch: { fanHappinessSeverity: "SOFT" },
      },
      {
        id: "announce-and-move",
        label: "Just announce it and move on",
        description: "Free, and fast - but the fanbase you're leaving won't forget it.",
        cashDeltaCents: 0,
        fanHappinessDelta: 0,
        ownerConfidenceDelta: 0,
        outcomePatch: { fanHappinessSeverity: "SEVERE" },
      },
    ],
    defaultOptionId: "announce-and-move",
    deadlineDays: NEGOTIATION_ROUND_DEADLINE_DAYS,
  };
}

export function buildNegotiationRound(
  kind: NegotiationKind,
  round: number,
  cityWillingness: number,
): NegotiationRoundContent {
  return kind === "ARENA_FUNDING"
    ? buildArenaFundingRound(round, cityWillingness)
    : buildRelocationDecisionRound(round);
}

// ---------------------------------------------------------------------------
// Relocation consequences - franchise-defining and permanent. Renovation
// and new construction must remain the strictly better play in essentially
// every reachable state; this is what makes the alternative (staying and
// paying for a new building) obviously preferable whenever it's available.
// ---------------------------------------------------------------------------

export type FanHappinessSeverity = "SOFT" | "SEVERE";

const RELOCATION_FAN_HAPPINESS_HIT: Record<FanHappinessSeverity, number> = {
  SOFT: -35,
  SEVERE: -55,
};

export function computeRelocationFanHappinessHit(severity: FanHappinessSeverity): number {
  return RELOCATION_FAN_HAPPINESS_HIT[severity];
}

const RELOCATION_FRANCHISE_VALUE_MULTIPLIER = 1.4; // a new, hungry market pays a premium to land a franchise

export function computeRelocationFranchiseValueMultiplier(): number {
  return RELOCATION_FRANCHISE_VALUE_MULTIPLIER;
}
