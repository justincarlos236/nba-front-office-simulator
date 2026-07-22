"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Recharts SVG props (stroke/fill/etc.) are plain attributes, not CSS -
// they can't resolve var(--token) the way an inline `style` can, so the
// theme colors are duplicated here as literals (see globals.css) - same
// convention as RosterScatterChart.tsx.
const COLORS = {
  border: "#232b36",
  muted: "#8b97a6",
  accent: "#ff7a1a",
};

export interface FanHappinessTrendPoint {
  season: number;
  fanHappiness: number;
}

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
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
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{seasonLabel(point.season)}</p>
      <p className="text-muted">Fan Happiness: {point.fanHappiness}</p>
    </div>
  );
}

/** Multi-season Fan Happiness history - empty gracefully for a league that hasn't advanced a season since this shipped, rather than crashing on no data. */
export function FanHappinessTrendChart({ points }: { points: FanHappinessTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
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
