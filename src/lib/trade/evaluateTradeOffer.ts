import { computePlayerTradeValueParts, CONTRACT_SURPLUS_WEIGHT } from "../gm/playerTradeValue";
import { computeDraftPickTradeValue } from "../gm/draftPickTradeValue";
import { getSeasonCapRules } from "../cap/constants";
import { GM_PERSONALITY_WEIGHTS, type GmPersonality } from "../gm/gmPersonality";
import type { TeamIdentity } from "../gm/teamIdentity";
import { type TeamNeed } from "../gm/teamNeeds";
import { getPlayerValueTier } from "../valuation/playerValueTier";

export interface TradePlayerAsset {
  type: "PLAYER";
  overallRating: number;
  potentialRating: number;
  age: number;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  currentSalaryCents: bigint;
  /** Salaries for the seasons after this one - see `PlayerTradeValueInput`. */
  futureSalaryCents?: bigint[];
  injuryStatus: "HEALTHY" | "DAY_TO_DAY" | "OUT" | "SEASON_ENDING";
  careerGamesMissedToInjury: number;
}

export interface TradePickAsset {
  type: "DRAFT_PICK";
  pickSeason: number;
  round: 1 | 2;
  overallPickNumber: number | null;
  /** The pick's original team's current competitiveness percentile - see `draftPickTradeValue.ts`. */
  originalTeamCompetitivenessPercentile: number;
}

export type TradeAssetForEvaluation = TradePlayerAsset | TradePickAsset;

export type TradeOfferDecision = "ACCEPT" | "REJECT" | "COUNTER";

/**
 * Reason *codes*, not prose - the plain-English rejection-message bank
 * that turns these into believable sentences ("We value our young core
 * too highly," etc.) is Phase 11d's job. Keeping this module's output
 * structured data, not hardcoded strings, mirrors how the rest of this
 * codebase separates objective computation from presentation (e.g.
 * `capStatusLabel.ts` wrapping `computeCapSheet`).
 */
export type TradeOfferReasonCode =
  "UNTOUCHABLE_PLAYER" | "BELOW_FAIR_VALUE" | "FILLS_A_NEED" | "FAIR_VALUE";

export interface EvaluateTradeOfferInput {
  respondingTeam: {
    identity: TeamIdentity;
    needs: TeamNeed[];
    personality: GmPersonality;
    /** This team's own full active roster's ratings/ages - used for the untouchable-player check. */
    roster: { overallRating: number; age: number }[];
  };
  currentSeason: number;
  /**
   * Calibration seam only - see scripts/trade-threshold-calibration.ts.
   * Production callers omit it and get `ACCEPT_THRESHOLD`. Exists so a sweep
   * exercises this exact function rather than a reimplementation of it.
   */
  acceptThresholdOverride?: number;
  /** Assets the responding team would receive. */
  incoming: TradeAssetForEvaluation[];
  /** Assets the responding team would send away. */
  outgoing: TradeAssetForEvaluation[];
}

export interface EvaluateTradeOfferResult {
  decision: TradeOfferDecision;
  /** Adjusted incoming/outgoing value ratio - above 1 means the responding team comes out ahead. */
  score: number;
  reasons: TradeOfferReasonCode[];
}

// Bounded 0.7-1.3 personality nudges (see gmPersonality.ts) are applied on
// top of these fixed thresholds - the gap between "clearly lopsided" and
// "close to fair" is wide enough that no personality combination can turn
// a robbery into an accept. See the "does not accept a lopsided trade for
// any personality" test.
//
// **Left at 0.95 deliberately, and it is not the volume knob.** Making the
// model symmetric changed how often two CPU teams can agree, and the tempting
// fix was to raise this until CPU trade volume came back to its target. That
// would have meant a bar above 1.0 - the CPU rejecting a mathematically fair
// offer from the user, as a side effect of a valuation fix. Acceptance sets how
// a GM *behaves*; `TRADE_CHANCE_PER_GAME` in `leagueEvents.ts` sets how often
// the league tries. Conflating the two is what made the original tuning
// fragile. That frequency was recalibrated instead - see the note there.
export const ACCEPT_THRESHOLD = 0.95;
const COUNTER_THRESHOLD = 0.75;

