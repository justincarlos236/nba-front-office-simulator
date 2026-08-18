"use client";

import { seasonLabel } from "@/lib/data-sources/datasetSeasons";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Recharts SVG props can't resolve CSS var() tokens, so theme colors are
// duplicated as literals here - same convention as FanHappinessTrendChart.tsx.
const COLORS = {
  border: "var(--rule)",
  muted: "var(--ink-muted)",
  green: "var(--positive)",
};

export interface FinancesTrendPoint {
  season: number;
  /** Franchise value in dollars. */
  franchiseValue: number;
  /** Season net income in dollars (can be negative). */
  netIncome: number;
}

function billions(dollars: number): string {
  return `$${(dollars / 1_000_000_000).toFixed(2)}B`;
}

function millionsSigned(dollars: number): string {
  const sign = dollars < 0 ? "-" : "+";
  return `${sign}$${(Math.abs(dollars) / 1_000_000).toFixed(1)}M`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: FinancesTrendPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-[2px] border border-rule bg-raised px-3 py-2 text-xs">
      <p className="font-semibold text-ink">{seasonLabel(point.season)}</p>
      <p className="text-ink-muted">Franchise value: {billions(point.franchiseValue)}</p>
      <p className={point.netIncome < 0 ? "text-negative" : "text-positive"}>
        Net income: {millionsSigned(point.netIncome)}
      </p>
    </div>
  );
}

/** Multi-season franchise-value history - empty gracefully for a league that hasn't advanced a season since finances shipped. */
export function FinancesTrendChart({ points }: { points: FinancesTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-55 items-center justify-center rounded-[2px] border border-dashed border-rule text-center text-sm text-ink-muted">
        No financial history yet - advance a season to start tracking franchise value over time.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={points} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="season"
          tickFormatter={seasonLabel}
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
        />
        <YAxis
          tickFormatter={(v: number) => `$${(v / 1_000_000_000).toFixed(1)}B`}
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
          width={56}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<ChartTooltip />} />
        <Line
          type="monotone"
          dataKey="franchiseValue"
          stroke={COLORS.green}
          strokeWidth={2}
          dot={{ fill: COLORS.green, r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
