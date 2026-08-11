"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  TOUR_STEPS,
  tourProgressKey,
  tourProgressLabel,
  type TourStep,
} from "@/lib/onboarding/tour";
import { completeOnboardingAction } from "@/lib/actions/onboarding";

/**
 * The first-session tour's visual layer.
 *
 * Two decisions worth knowing before editing this:
 *
 * **The cut-out is four rectangles, not a shadow or an SVG mask.** The Wire's
 * Flat Law forbids `box-shadow` outright, which rules out the usual
 * giant-spread trick. Four dimming panels around the target also leave the
 * target genuinely uncovered, so the real control underneath stays clickable -
 * which is the whole point of a tour that runs on the actual interface rather
 * than screenshots of it.
 *
 * **It lives in the league layout, not on a page.** Steps span the dashboard
 * and the roster page, so the component has to survive the navigation between
 * them; mounting per-page would reset it mid-tour.
 */

const PAD = 6; // breathing room around the spotlit element
const CARD_W = 300;
const CARD_GAP = 14;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(anchor: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: Math.max(0, r.top - PAD),
    left: Math.max(0, r.left - PAD),
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

/** Places the card beside the hole, preferring right, then left, then below. */
function placeCard(rect: Rect | null): { top: number; left: number } {
  if (typeof window === "undefined") return { top: 0, left: 0 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return { top: Math.max(24, vh / 2 - 130), left: Math.max(16, vw / 2 - CARD_W / 2) };
  }
  const right = rect.left + rect.width + CARD_GAP;
  const left = rect.left - CARD_W - CARD_GAP;
  const top = Math.min(Math.max(16, rect.top), Math.max(16, vh - 260));

  if (right + CARD_W <= vw - 16) return { top, left: right };
  if (left >= 16) return { top, left };
  // No room either side - sit under the target, or above it if that overflows.
  const below = rect.top + rect.height + CARD_GAP;
  const clampedLeft = Math.min(Math.max(16, rect.left), Math.max(16, vw - CARD_W - 16));
  if (below + 220 <= vh) return { top: below, left: clampedLeft };
  return { top: Math.max(16, rect.top - 220 - CARD_GAP), left: clampedLeft };
}

export function Tour({ leagueId, autoStart }: { leagueId: string; autoStart: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/leagues/${leagueId}`;

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const finishing = useRef(false);

  // Resume an in-progress tour, or start one. localStorage rather than the
  // database so a six-step tour is not six round trips; losing it costs
  // nothing worse than the tour not resuming.
  //
  // Deferred a frame so the dashboard paints before the overlay lands on it -
  // a tour that appears over a half-rendered page reads as a bug. It also keeps
  // this clear of `react-hooks/set-state-in-effect`.
  useEffect(() => {
    const start = () => {
      const key = tourProgressKey(leagueId);

      // Replay, from /guide. Read off the URL rather than useSearchParams so
      // the component needs no Suspense boundary, and always restart from the
      // top - someone asking to see it again does not want half of it.
      if (new URLSearchParams(window.location.search).get("tour") === "1") {
        setIndex(0);
        setActive(true);
        return;
      }

      const saved = window.localStorage.getItem(key);
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isInteger(n) && n >= 0 && n < TOUR_STEPS.length) {
          setIndex(n);
          setActive(true);
          return;
        }
        window.localStorage.removeItem(key);
      }
      if (autoStart) setActive(true);
    };
    const raf = window.requestAnimationFrame(start);
    return () => window.cancelAnimationFrame(raf);
  }, [leagueId, autoStart]);

  useEffect(() => {
    if (active) window.localStorage.setItem(tourProgressKey(leagueId), String(index));
  }, [active, index, leagueId]);

  const step: TourStep | undefined = active ? TOUR_STEPS[index] : undefined;
  const onRightScreen = step ? pathname === base + step.path : false;

  // Keeps up with scroll, resize and late-loading content. A step whose anchor
  // never appears falls back to a centred card rather than pointing at nothing.
  // Every measurement runs inside a frame callback rather than synchronously in
  // the effect body: layout has settled by then, and it keeps this clear of
  // `react-hooks/set-state-in-effect`.
  const anchor = step && onRightScreen ? step.anchor : null;
  useEffect(() => {
    const measure = () => setRect(anchor === null ? null : readRect(anchor));
    const raf = window.requestAnimationFrame(measure);
    const late = window.setTimeout(measure, 120); // catch async-loaded content
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(late);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor, pathname]);

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    setActive(false);
    window.localStorage.removeItem(tourProgressKey(leagueId));
    void completeOnboardingAction();
  }, [leagueId]);

  // Side effects stay out of the setState updater: React invokes updaters twice
  // in StrictMode, which would fire the completion write - and any navigation -
  // a second time. `index` is read directly instead.
  const advance = useCallback(() => {
    const next = index + 1;
    if (next >= TOUR_STEPS.length) {
      finish();
      return;
    }
    const target = TOUR_STEPS[next];
    if (target.path !== TOUR_STEPS[index].path) router.push(base + target.path);
    setIndex(next);
  }, [base, finish, index, router]);

  // A player who just does the thing is rewarded rather than also being asked
  // to press Next.
  useEffect(() => {
    if (!step?.advanceOn || !onRightScreen) return;
    const handler = () => advance();
    window.addEventListener(step.advanceOn, handler);
    return () => window.removeEventListener(step.advanceOn as string, handler);
  }, [step, onRightScreen, advance]);

  // Escape always leaves. An onboarding flow you cannot dismiss is a bug.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active || !step) return null;

  // Mid-navigation: the next step's screen has not rendered yet. Show nothing
  // for a frame rather than a spotlight in the wrong place.
  if (!onRightScreen) return null;

  const card = placeCard(rect);
  const dim = "fixed bg-black/60";

  return (
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="false" aria-label="Guided tour">
      {/* The cut-out: four panels around the target, leaving it lit and
          clickable. With no target, one full-screen panel. */}
      {rect ? (
        <>
          <div className={dim} style={{ top: 0, left: 0, right: 0, height: rect.top }} />
          <div
            className={dim}
            style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className={dim}
            style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
          />
          <div
            className={dim}
            style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
          />
          <div
            className="pointer-events-none fixed rounded-[2px] border border-team-accent"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}

      <div
        className="fixed w-75 rounded-[2px] border border-rule bg-field p-4"
        style={{ top: card.top, left: card.left }}
      >
        <div className="font-mono text-[11px] tracking-wider text-ink-muted uppercase">
          {tourProgressLabel(index, TOUR_STEPS.length)}
        </div>
        <h2 className="mt-2 text-[15px] leading-snug font-semibold text-ink">{step.title}</h2>
        {step.body.split("\n\n").map((para) => (
          <p key={para} className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            {para}
          </p>
        ))}
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={finish}
            className="text-[12px] text-ink-muted underline underline-offset-2 transition hover:text-ink"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={advance}
            className="rounded-[2px] border border-rule bg-raised px-3 py-1.5 text-[13px] font-medium text-ink transition hover:border-team-accent"
          >
            {step.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
