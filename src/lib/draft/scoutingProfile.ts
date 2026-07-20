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
  return Math.max(25, Math.min(99, Math.round(value)));
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
