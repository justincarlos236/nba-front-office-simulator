import { seasonLabel } from "@/lib/data-sources/datasetSeasons";
("use client");

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Recharts SVG props (stroke/fill/etc.) accept any valid CSS colour string,
// including var(--token) - unlike a Tailwind class, these read the live
// custom property, so the accent line here follows the league's own
// franchise colour rather than a fixed orange baked into the chart.
const COLORS = {
  border: "var(--rule)",
  muted: "var(--ink-muted)",
  accent: "var(--team-accent)",
};

export interface FanHappinessTrendPoint {
  season: number;
  fanHappiness: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: FanHappinessTrendPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-[2px] border border-rule bg-raised px-3 py-2 text-xs">
      <p className="font-semibold text-ink">{seasonLabel(point.season)}</p>
      <p className="text-ink-muted">Fan Happiness: {point.fanHappiness}</p>
    </div>
  );
}

/** Multi-season Fan Happiness history - empty gracefully for a league that hasn't advanced a season since this shipped, rather than crashing on no data. */
export function FanHappinessTrendChart({ points }: { points: FanHappinessTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-[2px] border border-dashed border-rule text-sm text-ink-muted">
        No history yet - advance a season to start tracking fan sentiment over time.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="season"
          tickFormatter={seasonLabel}
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
        />
        <YAxis
          domain={[0, 100]}
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="fanHappiness"
          stroke={COLORS.accent}
          strokeWidth={2}
          dot={{ fill: COLORS.accent, r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
