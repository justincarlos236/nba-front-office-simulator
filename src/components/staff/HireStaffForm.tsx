"use client";

import { useState, useTransition } from "react";
import { formatCentsCompact } from "@/lib/money";
import { hireStaffAction } from "@/lib/actions/staff";
import { ErrorNotice } from "@/components/ui/ErrorNotice";

export function HireStaffForm({
  leagueId,
  staffId,
  suggestedAnnualSalaryCents,
  minAcceptableAnnualSalaryCents,
}: {
  leagueId: string;
  staffId: string;
  suggestedAnnualSalaryCents: string;
  minAcceptableAnnualSalaryCents: string;
}) {
  const [salaryDollars, setSalaryDollars] = useState(() =>
    Math.round(Number(suggestedAnnualSalaryCents) / 100),
  );
  const [years, setYears] = useState(2);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const annualSalaryCents = BigInt(Math.round(salaryDollars * 100));
  const belowMinimum = annualSalaryCents < BigInt(minAcceptableAnnualSalaryCents);

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      try {
        await hireStaffAction({
          leagueId,
          staffId,
          years,
          annualSalaryCents: annualSalaryCents.toString(),
        });
      } catch (error) {
        if (error instanceof Error && error.message !== "NEXT_REDIRECT") {
          setSubmitError(error.message);
        }
      }
    });
  }

  return (
    <div className="rounded-[2px] border border-rule bg-field p-6">
      <label className="block">
        <span className="text-sm text-ink-muted">Annual salary</span>
        <input
          type="number"
          min={0}
          step={50000}
          value={salaryDollars}
          onChange={(e) => setSalaryDollars(Number(e.target.value))}
          className="mt-1 w-full rounded-[2px] border border-rule bg-raised px-3 py-2 font-mono text-ink outline-none focus:border-team-accent"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-ink-muted">Contract length</span>
        <select
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="mt-1 w-full rounded-[2px] border border-rule bg-raised px-3 py-2 text-ink outline-none focus:border-team-accent"
        >
          {[1, 2, 3, 4].map((y) => (
            <option key={y} value={y}>
              {y} year{y > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-4 text-xs text-ink-muted">
        Won&apos;t accept below {formatCentsCompact(BigInt(minAcceptableAnnualSalaryCents))}/year
        given their reputation.
      </p>

      {belowMinimum && (
        <p className="mt-2 text-sm font-medium text-negative">
          This offer is too low to be accepted.
        </p>
      )}

      {submitError && (
        <div className="mt-3">
          <ErrorNotice error={submitError} />
        </div>
      )}

      <button
        type="button"
        disabled={belowMinimum || isPending}
        onClick={handleSubmit}
        className="mt-4 rounded-[2px] bg-team-accent px-6 py-2.5 text-sm font-semibold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending ? "Hiring..." : "Hire"}
      </button>
    </div>
  );
}
