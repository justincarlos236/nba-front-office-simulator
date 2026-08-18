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
import type { SentimentTrendPoint } from "@/lib/fans/sentimentLedger";

// Same literal-color convention as FanHappinessTrendChart.tsx - Recharts SVG
// props can't resolve var(--token) the way an inline `style` can.
// Recharts SVG props accept any valid CSS colour, including var(--token),
// so the accent line follows the league's franchise colour instead of a
// fixed orange baked into the chart.
const COLORS = {
  border: "var(--rule)",
  muted: "var(--ink-muted)",
  accent: "var(--team-accent)",
};

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SentimentTrendPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-[2px] border border-rule bg-raised px-3 py-2 text-xs">
      <p className="font-semibold text-ink">Day {point.dayIndex}</p>
      <p className="text-ink-muted">Fan Happiness: {point.fanHappiness}</p>
    </div>
  );
}

/**
 * the in-season counterpart to
 * FanHappinessTrendChart's once-a-season history, reconstructed from the
 * sentiment ledger (see buildInSeasonTrend in sentimentLedger.ts). This is
 * what fixes docs/FANS_PAGE_REDESIGN.md Part 2.6: FanHappinessSnapshot alone
 * could never show an in-season collapse or hot streak, only the final number.
 */
export function InSeasonSentimentTrendChart({ points }: { points: SentimentTrendPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-45 items-center justify-center rounded-[2px] border border-dashed border-rule text-sm text-ink-muted">
        Not enough has happened yet this season to chart a trend.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={points} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="dayIndex"
          tickFormatter={(d: number) => `Day ${d}`}
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
          type="stepAfter"
          dataKey="fanHappiness"
          stroke={COLORS.accent}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
