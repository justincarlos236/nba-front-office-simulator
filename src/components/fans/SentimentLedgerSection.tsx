import type { FanSentimentKind } from "@/generated/prisma/client";
import {
  summarizeByTheme,
  topContributors,
  FAN_SENTIMENT_THEME_LABEL,
  FAN_SENTIMENT_THEME_DESCRIPTION,
  FAN_SENTIMENT_KIND_LABEL,
  type LedgerEvent,
} from "@/lib/fans/sentimentLedger";

/**
 * Fans Page Redesign (Phase 1), Section 3 - "Why They Feel This Way." The
 * direct fix for docs/FANS_PAGE_REDESIGN.md's core finding: the engine
 * always knew why the fanbase felt a certain way, it just never showed its
 * work. This section is a pure render over the sentiment ledger - no logic
 * beyond formatting lives here.
 */

function DeltaChip({ delta }: { delta: number }) {
  const positive = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        positive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
      }`}
    >
      {positive ? "+" : ""}
      {delta}
    </span>
  );
}

function ContributorRow({ event }: { event: LedgerEvent }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {FAN_SENTIMENT_KIND_LABEL[event.kind as FanSentimentKind]}
        </p>
        <p className="mt-0.5 text-sm text-foreground">{event.description}</p>
      </div>
      <DeltaChip delta={event.delta} />
    </div>
  );
}

export function SentimentLedgerSection({ events }: { events: LedgerEvent[] }) {
  const themes = summarizeByTheme(events);
  const { positive, negative } = topContributors(events, 5);

  if (events.length === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">Why They Feel This Way</h2>
        <div className="mt-4 rounded-xl border border-dashed border-border bg-surface p-8 text-center text-muted">
          Nothing notable has moved the fanbase yet this season - big trades, streaks, and decisions
          will show up here as they happen.
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">Why They Feel This Way</h2>
      <p className="mt-1 text-sm text-muted">
        The real, specific events driving fan sentiment this season - not just the number they add
        up to.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {themes.map((t) => (
          <div key={t.theme} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs tracking-wide text-muted uppercase">
              {FAN_SENTIMENT_THEME_LABEL[t.theme]}
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums ${
                t.netDelta > 0
                  ? "text-emerald-400"
                  : t.netDelta < 0
                    ? "text-red-400"
                    : "text-foreground"
              }`}
            >
              {t.netDelta > 0 ? "+" : ""}
              {t.netDelta}
            </p>
            <p className="mt-1 text-xs text-muted">{FAN_SENTIMENT_THEME_DESCRIPTION[t.theme]}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold text-emerald-400">Biggest reasons fans are happy</p>
          <div className="mt-3 space-y-2">
            {positive.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
                Nothing has genuinely lifted the fanbase this season yet.
              </p>
            ) : (
              positive.map((e) => <ContributorRow key={e.id} event={e} />)
            )}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-red-400">Biggest reasons fans are upset</p>
          <div className="mt-3 space-y-2">
            {negative.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted">
                Nothing has genuinely soured the fanbase this season yet.
              </p>
            ) : (
              negative.map((e) => <ContributorRow key={e.id} event={e} />)
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
