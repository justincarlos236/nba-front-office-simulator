import { createSeededRandom, randomInRange } from "@/lib/contracts/seededRandom";

/**
 * Flavor-only scouting sub-attributes for a draft prospect. The
 * simulation engine only ever uses `overallRating`/`potentialRating` -
 * these are derived, deterministic (seeded by prospect id), and exist
 * purely so a "scouting report" has something more specific to say than
 * a single number. Position tendencies are a simplification (guards
 * skew playmaking/scoring, bigs skew rebounding/defense), not a claim
 * about any real evaluation methodology.
 */
export interface ScoutingAttributes {
  scoring: number;
  playmaking: number;
  defense: number;
  rebounding: number;
  athleticism: number;
}

export interface ScoutingProfile extends ScoutingAttributes {
  strengths: string[];
  weaknesses: string[];
}

const ATTRIBUTE_LABELS: Record<keyof ScoutingAttributes, string> = {
  scoring: "Scoring",
  playmaking: "Playmaking",
  defense: "Defense",
  rebounding: "Rebounding",
  athleticism: "Athleticism",
};

const POSITION_BIAS: Record<string, Partial<ScoutingAttributes>> = {
  PG: { playmaking: 10, scoring: 4, rebounding: -10, defense: -2 },
  SG: { scoring: 10, athleticism: 4, rebounding: -8, playmaking: -4 },
  SF: { scoring: 4, athleticism: 4 },
  PF: { rebounding: 8, defense: 4, playmaking: -6 },
  C: { rebounding: 12, defense: 8, playmaking: -10, athleticism: -2 },
};

function clampAttribute(value: number): number {
  return Math.max(60, Math.min(99, Math.round(value)));
}

export interface ScoutableProspect {
  id: string;
  overallRating: number;
  position: string;
}