// `score` is reported for the UI ("% of fair value") and for fan sentiment,
// which reads it as a ratio centred on 1. Value can now be negative, and a
// ratio cannot express that - shedding a -$20M contract is a gain, not a 20x
// loss - so the *decision* comes from a margin test and this stays a
// presentation figure, bounded so a near-zero denominator can't report a
// meaningless number.
export const MAX_REPORTED_SCORE = 3;

// Exported for reuse by src/lib/gm/reSigningDecision.ts, which applies the
// exact same identity/age/need-fit weighting to a retention decision rather
// than an asset-for-asset trade - see that file for why it can't just call
// evaluateTradeOffer itself.
export const YOUNG_AGE_THRESHOLD = 25;
export const VETERAN_AGE_THRESHOLD = 30;
export const CONTENDER_VETERAN_BONUS = 1.15;
export const REBUILDING_YOUTH_PICK_BONUS = 1.15;
export const NEED_FIT_BONUS_MULTIPLIER = 1.25;

const UNTOUCHABLE_COUNT = 2;
const UNTOUCHABLE_IDENTITIES: TeamIdentity[] = ["CONTENDER", "PLAYOFF_TEAM"];
// How large an overpay has to be, relative to the untouchable player's own
// objective value, before a team will even consider moving them.
const UNTOUCHABLE_OVERPAY_MULTIPLIER = 1.75;

const STARTER_THRESHOLD = 72;
const ROTATION_THRESHOLD = 65;

function scaleCents(cents: bigint, multiplier: number): bigint {
  return BigInt(Math.round(Number(cents) * multiplier));
}

function isUntouchable(
  player: { overallRating: number; age: number },
  rosterRatingsDesc: number[],
  identity: TeamIdentity,
): boolean {
  // A genuinely superstar-caliber player is untouchable regardless of age
  // or team record - real front offices don't casually move a top-tier
  // talent for "a package of good players" just because they're
  // rebuilding. Age only matters for the softer "top players on a
  // currently-winning team" rule below, which covers merely-very-good
  // players who aren't quite superstar-tier by raw rating.
  if (getPlayerValueTier(player.overallRating) === "SUPERSTAR") return true;

  if (!UNTOUCHABLE_IDENTITIES.includes(identity)) return false;
  const topThreshold = rosterRatingsDesc[Math.min(UNTOUCHABLE_COUNT, rosterRatingsDesc.length) - 1];
  return topThreshold !== undefined && player.overallRating >= topThreshold;
}

export function playerFillsNeed(player: TradePlayerAsset, need: TeamNeed): boolean {
  switch (need) {
    case "STAR_SCORER": {
      const tier = getPlayerValueTier(player.overallRating);
      return tier === "SUPERSTAR" || tier === "STAR";
    }
    case "POINT_GUARD":
      return player.position === "PG" && player.overallRating >= STARTER_THRESHOLD;
    case "RIM_PROTECTOR":
      return player.position === "C" && player.overallRating >= STARTER_THRESHOLD;
    case "WING_DEFENDER":
      return (
        (player.position === "SF" || player.position === "SG") &&
        player.overallRating >= STARTER_THRESHOLD
      );
    case "BENCH_DEPTH":
      return player.overallRating >= ROTATION_THRESHOLD;
  }
}

function toValueInput(asset: TradePlayerAsset, currentSeason: number) {
  return {
    season: currentSeason,
    overallRating: asset.overallRating,
    potentialRating: asset.potentialRating,
    age: asset.age,
    currentSalaryCents: asset.currentSalaryCents,
    futureSalaryCents: asset.futureSalaryCents,
    injuryStatus: asset.injuryStatus,
    careerGamesMissedToInjury: asset.careerGamesMissedToInjury,
  };
}

