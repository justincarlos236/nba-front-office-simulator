"use client";

import { useEffect, useRef, useState } from "react";
import { TeamBadge } from "@/components/draft/lottery/TeamBadge";
import type { ResolvedPick } from "@/lib/actions/draft";
import type { DraftTeamInfo } from "./types";
import { teamLabel } from "./types";
import { DraftResolutionCard } from "./DraftResolutionCard";
import { DraftCard } from "./DraftCard";

/**
 * Forked from `src/components/draft/lottery/LotteryReveal.tsx` - the same
 * manual/auto/speed/skip mechanism (ref-mirrored state so an in-flight
 * async reveal loop always reads current control values, and the
 * "skip must still force-set the authoritative final state and hold
 * briefly before completing" discipline), adapted for a batch of already-
 * decided draft picks instead of a lottery result. Every pick in
 * `resolvedPicks` is already fully resolved server-side (see
 * `advanceDraftAction`/`makeDraftPickAction`) - this only paces how it's
 * shown, never influences the outcome.
 */

const SPEED_MULTIPLIERS = { "1x": 1, "2x": 2, "4x": 4, Fast: 10 } as const;
type SpeedLabel = keyof typeof SPEED_MULTIPLIERS;
type Mode = "auto" | "manual";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBigMoment(pick: ResolvedPick, userTeamId: string | null): boolean {
  return (
    pick.overallPickNumber === 1 ||
    pick.leagueTeamId === userTeamId ||
    pick.narrative !== null ||
    pick.tradedFromTeamId !== null
  );
}

/** The user's own selection renders as a draft card rather than a line of
 *  text. A card carries five fields and a colour band; the timings below were
 *  tuned when every pick was one line, so an own-pick flashed past before it
 *  could be read. It is also the only pick the player actually keeps. */
function isOwnPick(pick: ResolvedPick, userTeamId: string | null): boolean {
  return userTeamId !== null && pick.leagueTeamId === userTeamId;
}

function baseDelayForPick(pick: ResolvedPick, userTeamId: string | null): number {
  if (pick.overallPickNumber === 1) return 2600;
  if (isOwnPick(pick, userTeamId)) return 3200;
  if (isBigMoment(pick, userTeamId)) return 1500;
  if (pick.overallPickNumber <= 5) return 1100;
  if (pick.overallPickNumber <= 14) return 750;
  if (pick.overallPickNumber <= 30) return 400;
  return 220; // round 2 - keep it snappy
}
function settleDelayForPick(pick: ResolvedPick, userTeamId: string | null): number {
  if (pick.overallPickNumber === 1) return 1200;
  if (isOwnPick(pick, userTeamId)) return 1600;
  if (isBigMoment(pick, userTeamId)) return 700;
  if (pick.overallPickNumber <= 14) return 350;
  return 150;
}

