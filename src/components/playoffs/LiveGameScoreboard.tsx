"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveGameResult, LiveTeamInfo } from "@/components/playoffs/LiveGameExperience";

// Presentational-only pacing constants - none of these affect the
// underlying simulation, which is already fully decided by the time this
// component mounts (see playLiveSeriesGameAction). They only control how
// quickly an already-known result is revealed.
const TICKS_PER_PERIOD = 6;
const REGULATION_SECONDS = 12 * 60;
const OVERTIME_SECONDS = 5 * 60;
const BASE_TICK_DELAY_MS = 850;
const PERIOD_TRANSITION_DELAY_MS = 1400;
const FINAL_DELAY_MS = 1800;

const SPEED_MULTIPLIERS = { "1x": 1, "2x": 2, "4x": 4, Fast: 10 } as const;
type SpeedLabel = keyof typeof SPEED_MULTIPLIERS;

const COUNTING_STATS = ["points", "rebounds", "assists", "steals", "blocks", "turnovers"] as const;
type CountingStat = (typeof COUNTING_STATS)[number];
type StatTotals = Record<CountingStat, number>;

function emptyTotals(): StatTotals {
  return { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0 };
}

/** Splits `total` across `count` ticks with random-but-plausible variance, always summing back to exactly `total` (largest-remainder rounding, same technique the server's own per-period stat allocator uses). */
function splitIntoTicks(total: number, count: number): number[] {
  const weights = Array.from({ length: count }, () => 0.4 + Math.random());
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const raw = weights.map((w) => (w / totalWeight) * total);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((s, f) => s + f, 0);
  const byFraction = raw
    .map((r, i) => ({ index: i, fraction: r - floors[i] }))
    .sort((a, b) => b.fraction - a.fraction);
  const result = [...floors];
  for (let k = 0; k < remainder && byFraction.length > 0; k++) {
    result[byFraction[k % byFraction.length].index] += 1;
  }
  return result;
}

