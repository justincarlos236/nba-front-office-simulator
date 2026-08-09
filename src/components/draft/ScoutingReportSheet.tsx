import { Artifact, ArtifactHead } from "@/components/ui/Artifact";
import {
  BUST_RISK_LABEL,
  TRAJECTORY_LABEL,
  WORK_ETHIC_LABEL,
  READINESS_LABEL,
  INJURY_OUTLOOK_LABEL,
  SCOUTING_REPORT_CONFIDENCE_LABEL,
  type ScoutingReport,
  type ScoutingReportConfidence,
} from "@/lib/draft/scoutingProfile";

/**
 * THE WIRE - Artifact. The scouting report as the document it is.
 *
 * The data model here is genuinely good and the rendering was throwing it
 * away. Five confidence tiers, and every single axis can come back UNCERTAIN -
 * that is the most interesting thing about scouting, because the job is making
 * a decision on incomplete information. It was rendering as six identical grey
 * `<p>` tags with a small label in the corner, which states the uncertainty
 * without ever letting the user *feel* it.
 *
 * So confidence drives the sheet's typography rather than sitting beside it:
 *
 *   - a resolved finding is set in ink, at full weight
 *   - an UNCERTAIN axis is set in rule (dimmer than muted) and italic, the way
 *     a real report hedges a line it cannot yet stand behind
 *   - the whole sheet's stamp says how much of it to trust at all
 *
 * A SPECULATIVE report and a DEFINITIVE one are different documents, and now
 * they look it, without a single number changing.
 */

/** The stamp in the letterhead: how much of this sheet to believe. */
const CONFIDENCE_TONE: Record<ScoutingReportConfidence, string> = {
  SPECULATIVE: "border-negative text-negative",
  ROUGH_READ: "border-caution text-caution",
  SOLID_READ: "border-rule text-ink-muted",
  HIGH_CONFIDENCE: "border-positive text-positive",
  DEFINITIVE: "border-positive text-positive",
};

/**
 * How complete the file is, as a fraction of resolved axes. A real front office
 * knows how much of a report is actually filled in, and the sheet should say so
 * before anyone acts on it.
 */
function resolvedCount(report: ScoutingReport): { resolved: number; total: number } {
  const axes = [
    report.bustRisk,
    report.trajectory,
    report.workEthic,
    report.readiness,
    report.injuryOutlook,
  ];
  return { resolved: axes.filter((a) => a !== "UNCERTAIN").length, total: axes.length };
}

function Finding({
  label,
  value,
  uncertain,
}: {
  label: string;
  value: string;
  /** Taken from the axis itself, never inferred from the copy - a label
      rewrite must not be able to silently change how the sheet reads. */
  uncertain: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hairline py-2 last:border-b-0">
      <span className="shrink-0 text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
        {label}
      </span>
      <span
        className={
          uncertain
            ? "text-right text-[15px] text-rule italic"
            : "text-right text-[15px] font-medium text-ink"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function ScoutingReportSheet({
  report,
  prospectName,
  className = "",
}: {
  report: ScoutingReport;
  prospectName: string;
  className?: string;
}) {
  const { resolved, total } = resolvedCount(report);

  return (
    <Artifact tone="official" className={className}>
      {/* Accented: your own scouting department issued this, unlike a league
          ruling, which deliberately does not wear the franchise's colour. */}
      <ArtifactHead
        issuer="Scouting department"
        title="Prospect evaluation"
        reference={prospectName}
        accented
      />

      <div className="px-5 pt-4 pb-5">
        {/* The stamp. A report you cannot stand behind should look like one. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
          <span
            className={`border px-2 py-1 text-[11px] font-semibold tracking-[0.09em] uppercase ${
              CONFIDENCE_TONE[report.confidence]
            }`}
          >
            {SCOUTING_REPORT_CONFIDENCE_LABEL[report.confidence]}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">
            {resolved}/{total} resolved
          </span>
        </div>

        {/* Ceiling first: it is the only figure here that is always known, and
            it is what a war room argues about. */}
        <div className="mt-4 border-b border-rule pb-4">
          <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-muted uppercase">
            Projected ceiling
          </p>
          <p className="mt-1 font-mono text-[clamp(1.5rem,3vw,2rem)] tabular-nums text-ink">
            {report.ceilingRangeLabel}
          </p>
        </div>

        <div className="mt-2">
          <Finding
            label="Bust risk"
            value={BUST_RISK_LABEL[report.bustRisk]}
            uncertain={report.bustRisk === "UNCERTAIN"}
          />
          <Finding
            label="Trajectory"
            value={TRAJECTORY_LABEL[report.trajectory]}
            uncertain={report.trajectory === "UNCERTAIN"}
          />
          <Finding
            label="Work ethic"
            value={WORK_ETHIC_LABEL[report.workEthic]}
            uncertain={report.workEthic === "UNCERTAIN"}
          />
          <Finding
            label="Readiness"
            value={READINESS_LABEL[report.readiness]}
            uncertain={report.readiness === "UNCERTAIN"}
          />
          <Finding
            label="Injury outlook"
            value={INJURY_OUTLOOK_LABEL[report.injuryOutlook]}
            uncertain={report.injuryOutlook === "UNCERTAIN"}
          />
        </div>

        {resolved < total && (
          <p className="mt-4 border-t border-dashed border-rule pt-3 text-[13px] leading-relaxed text-ink-muted">
            {total - resolved === 1
              ? "One axis is still unresolved. More scouting would settle it."
              : `${total - resolved} axes are still unresolved. More scouting would settle them.`}
          </p>
        )}
      </div>
    </Artifact>
  );
}
