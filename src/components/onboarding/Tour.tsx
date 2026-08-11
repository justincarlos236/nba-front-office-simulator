"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  TOUR_STEPS,
  parseEmphasis,
  tourProgressKey,
  tourProgressLabel,
  type TourStep,
} from "@/lib/onboarding/tour";
import { Button } from "@/components/ui/primitives";
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
const CARD_W = 348;
const CARD_GAP = 14;
/** Approximate rendered card height, used only to keep it inside the viewport. */
const CARD_H = 250;

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
    return { top: Math.max(24, vh / 2 - CARD_H / 2), left: Math.max(16, vw / 2 - CARD_W / 2) };
  }
  const right = rect.left + rect.width + CARD_GAP;
  const left = rect.left - CARD_W - CARD_GAP;
  const top = Math.min(Math.max(16, rect.top), Math.max(16, vh - CARD_H));

  if (right + CARD_W <= vw - 16) return { top, left: right };
  if (left >= 16) return { top, left };
  // No room either side - sit under the target, or above it if that overflows.
  const below = rect.top + rect.height + CARD_GAP;
  const clampedLeft = Math.min(Math.max(16, rect.left), Math.max(16, vw - CARD_W - 16));
  if (below + CARD_H <= vh) return { top: below, left: clampedLeft };
  return { top: Math.max(16, rect.top - CARD_H - CARD_GAP), left: clampedLeft };
}

export function Tour({ leagueId, autoStart }: { leagueId: string; autoStart: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/leagues/${leagueId}`;

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const finishing = useRef(false);
  // router.push on a dynamic page is a real server round-trip. Wrapping it in a
  // transition gives us the pending flag, so the card can stay on screen
  // through the move instead of unmounting and re-appearing - which is what
  // actually read as a "pause".
  const [isNavigating, startNavigation] = useTransition();

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

  // Bring the target on screen when a step opens. Without this a step whose
  // element sits below the fold - the simulate controls, on a tall dashboard -
  // shows a card explaining something the player cannot see, which reads as
  // broken. Runs once per anchor, never on scroll, so it can never fight the
  // player for control of the page.
  useEffect(() => {
    if (anchor === null) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
    if (!el) return;
    const box = el.getBoundingClientRect();
    const fullyVisible = box.top >= 72 && box.bottom <= window.innerHeight - 16;
    if (fullyVisible) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [anchor]);

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

  // Warm the next screen while the player is still reading this step, so the
  // move feels instant rather than fetched on click.
  useEffect(() => {
    if (!active) return;
    const next = TOUR_STEPS[index + 1];
    if (next && next.path !== TOUR_STEPS[index].path) router.prefetch(base + next.path);
  }, [active, index, base, router]);

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    setActive(false);
    window.localStorage.removeItem(tourProgressKey(leagueId));
    void completeOnboardingAction(leagueId);
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
    if (target.path !== TOUR_STEPS[index].path) {
      startNavigation(() => router.push(base + target.path));
    }
    setIndex(next);
  }, [base, finish, index, router, startNavigation]);

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

  // Mid-navigation the next screen has not rendered yet. Keep the card up with
  // no cut-out rather than unmounting - a tour that vanishes and returns is
  // what made the page change feel slow, more than the fetch itself did.
  const inTransit = !onRightScreen;
  if (inTransit && !isNavigating) return null;

  const card = placeCard(inTransit ? null : rect);
  const dim = "fixed bg-black/60";

  return (
    <div className="fixed inset-0 z-60" role="dialog" aria-modal="false" aria-label="Guided tour">
      {/* The cut-out: four panels around the target, leaving it lit and
          clickable. With no target, one full-screen panel. */}
      {rect && !inTransit ? (
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

      {/* The card is a document, per The Wire: a hard accent rule down one
          edge instead of a shadow, print-scale headline, and exactly one
          emphasised phrase per step so the eye has a single place to land. */}
      <div
        className="fixed border border-l-2 border-rule border-l-team-accent bg-field"
        style={{ top: card.top, left: card.left, width: CARD_W }}
      >
        {/* Progress reads as a filled rule rather than a widget - six steps do
            not need a stepper, they need to say "nearly done". */}
        <div className="h-0.5 w-full bg-rule">
          <div
            className="h-full bg-team-accent transition-[width] duration-300"
            style={{ width: `${((index + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-5">
          <div className="font-mono text-[10px] tracking-[0.18em] text-ink-muted uppercase">
            Step {tourProgressLabel(index, TOUR_STEPS.length)}
          </div>

          <h2 className="mt-2.5 text-[19px] leading-[1.25] font-bold tracking-[-0.015em] text-ink">
            {step.title}
          </h2>

          {step.body.split("\n\n").map((para) => (
            <p key={para} className="mt-2.5 text-[14px] leading-relaxed text-ink-muted">
              {parseEmphasis(para).map((run, i) =>
                run.strong ? (
                  <strong key={i} className="font-semibold text-ink">
                    {run.text}
                  </strong>
                ) : (
                  <span key={i}>{run.text}</span>
                ),
              )}
            </p>
          ))}

          <div className="mt-5 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={finish}
              className="text-[12px] text-ink-muted underline decoration-rule underline-offset-4 transition hover:text-ink"
            >
              Skip tour
            </button>
            <Button onClick={advance}>{step.buttonLabel}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
