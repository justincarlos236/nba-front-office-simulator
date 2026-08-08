import { getSeasonCapRules } from "@/lib/cap/constants";
import { formatCentsCompact } from "@/lib/money";
import type { SeasonProjection } from "@/lib/cap/multiYearProjection";
import { Label } from "@/components/ui/primitives";

/**
 * THE WIRE - the cap cliff, made visible.
 *
 * Multi-year commitments rendered as a row of four figures, which is exactly
 * the shape in which a cap cliff is invisible: the number that matters is not
 * any single season's payroll, it is where the wall is relative to the cap
 * line and how many players are still on the books when you hit it.
 *
 * Bars are drawn against each season's *own* projected cap, because the cap
 * rises: $180M is a crisis in one season and comfortable in another. The cap
 * line is drawn per column for that reason rather than as one flat rule.
 *
 * Every value comes from `computeMultiYearProjection` and `getSeasonCapRules`.
 * Nothing is extrapolated beyond what the contract table already says.
 */
export function ContractLadder({
  projections,
  className = "",
}: {
  projections: SeasonProjection[];
  className?: string;
}) {
  if (projections.length === 0) return null;

  // Scale headroom to whichever is larger - the biggest commitment or the
  // biggest cap - so a season above the cap still shows its overage.
  const maxCommitted = projections.reduce(
    (max, p) => (p.committedSalaryCents > max ? p.committedSalaryCents : max),
    0n,
  );
  const maxCap = projections.reduce((max, p) => {
    const cap = getSeasonCapRules(p.season).salaryCapCents;
    return cap > max ? cap : max;
  }, 0n);
  const ceiling = ((maxCommitted > maxCap ? maxCommitted : maxCap) * 115n) / 100n;

  const pct = (value: bigint) => (ceiling === 0n ? 0 : Number((value * 10000n) / ceiling) / 100);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Label>Committed salary ahead</Label>
        <span className="text-[11px] tracking-[0.09em] text-ink-muted uppercase">
          Against each season&apos;s cap
        </span>
      </div>

      <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${projections.length}, minmax(0, 1fr))` }}>
        {projections.map((p) => {
          const cap = getSeasonCapRules(p.season).salaryCapCents;
          const overCap = p.committedSalaryCents > cap;
          const barPct = pct(p.committedSalaryCents);
          const capPct = pct(cap);

          return (
            <div key={p.season} className="min-w-0">
              {/* The column. Height is the commitment; the dashed rule is that
                  season's cap, so crossing it is literally visible. A season
                  with nothing on the books is drawn as open space, not as an
                  empty box that reads like missing data. */}
              <div className="relative h-28 border-b border-rule">
                {p.committedSalaryCents === 0n ? (
                  <div className="absolute inset-x-0 bottom-0 flex h-full items-end justify-center pb-1">
                    <span className="text-[11px] font-semibold tracking-[0.09em] text-positive uppercase">
                      Open
                    </span>
                  </div>
                ) : (
                  <div
                    className={`absolute inset-x-0 bottom-0 border-t ${
                      overCap
                        ? "border-caution bg-caution/25"
                        : "border-team-accent bg-team-accent/20"
                    }`}
                    style={{ height: `${barPct}%` }}
                  />
                )}
                <div
                  className="absolute inset-x-0 border-t border-dashed border-rule-strong"
                  style={{ bottom: `${capPct}%` }}
                  aria-hidden="true"
                />
              </div>

              <p className="mt-2 font-mono text-[11px] tabular-nums text-ink">
                {formatCentsCompact(p.committedSalaryCents)}
              </p>
              <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
                {p.season}-{(p.season + 1).toString().slice(-2)}
              </p>
              <p className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-muted">
                {p.playersUnderContract} signed
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-2 text-[11px] tracking-[0.09em] text-ink-muted uppercase">
        <span className="inline-block w-6 border-t border-dashed border-rule-strong" />
        Projected salary cap
      </p>
    </div>
  );
}
