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
const COLORS = {
  border: "#232b36",
  muted: "#8b97a6",
  accent: "#ff7a1a",
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
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">Day {point.dayIndex}</p>
      <p className="text-muted">Fan Happiness: {point.fanHappiness}</p>
    </div>
  );
}

/**
 * Fans Page Redesign (Phase 1) - the in-season counterpart to
 * FanHappinessTrendChart's once-a-season history, reconstructed from the
 * sentiment ledger (see buildInSeasonTrend in sentimentLedger.ts). This is
 * what fixes docs/FANS_PAGE_REDESIGN.md Part 2.6: FanHappinessSnapshot alone
 * could never show an in-season collapse or hot streak, only the final number.
 */
export function InSeasonSentimentTrendChart({ points }: { points: SentimentTrendPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
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
