import type { FanSentimentKind } from "@/generated/prisma/client";
import { FAN_SENTIMENT_KIND_LABEL, type LedgerEvent } from "@/lib/fans/sentimentLedger";

/**
 * "Fan Reactions," rebuilt. Replaces the old
 * fanReactions.ts lookup table (`TRADE -> "Fans are buzzing"`, fired
 * identically for a lopsided win or a lopsided loss - the sharpest
 * complaint in docs/design/FANS_PAGE_REDESIGN.md Part 2.3) with the real,
 * delta-aware descriptions already written into the sentiment ledger at the
 * moment each event happened (src/lib/fans/describeSentiment.ts).
 *
 * This is the same ledger SentimentLedgerSection reads, cut a different
 * way: chronological (most recent first) rather than ranked by magnitude -
 * "what's the fanbase been saying lately," not "what mattered most." A
 * deliberately different lens on one source of truth, not a second one.
 */

const REACTION_TONE_CLASS: Record<"POSITIVE" | "NEGATIVE" | "NEUTRAL", string> = {
  POSITIVE: "border-l-4 border-l-emerald-500",
  NEGATIVE: "border-l-4 border-l-red-500",
  NEUTRAL: "",
};

function toneFor(delta: number): "POSITIVE" | "NEGATIVE" | "NEUTRAL" {
  if (delta > 0) return "POSITIVE";
  if (delta < 0) return "NEGATIVE";
  return "NEUTRAL";
}

export function ReactionFeedSection({ events }: { events: LedgerEvent[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-ink">Fan Reactions</h2>
      <p className="mt-1 text-sm text-ink-muted">
        What the fanbase is actually saying about your recent moves and results.
      </p>
      {events.length === 0 ? (
        <div className="mt-4 rounded-[2px] border border-rule bg-field p-8 text-center text-ink-muted">
          No fan reactions yet - they&apos;ll show up here as your season unfolds.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {events.map((e) => (
            <div
              key={e.id}
              className={`rounded-[2px] border border-rule bg-field p-3 text-sm text-ink ${REACTION_TONE_CLASS[toneFor(e.delta)]}`}
            >
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                {FAN_SENTIMENT_KIND_LABEL[e.kind as FanSentimentKind]}
              </p>
              <p className="mt-0.5">{e.description}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