export function PickRevealStage({
  resolvedPicks,
  teamsById,
  userTeamId,
  season,
  onReveal,
  onComplete,
}: {
  /** Already sorted ascending by overallPickNumber. */
  resolvedPicks: ResolvedPick[];
  teamsById: Record<string, DraftTeamInfo>;
  userTeamId: string | null;
  /** Draft year, printed on the user's own draft card. */
  season: number;
  /** Fired once per entry, the moment it becomes the current reveal - lets the parent update the live board/order rail/night-event log in real time. */
  onReveal: (pick: ResolvedPick) => void;
  onComplete: () => void;
}) {
  const isSingle = resolvedPicks.length === 1;

  const [revealedCount, setRevealedCount] = useState(0);
  const [current, setCurrent] = useState<ResolvedPick | null>(null);
  const [isFinal, setIsFinal] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [speed, setSpeed] = useState<SpeedLabel>("2x");
  const [isPaused, setIsPaused] = useState(false);
  /** True while the sequence is holding on the user's own selection. */
  const [holdingOnOwnPick, setHoldingOnOwnPick] = useState(false);

  const modeRef = useRef(mode);
  const speedRef = useRef(speed);
  const pausedRef = useRef(isPaused);
  const simToEndRef = useRef(false);
  const manualResolverRef = useRef<(() => void) | null>(null);
  const onRevealRef = useRef(onReveal);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);
  useEffect(() => {
    onRevealRef.current = onReveal;
    onCompleteRef.current = onComplete;
  }, [onReveal, onComplete]);

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
      // Tracked as a plain closure variable, not React state - state set
      // inside this long-lived async closure would only ever reflect the
      // value from the render that started it, not live updates.
      let revealedSoFar = 0;

      for (let i = 0; i < resolvedPicks.length; i++) {
        if (cancelled) return;
        if (simToEndRef.current) break;

        const entry = resolvedPicks[i];

        if (!isSingle && modeRef.current === "manual") {
          await waitForManualAdvance();
        } else {
          await waitTicks(baseDelayForPick(entry, userTeamId));
        }
        if (cancelled) return;
        if (simToEndRef.current) break;

        revealedSoFar = i + 1;
        setRevealedCount(revealedSoFar);
        setCurrent(entry);
        onRevealRef.current(entry);
        await waitTicks(settleDelayForPick(entry, userTeamId));

        // Your own selection renders as a draft card and is the one pick of
        // sixty you actually keep. Auto-advancing past it means the card
        // flashes by before it can be read, so the sequence holds here until
        // the player dismisses it - unless they have asked to sim to the end,
        // in which case they have said they do not want to stop for anything.
        if (
          !cancelled &&
          !simToEndRef.current &&
          !isSingle &&
          isOwnPick(entry, userTeamId) &&
          i < resolvedPicks.length - 1
        ) {
          setHoldingOnOwnPick(true);
          await waitForManualAdvance();
          setHoldingOnOwnPick(false);
        }
      }

      if (cancelled) return;

      // Sim to End (or the natural end) - force-apply every remaining
      // entry's reveal callback so the board is never left partially
      // updated, then land on the exact authoritative final state.
      for (let i = revealedSoFar; i < resolvedPicks.length; i++) {
        onRevealRef.current(resolvedPicks[i]);
      }
      setRevealedCount(resolvedPicks.length);
      setCurrent(resolvedPicks[resolvedPicks.length - 1] ?? null);
      setIsFinal(true);

      await sleep(500);
      if (!cancelled) onCompleteRef.current();
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

  const isClimax = current?.overallPickNumber === 1;
  const isUserPick = Boolean(current && current.leagueTeamId === userTeamId);
  const team = current ? teamsById[current.leagueTeamId] : undefined;

  return (
    <div>
      <div
        className={`relative min-h-[26rem] overflow-hidden rounded-[2px] border p-8 text-center transition-all ${
          isClimax
            ? "border-team-accent bg-team-accent/5"
            : isUserPick
              ? "border-team-accent/60 bg-team-accent/5"
              : "border-rule bg-field"
        }`}
      >
        <p
          className={`text-xs font-semibold tracking-widest uppercase ${isClimax ? "text-team-accent" : "text-ink-muted"}`}
        >
          {current?.overallPickNumber === 1
            ? "The No. 1 Overall Pick"
            : current
              ? `Pick ${current.overallPickNumber}`
              : "On the clock..."}
        </p>

        {current ? (
          <div
            key={current.pickId}
            className={`mt-4 flex flex-col items-center gap-3 animate-lottery-card-in ${
              isClimax ? "animate-lottery-glow-pulse rounded-[2px] p-4" : ""
            }`}
          >
            <TeamBadge logoUrl={team?.logoUrl ?? null} size={isClimax ? "xl" : "lg"} />
            <p className={`font-bold text-ink ${isClimax ? "text-3xl" : "text-xl"}`}>
              {team ? `${team.city} ${team.name}` : "Unknown team"}
            </p>
            {isUserPick && (
              <span className="rounded-full bg-team-accent/15 px-3 py-1 text-xs font-bold text-team-accent">
                YOUR PICK
              </span>
            )}
            {/* Your own selection gets the card that goes to the podium. CPU
                picks stay as the compact line - a card for all sixty would be
                wallpaper, and the point is that yours is the one you keep. */}
            {isUserPick && team ? (
              <div className="mt-1 w-full max-w-sm text-left">
                <DraftCard
                  playerName={current.fullName}
                  teamCity={team.city}
                  teamName={team.name}
                  primaryColor={team.primaryColor}
                  secondaryColor={team.secondaryColor}
                  round={current.round}
                  overallPickNumber={current.overallPickNumber}
                  season={season}
                  viaTeamLabel={
                    current.tradedFromTeamId
                      ? teamLabel(teamsById, current.tradedFromTeamId)
                      : null
                  }
                />
                {holdingOnOwnPick && (
                  <button
                    type="button"
                    onClick={handleManualAdvance}
                    className="mt-4 w-full rounded-[2px] bg-team-accent px-5 py-2.5 text-[11px] font-semibold tracking-[0.09em] text-team-accent-ink uppercase transition-opacity duration-120 hover:opacity-[0.88]"
                  >
                    Continue the draft
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-1">
                <p className="text-lg font-semibold text-ink">{current.fullName}</p>
                <p className="text-xs text-ink-muted">
                  {current.position} &middot; OVR {current.overallRating} &middot; POT{" "}
                  {current.potentialRating}
                </p>
              </div>
            )}

            {current.tradedFromTeamId && (
              <div className="animate-lottery-banner-in mt-2 rounded-[2px] border border-caution bg-caution/15 px-4 py-2">
                <p className="text-xs font-black tracking-wide text-caution uppercase">
                  Trade Alert
                </p>
                <p className="mt-0.5 text-xs text-ink">
                  {teamLabel(teamsById, current.tradedFromTeamId)} traded this pick to{" "}
                  {teamLabel(teamsById, current.leagueTeamId)}
                </p>
              </div>
            )}

            {current.narrative === "REACH" && (
              <p className="text-sm font-semibold text-caution">
                ▲ A reach - the board had someone else in mind here
              </p>
            )}
            {current.narrative === "STEAL" && (
              <div className="animate-lottery-banner-in mt-2 rounded-[2px] border border-positive bg-positive/15 px-4 py-2">
                <p className="text-xs font-black tracking-wide text-positive uppercase">
                  Hidden Gem
                </p>
                <p className="mt-0.5 text-xs text-ink">
                  A real slide - great value this late
                </p>
              </div>
            )}
            {current.resolutionSummary && (
              <DraftResolutionCard summary={current.resolutionSummary} />
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-ink-muted">The commissioner steps to the podium...</p>
        )}
      </div>

      {!isSingle && (
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
                  mode === "manual" ? "bg-team-accent text-team-accent-ink" : "text-ink hover:bg-raised"
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
              Skip Ahead
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            {revealedCount} of {resolvedPicks.length} revealed
          </p>
        </div>
      )}
    </div>
  );
}
