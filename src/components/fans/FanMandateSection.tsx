import {
  FAN_MANDATE_LABEL,
  FAN_MANDATE_DESCRIPTION,
  type FanMandateKind,
} from "@/lib/fans/fanMandate";

/**
 * Fans Page Redesign (Phase 4), Section 2 - "What the City Wants"
 * (docs/FANS_PAGE_REDESIGN.md Part 3.2). The answer to "what do fans expect
 * from me this season" - deliberately distinct from ExpectationLevel
 * (ownership's own bar, shown on the Home Dashboard). `keepOurGuy` renders
 * as a separate overlay, never merged into the primary mandate: a
 * championship-or-bust fanbase can simultaneously refuse to accept trading
 * its icon, and the two should read as two distinct expectations.
 */

function SatisfactionBar({ value }: { value: number }) {
  const color = value >= 65 ? "bg-emerald-500" : value >= 35 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">Currently serving this mandate</span>
        <span className="font-semibold tabular-nums text-foreground">{value}/100</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function FanMandateSection({
  mandate,
  satisfaction,
  facts,
  keepOurGuyPlayerName,
}: {
  mandate: FanMandateKind;
  satisfaction: number;
  facts: string[];
  keepOurGuyPlayerName: string | null;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">What the City Wants</h2>
      <p className="mt-1 text-sm text-muted">
        Not your owner&apos;s bar - this is what the fanbase itself expects from you right now.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-surface p-5">
        <p className="text-xl font-bold text-foreground">{FAN_MANDATE_LABEL[mandate]}</p>
        <p className="mt-1 text-sm text-muted">{FAN_MANDATE_DESCRIPTION[mandate]}</p>
        {facts.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-3">
            {facts.map((fact, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted">
                <span className="text-foreground">-</span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        )}
        <SatisfactionBar value={satisfaction} />
      </div>

      {keepOurGuyPlayerName && (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-amber-400">
            ...and don&apos;t trade {keepOurGuyPlayerName}
          </p>
          <p className="mt-1 text-xs text-muted">
            This city hasn&apos;t forgotten who this franchise is built around. Moving{" "}
            {keepOurGuyPlayerName} would be its own, separate story - regardless of how the rest of
            the roster is judged.
          </p>
        </div>
      )}
    </section>
  );
}
