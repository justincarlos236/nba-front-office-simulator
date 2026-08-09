import { EXPECTATION_LEVEL_ORDER, type ExpectationLevel } from "./expectationLevel";
import type { TeamIdentity } from "./teamIdentity";

/**
 * The distance between what ownership is asking for and what this team
 * actually is.
 *
 * Both facts were already computed and already displayed - the mandate in the
 * Ownership field, the identity in the Identity field - but they sat adjacent
 * with nothing saying they were in conflict. A 33-49 roster labelled "Tanking"
 * directly beneath "This season: Make a deep playoff run" reads as a data bug,
 * when it is in fact the most interesting thing on the page: ownership paid for
 * a contender (payroll sets the expectation) and got a lottery team.
 *
 * That tension IS the job. This module names it so the interface can say so,
 * rather than leaving the user to notice two numbers disagreeing.
 *
 * Deliberately derived, never stored: both inputs already move on their own
 * schedules, and persisting a third value would let it drift out of step with
 * the two facts it describes.
 */

export type ExpectationGap = "aligned" | "stretch" | "mismatch" | "crisis";

/**
 * Where each identity sits on the same 0-5 scale the expectations use, so the
 * two can be compared directly. A Contender is genuinely at the top of that
 * range; a Tanking team is at the bottom by definition.
 */
const IDENTITY_INDEX: Record<TeamIdentity, number> = {
  CONTENDER: 5,
  // Maps to MAKE_PLAYOFFS, not WIN_PLAYOFF_SERIES: making the field is what a
  // playoff team has demonstrably done. Crediting it with a series win it has
  // not played would hide exactly the gap this module exists to surface.
  PLAYOFF_TEAM: 2,
  PLAY_IN_TEAM: 1,
  REBUILDING: 0,
  TANKING: 0,
};

export function computeExpectationGap(
  expectation: ExpectationLevel,
  identity: TeamIdentity,
): ExpectationGap {
  const asked = EXPECTATION_LEVEL_ORDER.indexOf(expectation);
  const actual = IDENTITY_INDEX[identity];
  const gap = asked - actual;

  // The team is at or above what was asked. No tension worth naming.
  if (gap <= 0) return "aligned";
  // One level short: an ordinary season's worth of overperformance closes it.
  if (gap === 1) return "stretch";
  // Two or three levels: the roster is not the roster ownership thinks it is.
  if (gap <= 3) return "mismatch";
  // Four or five: a title mandate on a lottery roster. This is how GMs are fired.
  return "crisis";
}

/**
 * Written from ownership's side of the desk, because ownership is who sets the
 * expectation and who acts on it. Deliberately plain: this is a statement of
 * the user's position, not a warning banner.
 */
export const EXPECTATION_GAP_NOTE: Record<ExpectationGap, string | null> = {
  aligned: null,
  stretch: "This roster is close to that, but not there yet.",
  mismatch: "That is well beyond what this roster currently is.",
  crisis: "This roster is nowhere near that. Something has to give.",
};

/** Only a real gap earns visual weight; alignment is the quiet default. */
export const EXPECTATION_GAP_TONE: Record<ExpectationGap, "neutral" | "caution" | "negative"> = {
  aligned: "neutral",
  stretch: "neutral",
  mismatch: "caution",
  crisis: "negative",
};
