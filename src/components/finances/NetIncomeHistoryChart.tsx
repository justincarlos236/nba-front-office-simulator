"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Recharts SVG props can't resolve CSS var() tokens - literals, same
// convention as the other chart components.
const COLORS = {
  border: "#232b36",
  muted: "#8b97a6",
  green: "#22c55e",
  red: "#ef4444",
};

export interface NetIncomePoint {
  season: number;
  /** Season net income in dollars (can be negative). */
  netIncome: number;
}

function seasonLabel(season: number): string {
  return `${season}-${(season + 1).toString().slice(-2)}`;
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
  payload?: { payload: NetIncomePoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground">{seasonLabel(point.season)}</p>
      <p className={point.netIncome < 0 ? "text-red-400" : "text-emerald-400"}>
        {point.netIncome < 0 ? "Net loss " : "Net profit "}
        {millionsSigned(point.netIncome)}
      </p>
    </div>
  );
}

/** Per-season profit/loss history - green bars for profit, red for loss. Empty gracefully before any season has been advanced. */
export function NetIncomeHistoryChart({ points }: { points: NetIncomePoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted">
        No profit/loss history yet - advance a season to start tracking it.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={points} margin={{ top: 10, right: 20, bottom: 0, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
        <XAxis
          dataKey="season"
          tickFormatter={seasonLabel}
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
        />
        <YAxis
          tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(0)}M`}
          stroke={COLORS.muted}
          tick={{ fill: COLORS.muted, fontSize: 12 }}
          width={52}
        />
        <ReferenceLine y={0} stroke={COLORS.muted} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="netIncome" radius={[2, 2, 0, 0]}>
          {points.map((p) => (
            <Cell key={p.season} fill={p.netIncome < 0 ? COLORS.red : COLORS.green} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
