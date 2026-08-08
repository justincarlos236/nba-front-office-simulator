"use client";

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

// Recharts SVG props (stroke/fill/etc.) are plain attributes, not CSS -
// they can't resolve var(--token) the way an inline `style` can, so the
// theme colors are duplicated here as literals (see globals.css).
const COLORS = {
  border: "var(--rule)",
  muted: "var(--ink-muted)",
  accent: "var(--team-accent)",
};

export interface RosterChartPoint {
  name: string;
  minutesPerGame: number;
  rating: number;
  pointsPerGame: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RosterChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-[2px] border border-rule bg-raised px-3 py-2 text-xs">
      <p className="font-semibold text-ink">{point.name}</p>
      <p className="text-ink-muted">
        Rating {point.rating} &middot; {point.minutesPerGame.toFixed(1)} MPG &middot;{" "}
        {point.pointsPerGame.toFixed(1)} PPG
      </p>
    </div>
  );
}

/**
 * Minutes vs. valuation-model rating: quickly surfaces efficient
 * low-minutes contributors (top-left) and heavily-used, lower-rated
 * players (bottom-right) - the kind of scouting question a raw stats
 * table doesn't answer at a glance.
 */
export function RosterScatterChart({ points }: { points: RosterChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          type="number"
          dataKey="minutesPerGame"
          name="Minutes/game"
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
          label={{
            value: "Minutes / game",
            position: "insideBottom",
            offset: -5,
            fill: COLORS.muted,
            fontSize: 12,
          }}
        />
        <YAxis
          type="number"
          dataKey="rating"
          name="Rating"
          domain={[0, 100]}
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
          label={{
            value: "Rating",
            angle: -90,
            position: "insideLeft",
            fill: COLORS.muted,
            fontSize: 12,
          }}
        />
        <ZAxis type="number" dataKey="pointsPerGame" range={[40, 260]} />
        <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={points} fill={COLORS.accent} fillOpacity={0.8} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
