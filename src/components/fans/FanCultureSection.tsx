import {
  PATIENCE_TIER_LABEL,
  PATIENCE_TIER_DESCRIPTION,
  CEILING_TIER_LABEL,
  CEILING_TIER_DESCRIPTION,
  LOYALTY_TIER_LABEL,
  LOYALTY_TIER_DESCRIPTION,
  patienceTier,
  ceilingTier,
  loyaltyTier,
} from "@/lib/fans/cultureLabels";
import type { FanCultureFacts } from "@/lib/fans/fanCulture";

/**
 * Fans Page Redesign (Phase 3) - "who this city has become" (Part 3.0's
 * purpose sentence). Mood (Section 1) is weather; this is climate - three
 * slow-moving traits that persist across GM tenures, each explained with
 * the real facts that produced it, never a bare number.
 */

function TraitCard({
  title,
  value,
  tierLabel,
  tierDescription,
  facts,
}: {
  title: string;
  value: number;
  tierLabel: string;
  tierDescription: string;
  facts: string[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs tracking-wide text-muted uppercase">{title}</p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{value}/100</p>
      </div>
      <p className="mt-1 text-lg font-semibold text-foreground">{tierLabel}</p>
      <p className="mt-1 text-xs text-muted">{tierDescription}</p>
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
    </div>
  );
}

export function FanCultureSection({
  patience,
  expectationCeiling,
  loyalty,
  facts,
}: {
  patience: number;
  expectationCeiling: number;
  loyalty: number;
  facts: FanCultureFacts;
}) {
  const pTier = patienceTier(patience);
  const cTier = ceilingTier(expectationCeiling);
  const lTier = loyaltyTier(loyalty);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-foreground">Who This City Has Become</h2>
      <p className="mt-1 text-sm text-muted">
        Mood swings week to week. This is the fanbase&apos;s identity - built over years, and it
        changes how the same decision lands.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TraitCard
          title="Patience"
          value={patience}
          tierLabel={PATIENCE_TIER_LABEL[pTier]}
          tierDescription={PATIENCE_TIER_DESCRIPTION[pTier]}
          facts={facts.patience}
        />
        <TraitCard
          title="Expectation Ceiling"
          value={expectationCeiling}
          tierLabel={CEILING_TIER_LABEL[cTier]}
          tierDescription={CEILING_TIER_DESCRIPTION[cTier]}
          facts={facts.expectationCeiling}
        />
        <TraitCard
          title="Loyalty"
          value={loyalty}
          tierLabel={LOYALTY_TIER_LABEL[lTier]}
          tierDescription={LOYALTY_TIER_DESCRIPTION[lTier]}
          facts={facts.loyalty}
        />
      </div>
    </section>
  );
}
