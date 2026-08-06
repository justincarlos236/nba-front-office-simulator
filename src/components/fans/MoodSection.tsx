import {
  MOOD_LABEL_TEXT,
  MOOD_LABEL_DESCRIPTION,
  trendDirection,
  type MoodLabel,
} from "@/lib/fans/moodLabel";
import { ScaleBar } from "@/components/dashboard/ScaleBar";

/**
 * Fans Page Redesign (Phase 2), Section 1 - "The Mood." Replaces the old
 * 2-card + 3-card stat block. Attendance/Merchandise/Season Tickets are
 * deliberately gone - all three were the same popularity-tier number
 * relabeled (docs/FANS_PAGE_REDESIGN.md Part 1.1/2.1), and Attendance/
 * Merchandise/Season Tickets already have a real home on /finances. What's
 * left is one honest headline (Fan Happiness, with real direction) plus
 * Franchise Popularity as a genuinely distinct secondary signal.
 */

const MOOD_ACCENT: Record<MoodLabel, string> = {
  EUPHORIC: "text-emerald-400",
  BOUGHT_IN: "text-emerald-400",
  CONTENT: "text-sky-400",
  RESTLESS: "text-amber-400",
  PATIENT: "text-sky-400",
  TURNING_ON_YOU: "text-red-400",
  HOSTILE: "text-red-400",
};

function TrendArrow({ delta, label }: { delta: number; label: string }) {
  const direction = trendDirection(delta);
  const symbol = direction === "UP" ? "↑" : direction === "DOWN" ? "↓" : "→";
  const color =
    direction === "UP" ? "text-emerald-400" : direction === "DOWN" ? "text-red-400" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      {symbol} {Math.abs(delta)} {label}
    </span>
  );
}

export function MoodSection({
  fanHappiness,
  moodLabel,
  recentTrendDelta,
  seasonOverSeasonDelta,
  franchisePopularity,
  popularityBuzzLabel,
  attendanceEvidenceLine,
}: {
  fanHappiness: number;
  moodLabel: MoodLabel;
  recentTrendDelta: number;
  seasonOverSeasonDelta: number | null;
  franchisePopularity: number;
  popularityBuzzLabel: string;
  attendanceEvidenceLine: string;
}) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs tracking-wide text-muted uppercase">Fan Happiness</p>
        <div className="mt-1 flex items-baseline gap-3">
          <p className="text-3xl font-bold text-foreground">{fanHappiness}</p>
          <p className={`text-lg font-semibold ${MOOD_ACCENT[moodLabel]}`}>
            {MOOD_LABEL_TEXT[moodLabel]}
          </p>
        </div>
        <p className="mt-2 text-xs text-muted">{MOOD_LABEL_DESCRIPTION[moodLabel]}</p>
        <ScaleBar value={fanHappiness} />
        <div className="mt-3 flex flex-wrap gap-3">
          <TrendArrow delta={recentTrendDelta} label="this stretch" />
          {seasonOverSeasonDelta !== null && (
            <TrendArrow delta={seasonOverSeasonDelta} label="vs. last season" />
          )}
        </div>
        <p className="mt-3 text-xs text-muted">{attendanceEvidenceLine}</p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-xs tracking-wide text-muted uppercase">Franchise Popularity</p>
        <p className="mt-1 text-3xl font-bold text-foreground">{franchisePopularity}</p>
        <p className="mt-1 text-xs text-muted">{popularityBuzzLabel}</p>
        <ScaleBar value={franchisePopularity} />
        <p className="mt-3 text-xs text-muted">
          National relevance - half fan happiness, half star power, adjusted for market size.
        </p>
      </div>
    </div>
  );
}
