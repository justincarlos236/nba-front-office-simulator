"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveBusinessDecisionAction } from "@/lib/actions/businessDecisions";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import type { BusinessDecisionOption } from "@/lib/finances/businessDecisions";

export interface InboxDecision {
  id: string;
  headline: string;
  body: string;
  severity: "MINOR" | "STANDARD" | "MAJOR" | "BREAKING";
  options: BusinessDecisionOption[];
  daysUntilDeadline: number;
}

const SEVERITY_LABEL: Record<InboxDecision["severity"], string> = {
  MINOR: "Minor",
  STANDARD: "Standard",
  MAJOR: "Major",
  BREAKING: "Urgent",
};

const SEVERITY_ACCENT: Record<InboxDecision["severity"], string> = {
  MINOR: "text-muted",
  STANDARD: "text-sky-400",
  MAJOR: "text-amber-400",
  BREAKING: "text-red-400",
};

function effectChip(label: string, value: number, formatValue: (v: number) => string) {
  if (value === 0) return null;
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
        positive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
      }`}
    >
      {label} {positive ? "+" : ""}
      {formatValue(value)}
    </span>
  );
}

function DecisionCard({ leagueId, decision }: { leagueId: string; decision: InboxDecision }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [chosenId, setChosenId] = useState<string | null>(null);

  function resolve(optionId: string) {
    setChosenId(optionId);
    startTransition(async () => {
      await resolveBusinessDecisionAction(leagueId, decision.id, optionId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-foreground">{decision.headline}</h3>
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${SEVERITY_ACCENT[decision.severity]}`}
        >
          {SEVERITY_LABEL[decision.severity]}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{decision.body}</p>
      <p className="mt-1 text-xs text-muted">
        {decision.daysUntilDeadline <= 0
          ? "Respond now - the deadline has arrived."
          : `Respond within ${decision.daysUntilDeadline} day${decision.daysUntilDeadline === 1 ? "" : "s"}, or the default option applies automatically.`}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {decision.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={isPending}
            onClick={() => resolve(option.id)}
            className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              chosenId === option.id
                ? "border-accent bg-accent/10"
                : "border-border bg-surface-2 hover:border-accent/50"
            }`}
          >
            <p className="text-sm font-semibold text-foreground">{option.label}</p>
            <p className="mt-1 text-xs text-muted">{option.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {effectChip("Cash", option.cashDeltaCents, (v) => formatFinanceCents(Math.abs(v)))}
              {effectChip("Fans", option.fanHappinessDelta, (v) => `${Math.abs(v)}`)}
              {effectChip("Owner", option.ownerConfidenceDelta, (v) => `${Math.abs(v)}`)}
            </div>
          </button>
        ))}
      </div>
      {isPending && <p className="mt-3 text-xs text-accent">Resolving...</p>}
    </div>
  );
}

export function BusinessDecisionInbox({
  leagueId,
  decisions,
}: {
  leagueId: string;
  decisions: InboxDecision[];
}) {
  if (decisions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
        No business decisions waiting right now - the front office will bring you sponsorship
        offers, crises, and opportunities as the season plays out.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {decisions.map((d) => (
        <DecisionCard key={d.id} leagueId={leagueId} decision={d} />
      ))}
    </div>
  );
}
