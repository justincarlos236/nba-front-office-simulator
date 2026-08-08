import { getSeasonCapRules } from "@/lib/cap/constants";
import { formatCentsCompact } from "@/lib/money";
import { Label } from "@/components/ui/primitives";

/**
 * THE WIRE - the cap position, made spatial.
 *
 * This product's actual distinction is that it implements the real 2023 CBA:
 * the cap, the tax line, and both aprons, with different rules at every tier.
 * All of that rendered as one text label ("Luxury Tax") and a dollar figure -
 * the deepest thing in the codebase was the least visible thing on screen.
 *
 * The gauge lays the four real thresholds out in proportion and marks where
 * this team actually sits, so "how close am I to the second apron" becomes a
 * glance instead of arithmetic. Every value comes from `getSeasonCapRules`;
 * nothing here is invented.
 *
 * Deliberately not a progress bar: the bands are unequal in the real CBA and
 * the gauge shows them unequal. The distance from tax to first apron is small
 * and tight; that tightness is the point.
 */

interface Band {
  key: string;
  label: string;
  /** Upper bound of this band, in cents. */
  ceiling: bigint;
}

export function CapThresholdGauge({
  season,
  totalSalaryCents,
  /** Compact drops the scale labels - for a rail or a dense row. */
  compact = false,
}: {
  season: number;
  totalSalaryCents: bigint;
  compact?: boolean;
}) {
  const rules = getSeasonCapRules(season);

  // The scale deliberately does NOT start at zero. Every meaningful threshold
  // lives between roughly 80% and 100% of the second apron, so a $0-anchored
  // track spends two thirds of its width on empty space and crushes the four
  // lines that actually govern the rules into a sliver. The window starts a
  // little below the cap - the first point at which anything changes - and
  // ends a little past the second apron.
  const floor = (rules.salaryCapCents * 88n) / 100n;
  const ceiling = (rules.secondApronCents * 106n) / 100n;
  const span = ceiling - floor;

  const bands: Band[] = [
    { key: "room", label: "Cap room", ceiling: rules.salaryCapCents },
    { key: "over", label: "Over the cap", ceiling: rules.luxuryTaxCents },
    { key: "tax", label: "Luxury tax", ceiling: rules.firstApronCents },
    { key: "first", label: "First apron", ceiling: rules.secondApronCents },
    { key: "second", label: "Second apron", ceiling },
  ];

  /** Position within the visible window, clamped so an outlier still reads. */
  const pct = (value: bigint) => {
    if (value <= floor) return 0;
    if (value >= ceiling) return 100;
    return Number(((value - floor) * 10000n) / span) / 100;
  };

  // Which band the team is actually in - drives the emphasis, so the tier you
  // are standing in is the one that reads.
  const activeIndex = bands.findIndex((b) => totalSalaryCents < b.ceiling);
  const active = activeIndex === -1 ? bands.length - 1 : activeIndex;

  const position = Math.min(100, pct(totalSalaryCents));

  // Tone escalates with real consequence: cap room is an opportunity, the
  // second apron is a hard-capped cliff.
  const BAND_TONE = [
    "bg-positive/25",
    "bg-raised",
    "bg-caution/20",
    "bg-caution/35",
    "bg-negative/30",
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Label>Cap position</Label>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
          {formatCentsCompact(totalSalaryCents)}
        </span>
      </div>

      {/* The track. Bands sized to the real gaps between real thresholds. */}
      <div className="relative mt-3">
        <div className="flex h-7 w-full overflow-hidden border border-rule">
          {bands.map((band, i) => {
            const floor = i === 0 ? 0n : bands[i - 1].ceiling;
            const width = pct(band.ceiling) - pct(floor);
            return (
              <div
                key={band.key}
                style={{ width: `${width}%` }}
                className={`h-full border-r border-hairline last:border-r-0 ${BAND_TONE[i]} ${
                  i === active ? "" : "opacity-40"
                }`}
              />
            );
          })}
        </div>

        {/* Where this team actually sits. */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-ink"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        />
        <div
          className="absolute -top-1 h-2 w-2 -translate-x-1/2 rotate-45 border-t border-l border-ink bg-ink"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Compact still needs to say which lines it is showing, or the bands
          are decoration. Ticks only, no figures - the rail is narrow. */}
      {compact && (
        <div className="relative mt-1 h-4">
          {[
            { label: "Cap", value: rules.salaryCapCents },
            { label: "Tax", value: rules.luxuryTaxCents },
            { label: "A1", value: rules.firstApronCents },
            { label: "A2", value: rules.secondApronCents },
          ].map((t) => (
            <span
              key={t.label}
              className="absolute top-0 -translate-x-1/2 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase"
              style={{ left: `${pct(t.value)}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      {/* Threshold scale. The four numbers that actually govern the rules. */}
      {!compact && (
        <div className="relative mt-1.5 h-8">
          {[
            { label: "Cap", value: rules.salaryCapCents },
            { label: "Tax", value: rules.luxuryTaxCents },
            { label: "Apron 1", value: rules.firstApronCents },
            { label: "Apron 2", value: rules.secondApronCents },
          ].map((t) => (
            <div
              key={t.label}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${pct(t.value)}%` }}
            >
              <span className="h-1.5 w-px bg-rule" />
              <span className="mt-0.5 text-[11px] font-semibold tracking-[0.09em] whitespace-nowrap text-ink-muted uppercase">
                {t.label}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className={`${compact ? "mt-2" : "mt-1"} text-[15px] text-ink`}>
        <span className="font-semibold">{bands[active].label}</span>
      </p>
    </div>
  );
}
