"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  takeOutLoanAction,
  repayDebtAction,
  requestOwnerCapitalAction,
  takeDistressedFinancingAction,
} from "@/lib/actions/financing";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import {
  loanAmountCents,
  capitalCallAmountCents,
  capitalCallConfidenceCost,
  distressedFinancingAmountCents,
  LOAN_TIER_LABEL,
  CAPITAL_CALL_TIER_LABEL,
  type LoanTier,
  type CapitalCallTier,
} from "@/lib/finances/financing";

const LOAN_TIERS: LoanTier[] = ["SMALL", "MEDIUM", "LARGE"];
const CAPITAL_CALL_TIERS: CapitalCallTier[] = ["SMALL", "MEDIUM", "LARGE"];

export function FinancingCard({
  leagueId,
  debtCents,
  annualInterestCents,
  distressedFinancingEligible,
}: {
  leagueId: string;
  debtCents: number;
  annualInterestCents: number;
  distressedFinancingEligible: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [repayAmount, setRepayAmount] = useState(Math.round(debtCents / 100 / 1_000_000));

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs tracking-wide text-muted uppercase">Financing</p>
      <div className="mt-2 grid grid-cols-2 gap-4">
        <div>
          <p className="text-lg font-bold text-foreground tabular-nums">
            {formatFinanceCents(debtCents)}
          </p>
          <p className="text-xs text-muted">Outstanding debt</p>
        </div>
        <div>
          <p className="text-lg font-bold text-foreground tabular-nums">
            {formatFinanceCents(annualInterestCents)}/yr
          </p>
          <p className="text-xs text-muted">Interest owed</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold text-foreground">Take out a loan</p>
        <p className="text-xs text-muted">
          Real cash now, interest-only forever until you repay it.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LOAN_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              disabled={isPending}
              onClick={() => run(() => takeOutLoanAction(leagueId, tier))}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {LOAN_TIER_LABEL[tier]} ({formatFinanceCents(loanAmountCents(tier))})
            </button>
          ))}
        </div>
      </div>

      {debtCents > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-foreground">Repay debt</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={repayAmount}
              onChange={(e) => setRepayAmount(Number(e.target.value))}
              className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-foreground"
            />
            <span className="text-xs text-muted">$M</span>
            <button
              type="button"
              disabled={isPending || repayAmount <= 0}
              onClick={() => run(() => repayDebtAction(leagueId, repayAmount * 1_000_000 * 100))}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Repay
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold text-foreground">Ask ownership for capital</p>
        <p className="text-xs text-muted">Free money - priced entirely in owner confidence.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CAPITAL_CALL_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              disabled={isPending}
              onClick={() => run(() => requestOwnerCapitalAction(leagueId, tier))}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {CAPITAL_CALL_TIER_LABEL[tier]} ({formatFinanceCents(capitalCallAmountCents(tier))}, -
              {capitalCallConfidenceCost(tier)} confidence)
            </button>
          ))}
        </div>
      </div>

      {distressedFinancingEligible && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs font-semibold text-red-400">Distressed financing available</p>
          <p className="mt-1 text-xs text-muted">
            {formatFinanceCents(distressedFinancingAmountCents())} at a real reputational cost -
            only take this if you have to.
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => takeDistressedFinancingAction(leagueId))}
            className="mt-2 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Take distressed financing
          </button>
        </div>
      )}
    </div>
  );
}
