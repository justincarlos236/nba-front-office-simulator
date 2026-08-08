"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDepartmentBudgetAction } from "@/lib/actions/finances";
import { formatFinanceCents } from "@/lib/finances/formatFinance";
import {
  DEPARTMENT_KEYS,
  DEPARTMENT_LABEL,
  DEPARTMENT_IDENTITY,
  DEPARTMENT_BUDGET_TOTAL,
  DEPARTMENT_LEVEL_MIN_INDEX,
  DEPARTMENT_LEVEL_MAX_INDEX,
  departmentLevelIndex,
  departmentLevelFromIndex,
  departmentBudgetTotal,
  isValidDepartmentBudget,
  departmentAnnualCostCents,
  totalDepartmentBudgetCostCents,
  type DepartmentBudget,
  type DepartmentKey,
} from "@/lib/finances/departments";
import type { DepartmentLevel } from "@/generated/prisma/client";

const LEVEL_SHORT_LABEL: Record<DepartmentLevel, string> = {
  MINIMAL: "Minimal",
  LOW: "Low",
  STANDARD: "Standard",
  HIGH: "High",
  MAXIMUM: "Maximum",
};

function DepartmentRow({
  deptKey,
  level,
  onChange,
  disabled,
}: {
  deptKey: DepartmentKey;
  level: DepartmentLevel;
  onChange: (level: DepartmentLevel) => void;
  disabled: (delta: 1 | -1) => boolean;
}) {
  const index = departmentLevelIndex(level);
  return (
    <div className="rounded-[2px] border border-rule bg-field p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink">{DEPARTMENT_LABEL[deptKey]}</p>
        <p className="text-xs text-ink-muted tabular-nums">
          {formatFinanceCents(departmentAnnualCostCents(level))}/yr
        </p>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={disabled(-1)}
          onClick={() => onChange(departmentLevelFromIndex(index - 1))}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-rule text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Decrease ${DEPARTMENT_LABEL[deptKey]}`}
        >
          &minus;
        </button>
        <div className="flex flex-1 items-center gap-1">
          {Array.from({ length: DEPARTMENT_LEVEL_MAX_INDEX - DEPARTMENT_LEVEL_MIN_INDEX + 1 }).map(
            (_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-team-accent" : "bg-raised"}`}
              />
            ),
          )}
        </div>
        <button
          type="button"
          disabled={disabled(1)}
          onClick={() => onChange(departmentLevelFromIndex(index + 1))}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-rule text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Increase ${DEPARTMENT_LABEL[deptKey]}`}
        >
          +
        </button>
        <span className="w-16 shrink-0 text-right text-xs font-medium text-ink">
          {LEVEL_SHORT_LABEL[level]}
        </span>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{DEPARTMENT_IDENTITY[deptKey]}</p>
    </div>
  );
}

export function DepartmentBudgetControls({
  leagueId,
  initial,
}: {
  leagueId: string;
  initial: DepartmentBudget;
}) {
  const router = useRouter();
  const [budget, setBudget] = useState<DepartmentBudget>(initial);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const total = departmentBudgetTotal(budget);
  const remaining = DEPARTMENT_BUDGET_TOTAL - total;
  const valid = isValidDepartmentBudget(budget);
  const dirty = DEPARTMENT_KEYS.some((key) => budget[key] !== initial[key]);

  function setLevel(key: DepartmentKey, level: DepartmentLevel) {
    setBudget((prev) => ({ ...prev, [key]: level }));
    setSaved(false);
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateDepartmentBudgetAction(leagueId, budget);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-baseline justify-between rounded-[2px] border border-rule bg-field p-4">
        <p className="text-sm font-semibold text-ink">
          {remaining === 0
            ? "Fully allocated"
            : remaining > 0
              ? `${remaining} point${remaining === 1 ? "" : "s"} unallocated`
              : `${Math.abs(remaining)} point${Math.abs(remaining) === 1 ? "" : "s"} over budget`}
        </p>
        <p className="text-sm font-medium text-ink-muted tabular-nums">
          {formatFinanceCents(totalDepartmentBudgetCostCents(budget))}/yr total
        </p>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Every point you give one department has to come from another - there&apos;s no such thing as
        funding everything at once.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DEPARTMENT_KEYS.map((key) => (
          <DepartmentRow
            key={key}
            deptKey={key}
            level={budget[key]}
            onChange={(level) => setLevel(key, level)}
            disabled={(delta) => {
              const index = departmentLevelIndex(budget[key]);
              const nextIndex = index + delta;
              if (
                nextIndex < DEPARTMENT_LEVEL_MIN_INDEX ||
                nextIndex > DEPARTMENT_LEVEL_MAX_INDEX
              ) {
                return true;
              }
              return false;
            }}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || !valid || isPending}
          className="rounded-[2px] bg-team-accent px-4 py-2 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save department budget"}
        </button>
        {saved && !dirty && <span className="text-sm text-positive">Saved.</span>}
        {dirty && !valid && (
          <span className="text-sm text-caution">Fully allocate the budget before saving.</span>
        )}
        <span className="text-xs text-ink-muted">
          Takes effect next season - a real budget decision, not an instant fix.
        </span>
      </div>
    </div>
  );
}
