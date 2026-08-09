"use client";

import { useState, useTransition } from "react";
import { acceptCpuOfferAction, declineCpuOfferAction } from "@/lib/actions/tradeOffers";

/**
 * Accept or decline an unsolicited offer.
 *
 * Accepting is confirmed; declining is not. That asymmetry is deliberate and
 * matches the rest of the product's P0 confirmation rule: accepting moves real
 * players and cannot be undone, while declining leaves the roster exactly as it
 * was. Confirming a no-op would be friction pretending to be safety.
 */
export function OfferDecision({ leagueId, tradeId }: { leagueId: string; tradeId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        // A redirect from the server action surfaces here as a thrown control
        // signal; only real failures should be shown.
        if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="mt-8 border-t border-rule pt-6">
      {confirming ? (
        <div>
          <p className="text-[15px] leading-relaxed text-ink">
            Accepting executes this trade immediately. Players change teams and it cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => acceptCpuOfferAction(leagueId, tradeId))}
              className="bg-team-accent px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] text-team-accent-ink uppercase transition hover:opacity-90 disabled:opacity-40"
            >
              {isPending ? "Executing..." : "Confirm trade"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming(false)}
              className="border border-rule px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase transition hover:border-rule-strong disabled:opacity-40"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirming(true)}
            className="bg-team-accent px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] text-team-accent-ink uppercase transition hover:opacity-90 disabled:opacity-40"
          >
            Accept offer
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => declineCpuOfferAction(leagueId, tradeId))}
            className="border border-rule px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] text-ink uppercase transition hover:border-rule-strong disabled:opacity-40"
          >
            {isPending ? "Declining..." : "Decline"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[15px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
