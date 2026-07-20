"use client";

import { useMemo, useState, useTransition } from "react";
import { ApronLevel } from "@/lib/cap/apron";
import { signFreeAgentAction } from "@/lib/actions/freeagency";
import { validateSigning } from "@/lib/freeagency/validateSigning";
import { describeSigningFeasibility } from "@/lib/freeagency/describeSigningFeasibility";

export function SignOfferForm({
  season,
  leagueId,
  leaguePlayerId,
  suggestedSalaryCents,
  team,
}: {
  season: number;
  leagueId: string;
  leaguePlayerId: string;
  suggestedSalaryCents: string;
  team: { apronLevel: string; capSpaceCents: string };
}) {
  const [salaryDollars, setSalaryDollars] = useState(() =>
    Math.round(Number(suggestedSalaryCents) / 100),
  );
  const [years, setYears] = useState(2);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const offerSalaryCents = BigInt(Math.round(salaryDollars * 100));

  const result = useMemo(
    () =>
      validateSigning({
        season,
        offerSalaryCents,
        team: {
          apronLevel: team.apronLevel as ApronLevel,
          capSpaceCents: BigInt(team.capSpaceCents),
        },
      }),
    [season, offerSalaryCents, team],
  );
  const feasibility = useMemo(() => describeSigningFeasibility(result), [result]);

  function handleSubmit() {
    setSubmitError(null);
    startTransition(async () => {
      try {
        await signFreeAgentAction({
          leagueId,
          leaguePlayerId,
          offerSalaryCents: offerSalaryCents.toString(),
          years,
        });
      } catch (error) {
        if (error instanceof Error && error.message !== "NEXT_REDIRECT") {
          setSubmitError(error.message);
        }
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <label className="block">
        <span className="text-sm text-muted">First-year salary</span>
        <input
          type="number"
          min={0}
          step={100000}
          value={salaryDollars}
          onChange={(e) => setSalaryDollars(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-foreground outline-none focus:border-accent"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-muted">Contract length</span>
        <select
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-foreground outline-none focus:border-accent"
        >
          {[1, 2, 3, 4].map((y) => (
            <option key={y} value={y}>
              {y} year{y > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-6 border-t border-border pt-4">
        <p
          className={`text-sm font-medium ${feasibility.isValid ? "text-accent" : "text-red-400"}`}
        >
          {feasibility.headline}
        </p>

        {submitError && <p className="mt-3 text-sm text-red-400">{submitError}</p>}

        <button
          type="button"
          disabled={!result.isValid || isPending}
          onClick={handleSubmit}
          className="mt-4 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Signing..." : "Sign player"}
        </button>
      </div>
    </div>
  );
}
