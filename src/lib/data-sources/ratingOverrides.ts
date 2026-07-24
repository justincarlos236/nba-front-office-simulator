/**
 * The minimal consensus override layer. Applied on top of the box-score seed
 * model at dataset-build time (never at runtime - the final overridden rating
 * is baked into the dataset). The model establishes the whole league's shape;
 * these few entries correct the marquee names where a box-score-only model
 * can't (a superstar whose injury-shortened season the sample-size regression
 * unfairly discounts, or the exact ordering at the very top). Keep the list as
 * short as genuinely necessary.
 */
import { normalizePlayerName } from "./normalizeName";
import overridesRaw from "./ratingOverrides.json";

// Normalize keys on load so the JSON can use human-readable names. The
// leading "_comment" (and any non-numeric value) is ignored.
const OVERRIDES: ReadonlyMap<string, number> = new Map(
  Object.entries(overridesRaw)
    .filter(([, v]) => typeof v === "number")
    .map(([name, target]) => [normalizePlayerName(name), target as number]),
);

export interface OverrideResult {
  rating: number;
  applied: boolean;
}

/** Returns the consensus target for a player if one exists, else the model rating unchanged. */
export function applyRatingOverride(fullName: string, modelRating: number): OverrideResult {
  const target = OVERRIDES.get(normalizePlayerName(fullName));
  return target === undefined
    ? { rating: modelRating, applied: false }
    : { rating: target, applied: true };
}

/** Count of active overrides - surfaced in the dataset audit. */
export function overrideCount(): number {
  return OVERRIDES.size;
}

/** The normalized override keys, for validation (e.g. flag an override that matched nobody). */
export function overrideKeys(): string[] {
  return [...OVERRIDES.keys()];
}
