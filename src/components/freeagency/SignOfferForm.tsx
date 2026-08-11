"use client";

import { useMemo, useState, useTransition } from "react";
import { HowDoesThisWork } from "@/components/guide/HowDoesThisWork";
import { ApronLevel, eligibleMidLevelException } from "@/lib/cap/apron";
import { getSeasonCapRules } from "@/lib/cap/constants";
import { formatCentsCompact } from "@/lib/money";
import { signFreeAgentAction } from "@/lib/actions/freeagency";
import { validateSigning } from "@/lib/freeagency/validateSigning";
import { describeSigningFeasibility } from "@/lib/freeagency/describeSigningFeasibility";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { ConfirmAction } from "@/components/ui/ConfirmAction";

export function SignOfferForm({
  season,
  leagueId,
  leaguePlayerId,
  playerName,
  suggestedSalaryCents,
  team,
  reSigningRights,
}: {
  season: number;
  leagueId: string;
  leaguePlayerId: string;
  /** Named in the confirmation step, so the commitment reads as a decision
   *  about a person rather than an anonymous form submit. */
  playerName: string;
  suggestedSalaryCents: string;
  team: { apronLevel: string; capSpaceCents: string; signingExceptionUsedCents: string };
  reSigningRights: { held: boolean; maxOfferCents: string };
}) {
  // Entered in millions, not dollars. Typing 4500000 to offer $4.5M invited a
  // zero-counting mistake on the one screen where a mistake is a signed
  // contract; every salary this form deals with is naturally read in millions.
  const [salaryMillions, setSalaryMillions] = useState(() =>
    Number((Number(suggestedSalaryCents) / 100 / 1_000_000).toFixed(2)),
  );
  const [years, setYears] = useState(2);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const offerSalaryCents = BigInt(Math.round(salaryMillions * 1_000_000 * 100));
  const signingExceptionUsedCents = BigInt(team.signingExceptionUsedCents);

  const result = useMemo(
    () =>
      validateSigning({
        season,
        offerSalaryCents,
        team: {
          apronLevel: team.apronLevel as ApronLevel,
          capSpaceCents: BigInt(team.capSpaceCents),
          signingExceptionUsedCents,
        },
        reSigningRights: {
          held: reSigningRights.held,
          maxOfferCents: BigInt(reSigningRights.maxOfferCents),
        },
      }),
    [season, offerSalaryCents, team, signingExceptionUsedCents, reSigningRights],
  );
  const feasibility = useMemo(() => describeSigningFeasibility(result), [result]);

  // Only meaningful once a team is over the cap and not hard-capped out of
  // every exception at the second apron - shown so the user can see
  // "Total / Used / Remaining" without needing to know CBA terminology,
  // per the design brief.
  const mleType = eligibleMidLevelException(team.apronLevel as ApronLevel);
  const exceptionTotalCents =
    mleType === "NON_TAXPAYER"
      ? getSeasonCapRules(season).nonTaxpayerMLECents
      : mleType === "TAXPAYER"
        ? getSeasonCapRules(season).taxpayerMLECents
        : 0n;
  const exceptionRemainingCents =
    exceptionTotalCents > signingExceptionUsedCents
      ? exceptionTotalCents - signingExceptionUsedCents
      : 0n;

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
    <div className="rounded-[2px] border border-rule bg-field p-6">
      <label className="block">
        <span className="text-sm text-ink-muted">
          First-year salary <span className="text-ink">(in millions)</span>
        </span>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-ink-muted">
            $
          </span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={salaryMillions}
            onChange={(e) => setSalaryMillions(Number(e.target.value))}
            className="w-full rounded-[2px] border border-rule bg-raised py-2 pr-10 pl-7 font-mono text-ink outline-none focus:border-rule-strong"
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-ink-muted">
            M
          </span>
        </div>
        <span className="mt-1 block text-xs text-ink-muted">
          Type <span className="font-mono text-ink">4.5</span> to offer{" "}
          <span className="font-mono text-ink">$4,500,000</span>.
        </span>
      </label>

      <label className="mt-4 block">
        <span className="text-sm text-ink-muted">Contract length</span>
        <select
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="mt-1 w-full rounded-[2px] border border-rule bg-raised px-3 py-2 text-ink outline-none focus:border-rule-strong"
        >
          {[1, 2, 3, 4].map((y) => (
            <option key={y} value={y}>
              {y} year{y > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>

      {(mleType === "NON_TAXPAYER" || mleType === "TAXPAYER") && (
        <div className="mt-4 rounded-[2px] border border-rule bg-raised p-3 text-xs">
          <p className="tracking-wide text-ink-muted uppercase">Signing Exception</p>
          <div className="mt-1.5 flex justify-between text-ink">
            <span>Total available</span>
            <span className="font-mono">{formatCentsCompact(exceptionTotalCents)}</span>
          </div>
          <div className="mt-1 flex justify-between text-ink-muted">
            <span>Already used this season</span>
            <span className="font-mono">{formatCentsCompact(signingExceptionUsedCents)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold text-team-accent">
            <span>Remaining</span>
            <span className="font-mono">{formatCentsCompact(exceptionRemainingCents)}</span>
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-rule pt-4">
        <p
          className={`text-sm font-medium ${feasibility.isValid ? "text-team-accent" : "text-negative"}`}
        >
          {feasibility.headline}
        </p>
        <HowDoesThisWork
          topic={reSigningRights.held ? "re-signing-rights" : "signing-exception"}
          openInNewTab
          className="mt-1 inline-block text-xs text-ink-muted underline hover:text-ink"
        />

        {submitError && (
          <div className="mt-3">
            <ErrorNotice error={submitError} />
          </div>
        )}

        {/* Was a hand-rolled two-step from the P0 safety pass; now the shared
            primitive, so the fifth irreversible action cannot be written
            differently from the first four. */}
        <div className="mt-4">
          <ConfirmAction
            label="Sign player"
            confirmLabel="Confirm signing"
            pendingLabel="Signing..."
            pending={isPending}
            disabled={!result.isValid}
            question={`Sign ${playerName} for ${years} ${years === 1 ? "year" : "years"} at ${formatCentsCompact(offerSalaryCents)} per season?`}
            consequence={`That commits ${formatCentsCompact(offerSalaryCents * BigInt(years))} in total salary against your cap through ${season + years - 1}. Contracts cannot be undone.`}
            onConfirm={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}
