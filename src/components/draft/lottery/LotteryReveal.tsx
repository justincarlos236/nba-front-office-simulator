"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TeamBadge } from "./TeamBadge";
import type { LotteryResultPayload, DraftLotteryResult } from "@/lib/actions/draftLottery";

// Presentational-only pacing - the lottery result is already fully decided
// server-side by the time this component mounts (see runDraftLotteryAction);
// none of this affects the outcome, only how quickly it's shown. Later
// picks (closer to No. 1) get a longer base delay so the reveal naturally
// builds suspense, mirroring the real broadcast's pacing.
function baseDelayForPick(pickNumber: number): number {
  if (pickNumber === 1) return 3200;
  if (pickNumber <= 4) return 2200;
  if (pickNumber <= 8) return 1400;
  return 900;
}
function settleDelayForPick(pickNumber: number): number {
  if (pickNumber === 1) return 1400;
  if (pickNumber <= 4) return 800;
  return 350;
}

const SPEED_MULTIPLIERS = { "1x": 1, "2x": 2, "4x": 4, Fast: 10 } as const;
type SpeedLabel = keyof typeof SPEED_MULTIPLIERS;
type Mode = "auto" | "manual";

const NOTABLE_MOVEMENT_THRESHOLD = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pickSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function LotteryReveal({
  result,
  onComplete,
}: {
  result: DraftLotteryResult;
  onComplete: () => void;
}) {
  // Reveal order: pick 14 first, pick 1 last - the climax.
  const revealOrder = useMemo(
    () => [...result.results].sort((a, b) => b.resultPickNumber - a.resultPickNumber),
    [result.results],
  );

  const [revealedCount, setRevealedCount] = useState(0);
  const [current, setCurrent] = useState<LotteryResultPayload | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [speed, setSpeed] = useState<SpeedLabel>("2x");
  const [isPaused, setIsPaused] = useState(false);

  const modeRef = useRef(mode);
  const speedRef = useRef(speed);
  const pausedRef = useRef(isPaused);
  const simToEndRef = useRef(false);
  const manualResolverRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
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

  function waitForManualAdvance(): Promise<void> {
    if (simToEndRef.current) return Promise.resolve();
    return new Promise((resolve) => {
      manualResolverRef.current = resolve;
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function reveal() {
      for (let i = 0; i < revealOrder.length; i++) {
        if (cancelled) return;
        if (simToEndRef.current) break;

        const entry = revealOrder[i];

        if (modeRef.current === "manual") {
          await waitForManualAdvance();
        } else {
          await waitTicks(baseDelayForPick(entry.resultPickNumber));
        }
        if (cancelled) return;
        if (simToEndRef.current) break;

        setRevealedCount(i + 1);
        setCurrent(entry);
        await waitTicks(settleDelayForPick(entry.resultPickNumber));
      }

      if (cancelled) return;

      // Sim to End (or the natural end) - land on the exact authoritative
      // list, never a value derived from the reveal animation itself.
      setRevealedCount(revealOrder.length);
      setCurrent(revealOrder[revealOrder.length - 1] ?? null);
      setIsFinal(true);

      // A plain, unconditional sleep - even skipping to the end should
      // hold on the final pick for a beat rather than jumping straight to
      // results with zero visual feedback.
      await sleep(600);
      if (!cancelled) onComplete();
    }

    reveal();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleManualAdvance() {
    manualResolverRef.current?.();
    manualResolverRef.current = null;
  }

  function handleSkipToEnd() {
    simToEndRef.current = true;
    setIsPaused(false);
    manualResolverRef.current?.();
    manualResolverRef.current = null;
  }

  const revealed = revealOrder.slice(0, revealedCount);
  const userTrackedTeams = result.results.filter((r) => r.isUserTeam);

  const movement = current ? current.movement : 0;
  const isBigJump = current ? movement >= NOTABLE_MOVEMENT_THRESHOLD : false;
  const isBigFall = current ? movement <= -NOTABLE_MOVEMENT_THRESHOLD : false;
  const isClimax = current?.resultPickNumber === 1;
  const isUserTopFour = Boolean(current?.isUserTeam && current.resultPickNumber <= 4);

  return (
    <div>
      {/* The current reveal - the hero moment */}
      <div
        className={`relative overflow-hidden rounded-[2px] border p-8 text-center transition-all ${
          isClimax
            ? "border-team-accent bg-team-accent/5"
            : current?.isUserTeam
              ? "border-team-accent/60 bg-team-accent/5"
              : "border-rule bg-field"
        }`}
        style={
          isClimax && current
            ? ({ "--lottery-glow": current.primaryColor } as React.CSSProperties)
            : undefined
        }
      >
        <p
          className={`text-xs font-semibold tracking-widest uppercase ${isClimax ? "text-team-accent" : "text-ink-muted"}`}
        >
          {current?.resultPickNumber === 1
            ? "The No. 1 Overall Pick"
            : current
              ? `Pick ${current.resultPickNumber}`
              : "Get ready..."}
        </p>

        {current ? (
          <div
            key={current.currentOwnerTeamId + current.resultPickNumber}
            className={`mt-4 flex flex-col items-center gap-3 animate-lottery-card-in ${
              isClimax ? "animate-lottery-glow-pulse rounded-[2px] p-4" : ""
            }`}
          >
            <TeamBadge logoUrl={current.logoUrl} size={isClimax ? "xl" : "lg"} />
            <p className={`font-bold text-ink ${isClimax ? "text-3xl" : "text-xl"}`}>
              {current.currentOwnerLabel}
            </p>
            {current.ownedByAnotherTeam && (
              <p className="text-xs text-ink-muted">via {current.originalTeamLabel}&apos;s pick</p>
            )}
            {current.isUserTeam && (
              <span className="rounded-full bg-team-accent/15 px-3 py-1 text-xs font-bold text-team-accent">
                YOUR TEAM
              </span>
            )}

            {(isBigJump || isBigFall) && (
              <p
                className={`text-sm font-semibold ${isBigJump ? "text-positive" : "text-negative"}`}
              >
                {isBigJump ? "▲" : "▼"} {isBigJump ? "Jumps" : "Falls"} {Math.abs(movement)} spot
                {Math.abs(movement) === 1 ? "" : "s"} from a projected {current.projectedSeed}
                {pickSuffix(current.projectedSeed)}
              </p>
            )}

            {isUserTopFour && (
              <div className="animate-lottery-banner-in mt-2 rounded-[2px] border border-team-accent bg-team-accent/15 px-4 py-2">
                <p className="text-sm font-black tracking-wide text-team-accent uppercase">
                  Top-4 pick locked in!
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-ink-muted">The lottery balls are in the hopper...</p>
        )}
      </div>

      {/* Tracking the user's own picks throughout, even after they're revealed */}
      {userTrackedTeams.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-ink-muted">Your picks:</span>
          {userTrackedTeams.map((t) => {
            const isRevealed = revealed.some(
              (r) =>
                r.currentOwnerTeamId === t.currentOwnerTeamId &&
                r.originalTeamId === t.originalTeamId,
            );
            return (
              <span
                key={t.currentOwnerTeamId + t.originalTeamId}
                className={`rounded-full border px-2.5 py-1 font-mono ${
                  isRevealed
                    ? "border-team-accent bg-team-accent/10 text-team-accent"
                    : "border-rule text-ink-muted"
                }`}
              >
                {t.ownedByAnotherTeam ? `${t.originalTeamLabel} pick` : "Your pick"}:{" "}
                {isRevealed ? `No. ${t.resultPickNumber}` : "TBD"}
              </span>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="flex overflow-hidden rounded-[2px] border border-rule">
            <button
              type="button"
              disabled={isFinal}
              onClick={() => setMode("auto")}
              className={`px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                mode === "auto" ? "bg-team-accent text-team-accent-ink" : "text-ink hover:bg-raised"
              }`}
            >
              Auto-play
            </button>
            <button
              type="button"
              disabled={isFinal}
              onClick={() => setMode("manual")}
              className={`px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                mode === "manual"
                  ? "bg-team-accent text-team-accent-ink"
                  : "text-ink hover:bg-raised"
              }`}
            >
              Manual
            </button>
          </div>

          {mode === "auto" &&
            (Object.keys(SPEED_MULTIPLIERS) as SpeedLabel[]).map((label) => (
              <button
                key={label}
                type="button"
                disabled={isFinal}
                onClick={() => {
                  setSpeed(label);
                  setIsPaused(false);
                }}
                className={`rounded-[2px] border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                  speed === label && !isPaused
                    ? "border-team-accent bg-team-accent/15 text-team-accent"
                    : "border-rule text-ink hover:bg-raised"
                }`}
              >
                {label}
              </button>
            ))}

          {mode === "auto" && (
            <button
              type="button"
              disabled={isFinal}
              onClick={() => setIsPaused((p) => !p)}
              className={`rounded-[2px] border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                isPaused
                  ? "border-team-accent bg-team-accent/15 text-team-accent"
                  : "border-rule text-ink hover:bg-raised"
              }`}
            >
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}

          {mode === "manual" && (
            <button
              type="button"
              disabled={isFinal}
              onClick={handleManualAdvance}
              className="rounded-[2px] bg-team-accent px-4 py-1.5 text-xs font-bold text-team-accent-ink transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reveal Next Pick
            </button>
          )}

          <button
            type="button"
            disabled={isFinal}
            onClick={handleSkipToEnd}
            className="rounded-[2px] border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-raised disabled:cursor-not-allowed disabled:opacity-30"
          >
            Skip to Results
          </button>
        </div>
      </div>

      {/* The board so far */}
      {revealed.length > 0 && (
        <div className="mt-6 space-y-1">
          {[...revealed].reverse().map((r) => (
            <div
              key={r.currentOwnerTeamId + r.originalTeamId}
              className={`flex items-center gap-3 rounded-[2px] border p-2.5 text-sm ${
                r.isUserTeam ? "border-team-accent/60 bg-team-accent/5" : "border-rule bg-field"
              }`}
            >
              <span className="w-6 shrink-0 text-center font-mono text-xs font-bold text-ink">
                {r.resultPickNumber}
              </span>
              <TeamBadge logoUrl={r.logoUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate text-ink">
                {r.currentOwnerLabel}
                {r.isUserTeam && <span className="ml-2 text-xs text-team-accent">YOU</span>}
              </span>
              {r.movement !== 0 && (
                <span
                  className={`shrink-0 font-mono text-xs ${
                    r.movement > 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {r.movement > 0 ? "▲" : "▼"} {Math.abs(r.movement)}
                </span>
              )}
              <span className="shrink-0 font-mono text-xs text-ink-muted">
                proj. {r.projectedSeed}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
