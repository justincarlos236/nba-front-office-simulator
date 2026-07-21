import { createSeededRandom } from "../contracts/seededRandom";
import type { TradeOfferReasonCode } from "./evaluateTradeOffer";

/**
 * Plain-English presentation layer over `evaluateTradeOffer`'s structured
 * reason codes (Phase 11d) - mirrors how `capStatusLabel.ts` wraps the real
 * cap engine's output without changing the underlying decision logic.
 * Several variants per code so the same rejection reason doesn't read as an
 * identical canned sentence every time a user tries a similar trade.
 */
const TRADE_REASON_MESSAGES: Record<TradeOfferReasonCode, string[]> = {
  UNTOUCHABLE_PLAYER: [
    "That player is the foundation of this roster - not available for anything close to this.",
    "They're not moving a piece that important unless the return is a real overpay.",
    "That player is off the table in this kind of deal.",
  ],
  BELOW_FAIR_VALUE: [
    "This doesn't come close to matching what they'd be giving up.",
    "They'd be selling low here - the value isn't there yet.",
    "Not enough is coming back for what they'd be sending out.",
  ],
  FILLS_A_NEED: [
    "This actually addresses a real gap on their roster.",
    "They've been looking for exactly this kind of piece.",
    "This fills a need they've had all season.",
  ],
  FAIR_VALUE: [
    "This looks like a fair deal for both sides.",
    "They're comfortable with the value on both ends here.",
    "A reasonable trade, from their side of it.",
  ],
};

/** Deterministic per `seed` (no flicker on re-render), varied across different trades/teams. */
function pickOne(options: string[], seed: string): string {
  const rng = createSeededRandom(seed);
  return options[Math.floor(rng() * options.length)];
}

/**
 * Renders every distinct reason code present into one or more plain-English
 * sentences - a trade can carry more than one code at once (e.g. a rejected
 * offer that still included a piece that filled a need).
 */
export function describeTradeReasons(reasons: TradeOfferReasonCode[], seed: string): string[] {
  return reasons.map((reason) => pickOne(TRADE_REASON_MESSAGES[reason], `${seed}-${reason}`));
}
