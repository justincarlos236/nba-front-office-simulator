import {
  evaluateTradeOffer,
  type EvaluateTradeOfferInput,
  type TradeAssetForEvaluation,
} from "./evaluateTradeOffer";

/** A trade asset tagged with whatever id/label the caller needs to act on the suggestion (e.g. select it in the Trade Builder). */
export interface IdentifiedTradeAsset {
  id: string;
  label: string;
  asset: TradeAssetForEvaluation;
}

export interface SuggestCounterOfferInput {
  respondingTeam: EvaluateTradeOfferInput["respondingTeam"];
  currentSeason: number;
  /** What the responding team would receive, as currently proposed. */
  incoming: IdentifiedTradeAsset[];
  /** What the responding team would send away, as currently proposed. */
  outgoing: IdentifiedTradeAsset[];
  /** The proposing team's own remaining, not-yet-offered players/picks - candidates to sweeten the deal. */
  availableToAdd: IdentifiedTradeAsset[];
}

export type CounterOfferSuggestion =
  | { action: "NONE" }
  | { action: "ADD_ASSET"; asset: { id: string; label: string } }
  | { action: "DROP_OUTGOING"; asset: { id: string; label: string } };

function toAssets(identified: IdentifiedTradeAsset[]): TradeAssetForEvaluation[] {
  return identified.map((a) => a.asset);
}

/**
 * Suggests a concrete, real-inventory fix for a trade the responding team
 * wouldn't accept as proposed - reuses `evaluateTradeOffer` itself as the
 * judge (simulate the modified trade, check if the decision improves)
 * rather than a second hand-tuned heuristic, so the suggestion is always
 * consistent with the actual acceptance logic.
 */
export function suggestCounterOffer(input: SuggestCounterOfferInput): CounterOfferSuggestion {
  const base = evaluateTradeOffer({
    respondingTeam: input.respondingTeam,
    currentSeason: input.currentSeason,
    incoming: toAssets(input.incoming),
    outgoing: toAssets(input.outgoing),
  });
  if (base.decision === "ACCEPT") return { action: "NONE" };

  // An untouchable-player rejection isn't fixed by sweetening the pot - real
  // front offices won't move that specific piece at any reasonable price.
  // The real fix is a fundamentally different offer built around someone
  // else, so try dropping each outgoing player one at a time and see if
  // that alone clears the block.
  if (base.reasons.includes("UNTOUCHABLE_PLAYER")) {
    for (const candidate of input.outgoing) {
      if (candidate.asset.type !== "PLAYER") continue;
      const withoutIt = evaluateTradeOffer({
        respondingTeam: input.respondingTeam,
        currentSeason: input.currentSeason,
        incoming: toAssets(input.incoming),
        outgoing: toAssets(input.outgoing.filter((a) => a.id !== candidate.id)),
      });
      if (!(withoutIt.decision === "REJECT" && withoutIt.reasons.includes("UNTOUCHABLE_PLAYER"))) {
        return { action: "DROP_OUTGOING", asset: { id: candidate.id, label: candidate.label } };
      }
    }
  }

  // Otherwise, try adding one available asset at a time and surface the
  // cheapest one (lowest resulting score) that's actually enough to flip
  // the decision to ACCEPT - the smallest real sweetener, not just the
  // first one that happens to work.
  let best: { id: string; label: string; score: number } | null = null;
  for (const candidate of input.availableToAdd) {
    const withIt = evaluateTradeOffer({
      respondingTeam: input.respondingTeam,
      currentSeason: input.currentSeason,
      incoming: [...toAssets(input.incoming), candidate.asset],
      outgoing: toAssets(input.outgoing),
    });
    if (withIt.decision === "ACCEPT" && (best === null || withIt.score < best.score)) {
      best = { id: candidate.id, label: candidate.label, score: withIt.score };
    }
  }
  if (best) return { action: "ADD_ASSET", asset: { id: best.id, label: best.label } };

  return { action: "NONE" };
}
