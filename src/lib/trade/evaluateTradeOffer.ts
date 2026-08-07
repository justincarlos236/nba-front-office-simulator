import { computePlayerTradeValue } from "../gm/playerTradeValue";
import { computeDraftPickTradeValue } from "../gm/draftPickTradeValue";
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
const ACCEPT_THRESHOLD = 0.95;
const COUNTER_THRESHOLD = 0.75;

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

function objectivePlayerValue(asset: TradePlayerAsset, currentSeason: number): bigint {
  return computePlayerTradeValue({
    season: currentSeason,
    overallRating: asset.overallRating,
    potentialRating: asset.potentialRating,
    age: asset.age,
    currentSalaryCents: asset.currentSalaryCents,
    injuryStatus: asset.injuryStatus,
    careerGamesMissedToInjury: asset.careerGamesMissedToInjury,
  });
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

  // Incoming value: personality/identity/need-fit adjustments layered on
  // top of each asset's objective value - computed once, reused both for
  // the untouchable-overpay check below and the main score.
  let totalIncomingCents = 0n;
  for (const asset of input.incoming) {
    if (asset.type === "PLAYER") {
      let value = objectivePlayerValue(asset, input.currentSeason);
      if (asset.age <= YOUNG_AGE_THRESHOLD) {
        value = scaleCents(value, weights.youthValueMultiplier);
        if (isRebuildingIdentity) value = scaleCents(value, REBUILDING_YOUTH_PICK_BONUS);
      }
      if (asset.age >= VETERAN_AGE_THRESHOLD) {
        value = scaleCents(value, weights.veteranValueMultiplier);
        if (isWinNowIdentity) value = scaleCents(value, CONTENDER_VETERAN_BONUS);
      }
      if (needs.some((need) => playerFillsNeed(asset, need))) {
        value = scaleCents(value, NEED_FIT_BONUS_MULTIPLIER);
        reasons.add("FILLS_A_NEED");
      }
      totalIncomingCents += value;
    } else {
      let value = objectivePickValue(asset, input.currentSeason);
      value = scaleCents(value, weights.pickValueMultiplier);
      if (isRebuildingIdentity) value = scaleCents(value, REBUILDING_YOUTH_PICK_BONUS);
      totalIncomingCents += value;
    }
  }

  // Untouchable check - a hard gate, not a weighted factor. No personality
  // or identity weighting overrides this; only a large enough objective
  // overpay does.
  for (const asset of input.outgoing) {
    if (asset.type !== "PLAYER") continue;
    if (!isUntouchable(asset, rosterRatingsDesc, identity)) continue;

    const requiredOverpayCents = scaleCents(
      objectivePlayerValue(asset, input.currentSeason),
      UNTOUCHABLE_OVERPAY_MULTIPLIER,
    );
    if (totalIncomingCents < requiredOverpayCents) {
      return { decision: "REJECT", score: 0, reasons: ["UNTOUCHABLE_PLAYER"] };
    }
  }

  let totalOutgoingCents = 0n;
  for (const asset of input.outgoing) {
    if (asset.type === "PLAYER") {
      totalOutgoingCents += objectivePlayerValue(asset, input.currentSeason);
    } else {
      // Giving up a pick "costs" a Pick Hoarder more than its objective value.
      totalOutgoingCents += scaleCents(
        objectivePickValue(asset, input.currentSeason),
        weights.pickValueMultiplier,
      );
    }
  }

  const score =
    totalOutgoingCents > 0n
      ? Number(totalIncomingCents) / Number(totalOutgoingCents)
      : totalIncomingCents > 0n
        ? Number.POSITIVE_INFINITY
        : 1;

  const effectiveAcceptThreshold = ACCEPT_THRESHOLD * weights.acceptanceThresholdMultiplier;
  const effectiveCounterThreshold = COUNTER_THRESHOLD * weights.acceptanceThresholdMultiplier;

  let decision: TradeOfferDecision;
  if (score >= effectiveAcceptThreshold) {
    decision = "ACCEPT";
    reasons.add("FAIR_VALUE");
  } else if (score >= effectiveCounterThreshold) {
    decision = "COUNTER";
  } else {
    decision = "REJECT";
    reasons.add("BELOW_FAIR_VALUE");
  }

  return { decision, score, reasons: [...reasons] };
}