function formatClock(periodSeconds: number, ticksElapsed: number, totalTicks: number): string {
  const remaining = Math.max(0, Math.round(periodSeconds * (1 - ticksElapsed / totalTicks)));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function periodLabel(index: number, quarterCount: number): string {
  if (index < quarterCount) return ["1st", "2nd", "3rd", "4th"][index] + " Quarter";
  const otNumber = index - quarterCount + 1;
  return otNumber === 1
    ? "Overtime"
    : `${otNumber}${otNumber === 2 ? "nd" : otNumber === 3 ? "rd" : "th"} Overtime`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function LiveGameScoreboard({
  result,
  homeTeam,
  awayTeam,
  onComplete,
}: {
  result: LiveGameResult;
  homeTeam: LiveTeamInfo;
  awayTeam: LiveTeamInfo;
  onComplete: () => void;
}) {
  const periods = useMemo(
    () => [...result.quarters, ...result.overtimes],
    [result.quarters, result.overtimes],
  );
  // Generated once per mount so a mid-game speed change never reshuffles
  // already-decided (if not yet revealed) score progression - only the
  // delay between ticks is speed-dependent.
  const ticksByPeriod = useMemo(
    () =>
      periods.map((p) => ({
        home: splitIntoTicks(p.home, TICKS_PER_PERIOD),
        away: splitIntoTicks(p.away, TICKS_PER_PERIOD),
      })),
    [periods],
  );

  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(0);
  const [clockLabel, setClockLabel] = useState(
    formatClock(REGULATION_SECONDS, 0, TICKS_PER_PERIOD),
  );
  const [banner, setBanner] = useState<string | null>("1st Quarter");
  const [playerTotals, setPlayerTotals] = useState<Map<string, StatTotals>>(new Map());
  const [isFinal, setIsFinal] = useState(false);
  const [speed, setSpeed] = useState<SpeedLabel>("2x");
  const [isPaused, setIsPaused] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionResolved, setSuggestionResolved] = useState(false);

  const speedRef = useRef(speed);
  const pausedRef = useRef(isPaused);
  const simToEndRef = useRef(false);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  async function waitTicks(ms: number) {
    let remaining = ms;
    while (remaining > 0) {
      if (simToEndRef.current) return;
      if (pausedRef.current) {
        await sleep(60);
        continue;
      }
      const chunk = Math.min(60, remaining);
      await sleep(chunk / SPEED_MULTIPLIERS[speedRef.current]);
      remaining -= chunk;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function reveal() {
      let runningHome = 0;
      let runningAway = 0;
      const totals = new Map<string, StatTotals>();

      for (let p = 0; p < periods.length; p++) {
        if (cancelled) return;
        setPeriodIndex(p);
        if (p === 2) {
          setBanner("Halftime");
          await waitTicks(PERIOD_TRANSITION_DELAY_MS);
          if (cancelled) return;
        }
        setBanner(periodLabel(p, result.quarters.length));
        await waitTicks(600);
        setBanner(null);

        for (let t = 0; t < TICKS_PER_PERIOD; t++) {
          if (cancelled) return;
          if (simToEndRef.current) break;
          runningHome += ticksByPeriod[p].home[t];
          runningAway += ticksByPeriod[p].away[t];
          setHomeScore(runningHome);
          setAwayScore(runningAway);
          setClockLabel(
            formatClock(
              p < result.quarters.length ? REGULATION_SECONDS : OVERTIME_SECONDS,
              t + 1,
              TICKS_PER_PERIOD,
            ),
          );

          const margin = Math.abs(runningHome - runningAway);
          const isLateAndClose = p >= 3 && margin <= 8 && t >= TICKS_PER_PERIOD - 2;
          if (isLateAndClose && !suggestionResolved) {
            setSuggestion("This one's close - slow to 1x for the stretch run?");
          }

          await waitTicks(BASE_TICK_DELAY_MS);
        }

        if (simToEndRef.current) break;

        const periodStats = result.perPeriodStats[p] ?? [];
        for (const line of periodStats) {
          const prev = totals.get(line.leaguePlayerId) ?? emptyTotals();
          const next: StatTotals = { ...prev };
          for (const stat of COUNTING_STATS) next[stat] = prev[stat] + line[stat];
          totals.set(line.leaguePlayerId, next);
        }
        setPlayerTotals(new Map(totals));

        await waitTicks(PERIOD_TRANSITION_DELAY_MS);
      }

      if (cancelled) return;

      // Sim to End (or the natural end of the loop) - land on the exact
      // authoritative final numbers, never a value derived from the
      // cosmetic tick animation.
      setHomeScore(result.finalHomeScore);
      setAwayScore(result.finalAwayScore);
      setPeriodIndex(periods.length - 1);
      const finalTotals = new Map<string, StatTotals>();
      for (const line of result.boxScore) {
        finalTotals.set(line.leaguePlayerId, {
          points: line.points,
          rebounds: line.rebounds,
          assists: line.assists,
          steals: line.steals,
          blocks: line.blocks,
          turnovers: line.turnovers,
        });
      }
      setPlayerTotals(finalTotals);
      setBanner("Final");
      setIsFinal(true);
      setSuggestion(null);

      // A plain, unconditional sleep (not waitTicks) - even "Sim to End"
      // should hold on the final score for a moment rather than jumping
      // straight to the postgame summary with zero visual feedback.
      await sleep(Math.min(FINAL_DELAY_MS, 500));
      if (!cancelled) onComplete();
    }

    reveal();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topPerformers = [...playerTotals.entries()]
    .map(([leaguePlayerId, stats]) => {
      const line = result.boxScore.find((l) => l.leaguePlayerId === leaguePlayerId);
      return { leaguePlayerId, name: line?.playerName ?? "Player", ...stats };
    })
    .sort((a, b) => b.points - a.points)
    .slice(0, 4);

  function acceptSuggestion() {
    setSpeed("1x");
    setSuggestion(null);
    setSuggestionResolved(true);
  }
  function dismissSuggestion() {
    setSuggestion(null);
    setSuggestionResolved(true);
  }

  return (
    <div className="mt-8">
      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center justify-center gap-8">
          <ScoreSide team={awayTeam} score={awayScore} />
          <div className="text-center">
            <p className="font-mono text-sm text-muted">{clockLabel}</p>
            <p className="mt-1 text-xs font-semibold tracking-wide text-accent uppercase">
              {banner ?? periodLabel(periodIndex, result.quarters.length)}
            </p>
          </div>
          <ScoreSide team={homeTeam} score={homeScore} />
        </div>

        {suggestion && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm">
            <span className="text-foreground">{suggestion}</span>
            <button
              type="button"
              onClick={acceptSuggestion}
              className="rounded-md bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-500/30"
            >
              Slow to 1x
            </button>
            <button
              type="button"
              onClick={dismissSuggestion}
              className="text-xs text-muted hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {(Object.keys(SPEED_MULTIPLIERS) as SpeedLabel[]).map((label) => (
            <button
              key={label}
              type="button"
              disabled={isFinal}
              onClick={() => {
                setSpeed(label);
                setIsPaused(false);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                speed === label && !isPaused
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border text-foreground hover:bg-surface-2"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={isFinal}
            onClick={() => setIsPaused((p) => !p)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
              isPaused
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-foreground hover:bg-surface-2"
            }`}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            disabled={isFinal}
            onClick={() => {
              simToEndRef.current = true;
              setIsPaused(false);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Sim to End
          </button>
        </div>
      </div>

      {topPerformers.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            Leading performers
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {topPerformers.map((p) => (
              <div key={p.leaguePlayerId} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{p.name}</span>
                <span className="font-mono text-muted">
                  {p.points}p {p.rebounds}r {p.assists}a
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreSide({ team, score }: { team: LiveTeamInfo; score: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {team.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logoUrl} alt="" className="h-14 w-14 object-contain" />
      )}
      <p className="max-w-[8rem] truncate text-center text-sm font-semibold text-foreground">
        {team.label}
      </p>
      <p className="font-mono text-4xl font-black text-foreground tabular-nums">{score}</p>
    </div>
  );
}
