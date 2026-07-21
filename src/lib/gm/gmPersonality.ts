/**
 * A persistent per-team front-office philosophy (Phase 11c), assigned once
 * at league bootstrap and stable for the life of a save - real GMs don't
 * flip their approach year to year. Makes two teams react differently to
 * an *identical* proposed trade.
 */
export type GmPersonality =
  | "AGGRESSIVE"
  | "CONSERVATIVE"
  | "WIN_NOW"
  | "PROSPECT_LOVER"
  | "PICK_HOARDER"
  | "SALARY_CONSCIOUS"
  | "BALANCED";

export const GM_PERSONALITY_LABEL: Record<GmPersonality, string> = {
  AGGRESSIVE: "Aggressive",
  CONSERVATIVE: "Conservative",
  WIN_NOW: "Win-Now",
  PROSPECT_LOVER: "Prospect Lover",
  PICK_HOARDER: "Pick Hoarder",
  SALARY_CONSCIOUS: "Salary-Conscious",
  BALANCED: "Balanced",
};

export const GM_PERSONALITY_DESCRIPTION: Record<GmPersonality, string> = {
  AGGRESSIVE: "Willing to make bold moves and take on risk to upgrade the roster.",
  CONSERVATIVE: "Cautious - only makes a move when the deal is clearly in its favor.",
  WIN_NOW: "Prioritizes proven, immediate production over youth and future assets.",
  PROSPECT_LOVER: "Places a premium on young players' upside over proven production.",
  PICK_HOARDER: "Values draft capital highly and is reluctant to trade picks away.",
  SALARY_CONSCIOUS: "Very sensitive to taking on bad money, even for a good player.",
  BALANCED: "No strong bias either way - evaluates trades close to their objective value.",
};

/**
 * How much this personality reweights specific factors, all as bounded
 * multipliers (0.7-1.3) - personality nudges *how much* a team leans
 * toward certain kinds of value, it never overrides whether a trade is
 * objectively fair. A genuinely lopsided trade fails for every
 * personality; these multipliers only matter on trades already close to
 * fair. See `evaluateTradeOffer.ts` for where these are applied and the
 * test that verifies no personality can be talked into a robbery.
 */
export interface GmPersonalityWeights {
  /** Applied to incoming picks' value, and to how much giving up an outgoing pick "costs" psychologically. */
  pickValueMultiplier: number;
  /** Applied to incoming young (<=25) players' value. */
  youthValueMultiplier: number;
  /** Applied to incoming proven veteran (30+) players' value. */
  veteranValueMultiplier: number;
  /** Applied to how much a bad incoming contract (an overpay) subtracts from value. */
  badContractSensitivityMultiplier: number;
  /** Shifts the overall acceptance bar - below 1.0 accepts a slightly worse-than-fair deal; above 1.0 demands better than fair. */
  acceptanceThresholdMultiplier: number;
}

export const GM_PERSONALITY_WEIGHTS: Record<GmPersonality, GmPersonalityWeights> = {
  BALANCED: {
    pickValueMultiplier: 1.0,
    youthValueMultiplier: 1.0,
    veteranValueMultiplier: 1.0,
    badContractSensitivityMultiplier: 1.0,
    acceptanceThresholdMultiplier: 1.0,
  },
  AGGRESSIVE: {
    pickValueMultiplier: 0.95,
    youthValueMultiplier: 1.05,
    veteranValueMultiplier: 1.05,
    badContractSensitivityMultiplier: 0.85,
    acceptanceThresholdMultiplier: 0.9,
  },
  CONSERVATIVE: {
    pickValueMultiplier: 1.1,
    youthValueMultiplier: 0.95,
    veteranValueMultiplier: 0.95,
    badContractSensitivityMultiplier: 1.15,
    acceptanceThresholdMultiplier: 1.15,
  },
  WIN_NOW: {
    pickValueMultiplier: 0.75,
    youthValueMultiplier: 0.75,
    veteranValueMultiplier: 1.3,
    badContractSensitivityMultiplier: 0.9,
    acceptanceThresholdMultiplier: 0.95,
  },
  PROSPECT_LOVER: {
    pickValueMultiplier: 1.15,
    youthValueMultiplier: 1.3,
    veteranValueMultiplier: 0.8,
    badContractSensitivityMultiplier: 1.0,
    acceptanceThresholdMultiplier: 1.0,
  },
  PICK_HOARDER: {
    pickValueMultiplier: 1.3,
    youthValueMultiplier: 1.0,
    veteranValueMultiplier: 1.0,
    badContractSensitivityMultiplier: 1.0,
    acceptanceThresholdMultiplier: 1.0,
  },
  SALARY_CONSCIOUS: {
    pickValueMultiplier: 1.0,
    youthValueMultiplier: 1.0,
    veteranValueMultiplier: 1.0,
    badContractSensitivityMultiplier: 1.3,
    acceptanceThresholdMultiplier: 1.05,
  },
};

export const ALL_GM_PERSONALITIES: GmPersonality[] = [
  "AGGRESSIVE",
  "CONSERVATIVE",
  "WIN_NOW",
  "PROSPECT_LOVER",
  "PICK_HOARDER",
  "SALARY_CONSCIOUS",
  "BALANCED",
];

/** Every team gets some personality, uniformly at random - "Balanced" isn't a fallback, it's as valid a philosophy as any other. */
export function pickRandomGmPersonality(rng: () => number = Math.random): GmPersonality {
  return ALL_GM_PERSONALITIES[Math.floor(rng() * ALL_GM_PERSONALITIES.length)];
}
