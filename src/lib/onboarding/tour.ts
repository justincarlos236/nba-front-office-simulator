/**
 * The first-session tour: six steps, two screens, about two and a half minutes.
 *
 * **This reverses a documented decision, deliberately.** `docs/ONBOARDING_DESIGN.md`
 * rejected coach-mark tours twice, on the grounds that they help session one
 * only, get skipped, and rot. That reasoning is still correct and this module
 * is built to answer it rather than ignore it:
 *
 * - _Helps session one only_ — accepted. Session one is the one where players
 *   quit. The Action Center remains the continuous guidance system; this tour
 *   only hands off to it.
 * - _Gets skipped_ — Skip is on every step, one click, never buried. A tour
 *   that is easy to leave is not a tax on the people who do not want it.
 * - _Rots_ — every anchor is asserted to exist by `tour.test.ts`, and a step
 *   whose anchor is missing at runtime is dropped rather than rendered as an
 *   empty spotlight. It fails in CI, not in front of a new player.
 *
 * What this tour deliberately does **not** do is explain systems. Every page it
 * visits already has a purpose line, and the Action Center already carries
 * per-item reasoning. The tour's whole job is _sequencing_ - showing that these
 * places exist and how one leads to the next. The moment a step starts
 * restating what is already on screen, it should be cut.
 */

/** Where a step happens, relative to the league base (`/leagues/[id]`). */
export type TourPath = "" | "/rotation";

export interface TourStep {
  id: string;
  path: TourPath;
  /**
   * `data-tour` attribute value to spotlight, or null for a centred card with
   * no cut-out. Kept as a string the test file cross-checks against the real
   * source, so a renamed element cannot silently break a step.
   */
  anchor: string | null;
  title: string;
  /**
   * Body copy. `*asterisks*` mark the one phrase in the step worth landing on -
   * rendered in full-strength ink against the muted rest, so each card has a
   * single thing the eye catches. One per step; more and nothing stands out.
   */
  body: string;
  /** Label on the advance button. Every step has one - nothing is ever a trap. */
  buttonLabel: string;
  /**
   * A `tour:*` DOM event that also advances this step, so a player who just
   * does the thing is rewarded instead of being asked to press Next as well.
   * The button stays available regardless.
   */
  advanceOn?: TourEventName;
}

/** Events the app dispatches that the tour listens for. */
export type TourEventName = "tour:rotation-changed" | "tour:simulated";

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    path: "",
    anchor: null,
    title: "You're the general manager.",
    body: "Build the roster, manage the money, win games. *The owner is watching.*\n\nThis takes about two minutes.",
    buttonLabel: "Show me around",
  },
  {
    id: "action-center",
    path: "",
    anchor: "action-center",
    title: "Start here, always.",
    body: "It reads your league and ranks *what needs attention right now.* Every item can tell you why it is recommending itself.",
    buttonLabel: "Next",
  },
  {
    id: "sections",
    path: "",
    anchor: "sub-nav",
    title: "The rest of the building.",
    body: "Finances, trades, the draft, your staff. *You do not need them yet* - the Action Center will send you when it is time.",
    buttonLabel: "Next",
  },
  {
    id: "rotation",
    path: "/rotation",
    anchor: "rotation-board",
    title: "Your rotation drives the simulation.",
    body: "*Order is minutes.* Drag someone into your starting five and the simulation follows it.",
    buttonLabel: "Got it",
    advanceOn: "tour:rotation-changed",
  },
  {
    id: "simulate",
    path: "",
    anchor: "simulate-controls",
    title: "Now play some basketball.",
    body: "Simulate a game and see what your roster *actually does.*",
    buttonLabel: "Skip ahead",
    advanceOn: "tour:simulated",
  },
  {
    id: "handoff",
    path: "",
    anchor: "action-center",
    title: "That's the loop.",
    body: "Results, news and standings all move as you simulate. The Action Center keeps telling you what is next - *you are on your own from here.*",
    buttonLabel: "Done",
  },
];

/** Every anchor the tour needs to find in the DOM. Used by the anchor test. */
export const TOUR_ANCHORS: readonly string[] = Array.from(
  new Set(TOUR_STEPS.map((s) => s.anchor).filter((a): a is string => a !== null)),
);

/**
 * Whether to open the tour by itself.
 *
 * Only ever for a player who has not seen it and is in their first franchise -
 * a second save never re-triggers it, which is the difference between an
 * onboarding flow and an interruption. Completion lives on the user rather than
 * the league for exactly that reason.
 */
export function shouldAutoLaunchTour(args: {
  onboardingCompletedAt: Date | null;
  leagueCount: number;
}): boolean {
  if (args.onboardingCompletedAt !== null) return false;
  return args.leagueCount <= 1;
}

/**
 * The steps that can actually run, given which anchors exist on the page right
 * now. A step whose element has gone missing is dropped rather than rendered
 * pointing at nothing - the failure mode of a rotting tour should be a shorter
 * tour, never a broken one.
 *
 * Steps on another screen are kept: their anchor is not expected to exist yet.
 */
export function runnableSteps(
  steps: readonly TourStep[],
  currentPath: TourPath,
  anchorExists: (anchor: string) => boolean,
): TourStep[] {
  return steps.filter((s) => s.path !== currentPath || s.anchor === null || anchorExists(s.anchor));
}

/** Progress label, e.g. "3 / 6". */
export function tourProgressLabel(index: number, total: number): string {
  return `${index + 1} / ${total}`;
}

/** Dispatches a tour event. No-op on the server. */
export function emitTourEvent(name: TourEventName): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name));
}

/** localStorage key for the in-progress step, per league. */
export function tourProgressKey(leagueId: string): string {
  return `tour:progress:${leagueId}`;
}

/**
 * Splits body copy on `*emphasis*` markers into runs the card can style.
 * Deliberately tiny - this is one emphasis level, not a markdown parser, and it
 * should stay that way.
 */
export function parseEmphasis(body: string): { text: string; strong: boolean }[] {
  return body
    .split(/(\*[^*]+\*)/g)
    .filter((chunk) => chunk.length > 0)
    .map((chunk) =>
      chunk.startsWith("*") && chunk.endsWith("*") && chunk.length > 2
        ? { text: chunk.slice(1, -1), strong: true }
        : { text: chunk, strong: false },
    );
}
