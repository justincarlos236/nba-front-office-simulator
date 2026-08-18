import type { OwnerArchetype } from "@/generated/prisma/client";
import type { FinancialStanding } from "@/lib/finances/ownershipFinance";

/**
 * "Ownership as a Character."
 * Converts owner confidence from a hidden scoreboard into a relationship
 * with a character who has known, learnable preferences. One archetype per
 * league (the user's own owner - CPU teams have no modeled ownership
 * personality, same Tier 2 abstraction as everywhere else in this pillar).
 * Pure multiplier/threshold math - offseason.ts is the thin DB shell that
 * applies it at the existing confidence/expectation/mandate touchpoints,
 * never a parallel system.
 *
 * Deliberately NOT modeled here: "capital access" (the design brief's
 * phrase for an archetype's effect on financing) - there's no financing
 * system yet (that's a later phase's System 3), so there's nothing for an
 * archetype to modulate there today.
 */

export const OWNER_ARCHETYPE_LABEL: Record<OwnerArchetype, string> = {
  WIN_NOW_BILLIONAIRE: "Win-Now Billionaire",
  PENNY_PINCHER: "Penny-Pincher",
  PATIENT_BUILDER: "Patient Builder",
  ABSENTEE: "Absentee Owner",
  MEDDLER: "Meddler",
};

export const OWNER_ARCHETYPE_DESCRIPTION: Record<OwnerArchetype, string> = {
  WIN_NOW_BILLIONAIRE:
    "Wants a contender immediately and reacts strongly - great or terrible - to how close you get. Sets a higher bar than your roster alone would suggest.",
  PENNY_PINCHER:
    "Watches the bottom line closely. Issues payroll and financial directives earlier and more often than most owners.",
  PATIENT_BUILDER:
    "Plays the long game. Reacts less sharply to a single bad season and sets a lower bar for a young or rebuilding roster.",
  ABSENTEE:
    "Rarely engaged. Confidence barely moves either direction, and financial directives are almost never issued regardless of how the books look.",
  MEDDLER:
    "Deeply engaged in every decision. Confidence swings harder in both directions than any other owner type - the job is either great or terrible, rarely stable.",
};

// Scales the season-end confidence swing (offseason.ts's confidenceDelta,
// itself already verdict/payroll/fan-happiness/financial-standing driven -
// this is a second, archetype-level multiplier on top of all of that).
const CONFIDENCE_DELTA_MULTIPLIER: Record<OwnerArchetype, number> = {
  WIN_NOW_BILLIONAIRE: 1.4,
  PENNY_PINCHER: 1.0,
  PATIENT_BUILDER: 0.6,
  ABSENTEE: 0.3,
  MEDDLER: 1.6,
};

export function archetypeConfidenceDeltaMultiplier(archetype: OwnerArchetype): number {
  return CONFIDENCE_DELTA_MULTIPLIER[archetype];
}

// Shifts the computed expectation-level index (0-5, see
// expectationLevel.ts's EXPECTATION_LEVEL_ORDER) up or down a notch before
// clamping back into range - the same roster reads as "make the playoffs"
// to a Patient Builder and "win a series" to a Win-Now Billionaire.
const EXPECTATION_LEVEL_SHIFT: Record<OwnerArchetype, number> = {
  WIN_NOW_BILLIONAIRE: 1,
  PENNY_PINCHER: 0,
  PATIENT_BUILDER: -1,
  ABSENTEE: 0,
  MEDDLER: 0,
};

export function archetypeExpectationLevelShift(archetype: OwnerArchetype): number {
  return EXPECTATION_LEVEL_SHIFT[archetype];
}

// Added to offseason.ts's DIRECTIVE_CONFIDENCE_THRESHOLD before the "issue
// a payroll directive" check (ownerConfidence < threshold) - a higher
// effective threshold makes the directive trigger more readily (easier for
// confidence to fall under it), a lower one suppresses it.
const DIRECTIVE_THRESHOLD_DELTA: Record<OwnerArchetype, number> = {
  WIN_NOW_BILLIONAIRE: 0,
  PENNY_PINCHER: 10,
  PATIENT_BUILDER: -5,
  ABSENTEE: -20,
  MEDDLER: 5,
};

export function archetypeDirectiveConfidenceThreshold(
  archetype: OwnerArchetype,
  baseThreshold: number,
): number {
  return baseThreshold + DIRECTIVE_THRESHOLD_DELTA[archetype];
}

/**
 * Composes with the existing shouldIssueFinancialMandate(standing) gate:
 * an Absentee owner essentially never issues one regardless of how bad
 * things get; a Penny-Pincher issues one a season earlier than everyone
 * else (STRAINED, not just DISTRESSED).
 */
export function archetypeShouldIssueFinancialMandate(
  archetype: OwnerArchetype,
  standing: FinancialStanding,
  baseShouldIssue: boolean,
): boolean {
  if (archetype === "ABSENTEE") return false;
  if (archetype === "PENNY_PINCHER" && standing === "STRAINED") return true;
  return baseShouldIssue;
}

const ALL_ARCHETYPES: OwnerArchetype[] = [
  "WIN_NOW_BILLIONAIRE",
  "PENNY_PINCHER",
  "PATIENT_BUILDER",
  "ABSENTEE",
  "MEDDLER",
];

/** Uniform random pick - used at league bootstrap, backfill, and every ownership change. */
export function rollOwnerArchetype(rng: () => number = Math.random): OwnerArchetype {
  return ALL_ARCHETYPES[Math.floor(rng() * ALL_ARCHETYPES.length)];
}

// -----------------------------------------------------------------------
// Ownership changing hands - the highest-value replayability mechanic in
// the design brief, and the cheapest to build once archetypes exist.
// -----------------------------------------------------------------------

const OWNERSHIP_CHANGE_CHANCE_PER_SEASON = 0.04;
/** A brand-new owner can't sell again the very next season - keeps this rare, not whiplash-inducing. */
const MIN_TENURE_SEASONS_BEFORE_CHANGE = 3;

export function shouldOwnershipChange(
  tenureSeasons: number,
  rng: () => number = Math.random,
): boolean {
  if (tenureSeasons < MIN_TENURE_SEASONS_BEFORE_CHANGE) return false;
  return rng() < OWNERSHIP_CHANGE_CHANCE_PER_SEASON;
}

// A new owner doesn't fully inherit the old one's accumulated favor or
// grudges, but a hard reset to a flat number would feel like a cheat code
// for a GM who'd dug themselves into a hole - blend mostly toward neutral,
// keeping a small trace of history.
const OWNERSHIP_CHANGE_NEUTRAL_CONFIDENCE = 65; // League.ownerConfidence's own documented neutral-start value
const OWNERSHIP_CHANGE_RETENTION_FRACTION = 0.3;

export function confidenceAfterOwnershipChange(oldConfidence: number): number {
  return Math.round(
    oldConfidence * OWNERSHIP_CHANGE_RETENTION_FRACTION +
      OWNERSHIP_CHANGE_NEUTRAL_CONFIDENCE * (1 - OWNERSHIP_CHANGE_RETENTION_FRACTION),
  );
}

export function describeOwnershipChange(newArchetype: OwnerArchetype): string {
  return (
    `Ownership of the franchise has changed hands. The new owner is known around the league as a ` +
    `${OWNER_ARCHETYPE_LABEL[newArchetype].toLowerCase()} - ${OWNER_ARCHETYPE_DESCRIPTION[newArchetype].charAt(0).toLowerCase()}${OWNER_ARCHETYPE_DESCRIPTION[newArchetype].slice(1)}`
  );
}