export function deriveScoutingProfile(prospect: ScoutableProspect): ScoutingProfile {
  const rng = createSeededRandom(`${prospect.id}-scouting`);
  const bias = POSITION_BIAS[prospect.position] ?? {};

  const attributes: ScoutingAttributes = {
    scoring: clampAttribute(
      prospect.overallRating + (bias.scoring ?? 0) + randomInRange(rng, -10, 10),
    ),
    playmaking: clampAttribute(
      prospect.overallRating + (bias.playmaking ?? 0) + randomInRange(rng, -10, 10),
    ),
    defense: clampAttribute(
      prospect.overallRating + (bias.defense ?? 0) + randomInRange(rng, -10, 10),
    ),
    rebounding: clampAttribute(
      prospect.overallRating + (bias.rebounding ?? 0) + randomInRange(rng, -10, 10),
    ),
    athleticism: clampAttribute(
      prospect.overallRating + (bias.athleticism ?? 0) + randomInRange(rng, -10, 10),
    ),
  };

  const ranked = (Object.entries(attributes) as [keyof ScoutingAttributes, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  const strengths = ranked.slice(0, 2).map(([key]) => ATTRIBUTE_LABELS[key]);
  const weaknesses = ranked
    .slice(-2)
    .map(([key]) => ATTRIBUTE_LABELS[key])
    .reverse();

  return { ...attributes, strengths, weaknesses };
}

/**
 * Draft Experience Redesign - two more display-only fields, computed the
 * same way `deriveScoutingProfile` already is (pure functions of data that
 * already exists, never a new DB column, never a mechanic that hides a
 * real number from the user - all ratings stay fully visible, exactly as
 * documented on the `DraftProspect` model).
 */
export type ScoutingConfidence = "LOW" | "MEDIUM" | "HIGH";

export const SCOUTING_CONFIDENCE_LABEL: Record<ScoutingConfidence, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/**
 * Younger prospects (one-and-done freshman-age) are a bigger unknown -
 * real scouting convention, not a hidden-information mechanic: this is
 * flavor text about how volatile the class's *variance* tends to be at
 * that age, not a claim the prospect's own visible ratings are unreliable.
 */
export function computeScoutingConfidence(age: number): ScoutingConfidence {
  if (age <= 19) return "LOW";
  if (age <= 21) return "MEDIUM";
  return "HIGH";
}

/**
 * what actually buys report
 * reliability is now per-prospect Scouting Depth (0-3, see
 * scoutingAssignments.ts), not the flat department level. Originally
 * this was keyed directly off
 * `DepartmentLevel`; the department level now sets the *assignment budget*
 * that earns Depth, rather than reliability itself - a team with a high
 * Scouting budget but no assignments spent on a given prospect still knows
 * nothing specific about him. `overallRating`/`potentialRating` are NEVER
 * touched here or anywhere downstream - that principle (see this file's
 * header comment) stays intact. What Depth buys is the *reliability* of a
 * set of qualitative reads layered on top: an unscouted prospect's story -
 * bust risk, development trajectory, work ethic, NBA readiness, injury
 * outlook, and a ceiling range around the (always-visible) potential
 * rating - is frequently vague or flatly wrong. A fully-scouted (Known)
 * prospect gets the same reads, but they're accurate and precise. Richer
 * information, not hidden information.
 */
export type BustRiskLabel = "LOW" | "MODERATE" | "HIGH";
export type TrajectoryLabel = "AHEAD_OF_SCHEDULE" | "ON_TRACK" | "RAW_PROJECT";
export type WorkEthicLabel = "HIGHLY_MOTIVATED" | "SOLID_WORKER" | "QUESTION_MARKS";
export type ReadinessLabel = "READY_NOW" | "ONE_TO_TWO_YEARS" | "MULTI_YEAR_PROJECT";
export type InjuryOutlookLabel = "DURABLE" | "SOME_CONCERN" | "RED_FLAGS";
export type ScoutingReportConfidence =
  "SPECULATIVE" | "ROUGH_READ" | "SOLID_READ" | "HIGH_CONFIDENCE" | "DEFINITIVE";

export interface ScoutingReport {
  bustRisk: BustRiskLabel | "UNCERTAIN";
  trajectory: TrajectoryLabel | "UNCERTAIN";
  workEthic: WorkEthicLabel | "UNCERTAIN";
  readiness: ReadinessLabel | "UNCERTAIN";
  injuryOutlook: InjuryOutlookLabel | "UNCERTAIN";
  /** A range around the (always-visible) potentialRating - narrows toward a single number as scouting improves. */
  ceilingRangeLabel: string;
  confidence: ScoutingReportConfidence;
}

export const BUST_RISK_LABEL: Record<BustRiskLabel | "UNCERTAIN", string> = {
  LOW: "Low bust risk",
  MODERATE: "Moderate bust risk",
  HIGH: "High bust risk",
  UNCERTAIN: "Bust risk unclear",
};
export const TRAJECTORY_LABEL: Record<TrajectoryLabel | "UNCERTAIN", string> = {
  AHEAD_OF_SCHEDULE: "Ahead of schedule",
  ON_TRACK: "On track",
  RAW_PROJECT: "Raw project",
  UNCERTAIN: "Trajectory unclear",
};
export const WORK_ETHIC_LABEL: Record<WorkEthicLabel | "UNCERTAIN", string> = {
  HIGHLY_MOTIVATED: "Highly motivated",
  SOLID_WORKER: "Solid worker",
  QUESTION_MARKS: "Question marks",
  UNCERTAIN: "Work ethic unclear",
};
export const READINESS_LABEL: Record<ReadinessLabel | "UNCERTAIN", string> = {
  READY_NOW: "NBA-ready now",
  ONE_TO_TWO_YEARS: "1-2 years away",
  MULTI_YEAR_PROJECT: "Multi-year project",
  UNCERTAIN: "Readiness unclear",
};
export const INJURY_OUTLOOK_LABEL: Record<InjuryOutlookLabel | "UNCERTAIN", string> = {
  DURABLE: "Durable",
  SOME_CONCERN: "Some concern",
  RED_FLAGS: "Red flags",
  UNCERTAIN: "Injury outlook unclear",
};
export const SCOUTING_REPORT_CONFIDENCE_LABEL: Record<ScoutingReportConfidence, string> = {
  SPECULATIVE: "Speculative",
  ROUGH_READ: "Rough read",
  SOLID_READ: "Solid read",
  HIGH_CONFIDENCE: "High confidence",
  DEFINITIVE: "Definitive",
};

// 0 (pure noise) to 1 (perfectly reliable) - how much to trust each axis's
// computed "true" bucket before the depth-gated fuzzing below. Indexed by
// Scouting Depth (0 Unknown - 3 Known, see scoutingAssignments.ts), not
// department level - even MAXIMUM department funding buys nothing on a
// prospect nobody has actually spent an assignment on.
const RELIABILITY_BY_DEPTH: Record<number, number> = {
  0: 0.1,
  1: 0.4,
  2: 0.7,
  3: 1.0,
};

const CONFIDENCE_BY_DEPTH: Record<number, ScoutingReportConfidence> = {
  0: "SPECULATIVE",
  1: "ROUGH_READ",
  2: "HIGH_CONFIDENCE",
  3: "DEFINITIVE",
};

// How wide the ceiling range is around the true potentialRating - narrows
// to a single number at Depth 3 (Known).
const CEILING_RANGE_BY_DEPTH: Record<number, number> = {
  0: 15,
  1: 10,
  2: 5,
  3: 0,
};

/** Picks the true label, a wrong-but-committed label, or "UNCERTAIN" - reliability governs which. */
function scoutedLabel<T extends string>(
  trueLabel: T,
  allLabels: readonly T[],
  reliability: number,
  rng: () => number,
): T | "UNCERTAIN" {
  const uncertainChance = (1 - reliability) * 0.35;
  if (rng() < uncertainChance) return "UNCERTAIN";
  const wrongChance = (1 - reliability) * 0.5;
  if (rng() < wrongChance) {
    const others = allLabels.filter((l) => l !== trueLabel);
    return others[Math.floor(rng() * others.length)];
  }
  return trueLabel;
}

function trueBustRisk(overallRating: number, potentialRating: number, age: number): BustRiskLabel {
  const gap = potentialRating - overallRating;
  const ageFactor = age <= 19 ? 1.3 : age <= 21 ? 1.0 : 0.7;
  const riskScore = gap * ageFactor;
  if (riskScore >= 18) return "HIGH";
  if (riskScore >= 9) return "MODERATE";
  return "LOW";
}

function trueTrajectory(overallRating: number, age: number): TrajectoryLabel {
  const expectedForAge = 55 + (age - 18) * 4;
  const diff = overallRating - expectedForAge;
  if (diff >= 8) return "AHEAD_OF_SCHEDULE";
  if (diff <= -8) return "RAW_PROJECT";
  return "ON_TRACK";
}

function trueReadiness(overallRating: number, age: number): ReadinessLabel {
  if (overallRating >= 74 && age >= 21) return "READY_NOW";
  if (overallRating >= 68) return "ONE_TO_TWO_YEARS";
  return "MULTI_YEAR_PROJECT";
}

// No real underlying stat exists for these two (no motivation/injury-
// history field on a generated prospect) - a fixed, seeded-by-id "true"
// value stands in, same "deterministic per prospect" convention
// deriveScoutingProfile already uses for strengths/weaknesses.
function trueWorkEthic(prospectId: string): WorkEthicLabel {
  const roll = createSeededRandom(`${prospectId}-work-ethic-true`)();
  if (roll < 0.35) return "HIGHLY_MOTIVATED";
  if (roll < 0.8) return "SOLID_WORKER";
  return "QUESTION_MARKS";
}

/**
 * `injuryRiskDelta` (Scouting Pillar Redesign, Phase 4 - class character
 * variance) shifts the whole class's true injury-risk distribution for an
 * INJURY_RIDDLED year - added to the roll itself (not the thresholds), so
 * it pushes every prospect toward RED_FLAGS/SOME_CONCERN uniformly rather
 * than needing three separately-adjusted cutoffs.
 */
function trueInjuryOutlook(prospectId: string, injuryRiskDelta = 0): InjuryOutlookLabel {
  const roll = createSeededRandom(`${prospectId}-injury-outlook-true`)() + injuryRiskDelta;
  if (roll < 0.6) return "DURABLE";
  if (roll < 0.85) return "SOME_CONCERN";
  return "RED_FLAGS";
}

export interface ScoutableProspectForReport {
  id: string;
  overallRating: number;
  potentialRating: number;
  age: number;
}

/** The two axes with no underlying derivable stat - the only ones a Private Workout can resolve outright. */
export type ResolvableHiddenAxis = "WORK_ETHIC" | "INJURY_OUTLOOK";

export function generateScoutingReport(
  prospect: ScoutableProspectForReport,
  /** Scouting Depth (0 Unknown - 3 Known) - clamped defensively since it's a raw DB int, not a constrained enum. */
  depth: number,
  /**
   * axes a Private Workout has
   * resolved outright for this prospect. A resolved axis always returns
   * its true value, bypassing `scoutedLabel`'s uncertainty entirely,
   * regardless of Depth - that's the whole point of paying for a workout
   * instead of just scouting harder. Skipping `scoutedLabel`'s rng draw for
   * a resolved axis does shift what any *later* unresolved axis in this
   * same call rolls (readiness/bustRisk/trajectory share one sequential
   * stream) - an accepted, narrow consequence of resolving one axis, not a
   * bug: nothing ever promised those draws were independent, and the
   * empty-`resolvedAxes` default path (every existing call site) is
   * untouched byte-for-byte.
   */
  resolvedAxes: readonly ResolvableHiddenAxis[] = [],
  /** Scouting Pillar Redesign - class character variance's injuryRiskDelta (see classCharacter.ts), 0 for a BALANCED class. */
  injuryRiskDelta = 0,
): ScoutingReport {
  const clampedDepth = Math.max(0, Math.min(3, Math.round(depth)));
  const reliability = RELIABILITY_BY_DEPTH[clampedDepth];
  const rng = createSeededRandom(`${prospect.id}-scouting-report:depth-${clampedDepth}`);
  const resolved = new Set(resolvedAxes);

  const bustRisk = scoutedLabel(
    trueBustRisk(prospect.overallRating, prospect.potentialRating, prospect.age),
    ["LOW", "MODERATE", "HIGH"],
    reliability,
    rng,
  );
  const trajectory = scoutedLabel(
    trueTrajectory(prospect.overallRating, prospect.age),
    ["AHEAD_OF_SCHEDULE", "ON_TRACK", "RAW_PROJECT"],
    reliability,
    rng,
  );
  const workEthic = resolved.has("WORK_ETHIC")
    ? trueWorkEthic(prospect.id)
    : scoutedLabel(
        trueWorkEthic(prospect.id),
        ["HIGHLY_MOTIVATED", "SOLID_WORKER", "QUESTION_MARKS"],
        reliability,
        rng,
      );
  const readiness = scoutedLabel(
    trueReadiness(prospect.overallRating, prospect.age),
    ["READY_NOW", "ONE_TO_TWO_YEARS", "MULTI_YEAR_PROJECT"],
    reliability,
    rng,
  );
  const injuryOutlook = resolved.has("INJURY_OUTLOOK")
    ? trueInjuryOutlook(prospect.id, injuryRiskDelta)
    : scoutedLabel(
        trueInjuryOutlook(prospect.id, injuryRiskDelta),
        ["DURABLE", "SOME_CONCERN", "RED_FLAGS"],
        reliability,
        rng,
      );

  const spread = CEILING_RANGE_BY_DEPTH[clampedDepth];
  const ceilingRangeLabel =
    spread <= 0
      ? `${prospect.potentialRating}`
      : `${Math.max(60, prospect.potentialRating - spread)}-${Math.min(99, prospect.potentialRating + spread)}`;

  return {
    bustRisk,
    trajectory,
    workEthic,
    readiness,
    injuryOutlook,
    ceilingRangeLabel,
    confidence: CONFIDENCE_BY_DEPTH[clampedDepth],
  };
}