function objectivePickValue(asset: TradePickAsset, currentSeason: number): bigint {
  return computeDraftPickTradeValue({
    currentSeason,
    pickSeason: asset.pickSeason,
    round: asset.round,
    overallPickNumber: asset.overallPickNumber,
    originalTeamCompetitivenessPercentile: asset.originalTeamCompetitivenessPercentile,
  });
}

/**
 * The core trade-AI decision: does this team accept, reject, or want to
 * counter the proposed trade, from its own identity/needs/personality.
 * Pure function, no Prisma - reused client-side (Trade Builder live
 * preview) and server-side (the authoritative gate in
 * `executeTradeAction`).
 */
export function evaluateTradeOffer(input: EvaluateTradeOfferInput): EvaluateTradeOfferResult {
  const { identity, needs, personality, roster } = input.respondingTeam;
  const weights = GM_PERSONALITY_WEIGHTS[personality];
  const isWinNowIdentity = identity === "CONTENDER" || identity === "PLAYOFF_TEAM";
  const isRebuildingIdentity = identity === "REBUILDING" || identity === "TANKING";
  const rosterRatingsDesc = [...roster.map((p) => p.overallRating)].sort((a, b) => b - a);

  const reasons = new Set<TradeOfferReasonCode>();

  /**
   * How much this team's philosophy reweights a player's *talent*.
   *
   * **Applied identically in both directions, and that is the whole point.**
   * These bonuses used to be added to incoming assets only, so the same
   * 24-year-old was worth up to 1.87x more arriving than leaving. That is not
   * a philosophy, it is an arbitrage: sweeping 5,300 mirror trades found 160
   * where both teams accepted the same swap in opposite directions, 60 of them
   * caused purely by this. A GM who loves youth should ask more for his own
   * young players too. See docs/TRADE_AUDIT.md, T-P0-4.
   */
  const talentMultiplier = (asset: TradePlayerAsset): number => {
    let multiplier = 1;
    if (asset.age <= YOUNG_AGE_THRESHOLD) {
      multiplier *= weights.youthValueMultiplier;
      if (isRebuildingIdentity) multiplier *= REBUILDING_YOUTH_PICK_BONUS;
    }
    if (asset.age >= VETERAN_AGE_THRESHOLD) {
      multiplier *= weights.veteranValueMultiplier;
      if (isWinNowIdentity) multiplier *= CONTENDER_VETERAN_BONUS;
    }
    if (needs.some((need) => playerFillsNeed(asset, need))) {
      multiplier *= NEED_FIT_BONUS_MULTIPLIER;
    }
    return multiplier;
  };

  /** Talent only, with philosophy applied - the untouchable gate's yardstick. */
  const adjustedTalentValue = (asset: TradePlayerAsset): bigint =>
    scaleCents(
      computePlayerTradeValueParts(toValueInput(asset, input.currentSeason)).talentValueCents,
      talentMultiplier(asset),
    );

  const valueOf = (asset: TradeAssetForEvaluation, direction: "IN" | "OUT"): bigint => {
    if (asset.type === "DRAFT_PICK") {
      let value = scaleCents(
        objectivePickValue(asset, input.currentSeason),
        weights.pickValueMultiplier,
      );
      // A rebuilder both pays more for picks and asks more for its own.
      if (isRebuildingIdentity) value = scaleCents(value, REBUILDING_YOUTH_PICK_BONUS);
      return value;
    }

    const { contractSurplusCents } = computePlayerTradeValueParts(
      toValueInput(asset, input.currentSeason),
    );

    // Aversion to bad money is the one genuinely one-sided preference, and
    // `GmPersonalityWeights` documents it that way: it is about what you are
    // willing to take ON. It had never been wired into trades at all - the
    // field's only reader was `reSigningDecision.ts`, so Salary-Conscious
    // differed from Balanced by a threshold nudge and nothing else.
    const surplus =
      direction === "IN" && contractSurplusCents < 0n
        ? scaleCents(contractSurplusCents, weights.badContractSensitivityMultiplier)
        : contractSurplusCents;

    return (
      adjustedTalentValue(asset) + BigInt(Math.round(Number(surplus) * CONTRACT_SURPLUS_WEIGHT))
    );
  };

  let totalIncomingCents = 0n;
  for (const asset of input.incoming) {
    if (asset.type === "PLAYER" && needs.some((need) => playerFillsNeed(asset, need))) {
      reasons.add("FILLS_A_NEED");
    }
    totalIncomingCents += valueOf(asset, "IN");
  }

  // Untouchable check - a hard gate, not a weighted factor. No personality
  // or identity weighting overrides this; only a large enough overpay does.
  //
  // Priced off TALENT, not total value. Total value nets out the contract,
  // and a franchise player is usually the most expensive man on the roster -
  // so pricing the gate on the net let a superstar's own max contract pay his
  // ransom. In the shipped model that collapsed completely: age compounding
  // (T-P0-1) made Curry worth exactly zero, the gate asked for 1.75x zero, and
  // he was acquirable for junk on turn one.
  for (const asset of input.outgoing) {
    if (asset.type !== "PLAYER") continue;
    if (!isUntouchable(asset, rosterRatingsDesc, identity)) continue;

    const requiredOverpayCents = scaleCents(
      adjustedTalentValue(asset),
      UNTOUCHABLE_OVERPAY_MULTIPLIER,
    );
    if (totalIncomingCents < requiredOverpayCents) {
      return { decision: "REJECT", score: 0, reasons: ["UNTOUCHABLE_PLAYER"] };
    }
  }

  let totalOutgoingCents = 0n;
  for (const asset of input.outgoing) {
    totalOutgoingCents += valueOf(asset, "OUT");
  }

  const baseAcceptThreshold = input.acceptThresholdOverride ?? ACCEPT_THRESHOLD;
  const effectiveAcceptThreshold = baseAcceptThreshold * weights.acceptanceThresholdMultiplier;
  const effectiveCounterThreshold = COUNTER_THRESHOLD * weights.acceptanceThresholdMultiplier;

  // A margin test, not a ratio. Once a bad contract can be a genuine liability
  // the totals can go negative, and `incoming / outgoing` is meaningless there:
  // sending away a -$20M contract and receiving nothing is a clear win, but
  // reads as a ratio of zero. Comparing against a scaled outgoing total is the
  // same comparison whenever outgoing is positive, and stays correct when it
  // is not.
  const bar = (threshold: number) => scaleCents(totalOutgoingCents, threshold);

  let decision: TradeOfferDecision;
  if (totalIncomingCents >= bar(effectiveAcceptThreshold)) {
    decision = "ACCEPT";
    reasons.add("FAIR_VALUE");
  } else if (totalIncomingCents >= bar(effectiveCounterThreshold)) {
    decision = "COUNTER";
  } else {
    decision = "REJECT";
    reasons.add("BELOW_FAIR_VALUE");
  }

  // Reported as a ratio because the UI renders it as "% of fair value" and fan
  // sentiment reads it as centred on 1. Identical to the old figure whenever
  // outgoing value is positive; falls back to a season-stable reference scale
  // when it is not, rather than dividing by ~zero.
  const referenceCents =
    totalOutgoingCents > 0n
      ? Number(totalOutgoingCents)
      : Number(getSeasonCapRules(input.currentSeason).salaryCapCents);
  const score = Math.max(
    0,
    Math.min(
      MAX_REPORTED_SCORE,
      1 + Number(totalIncomingCents - totalOutgoingCents) / referenceCents,
    ),
  );

  return { decision, score, reasons: [...reasons] };
}
