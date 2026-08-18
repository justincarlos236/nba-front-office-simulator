/**
 * plain-language labels for the three Fan
 * Culture traits, and the "why" text the page uses to explain each trait
 * with real facts rather than a bare 0-100 number. Pure presentation; the
 * numbers themselves come from src/lib/fans/fanCulture.ts.
 */

export type CultureTierLabel = "VERY_LOW" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

function tierFor(value: number): CultureTierLabel {
  if (value >= 80) return "VERY_HIGH";
  if (value >= 60) return "HIGH";
  if (value >= 40) return "MODERATE";
  if (value >= 20) return "LOW";
  return "VERY_LOW";
}

export const PATIENCE_TIER_LABEL: Record<CultureTierLabel, string> = {
  VERY_HIGH: "Extremely Patient",
  HIGH: "Patient",
  MODERATE: "Reasonably Patient",
  LOW: "Impatient",
  VERY_LOW: "Out of Patience",
};

export const PATIENCE_TIER_DESCRIPTION: Record<CultureTierLabel, string> = {
  VERY_HIGH: "This city will stick with a rebuild for years without complaint.",
  HIGH: "This city trusts a real plan, even through a rough stretch.",
  MODERATE: "This city will give a rebuild some time, but not forever.",
  LOW: "This city wants to see progress soon, or the mood turns fast.",
  VERY_LOW: "This city has run out of patience - a bad season costs you more than it used to.",
};

export const CEILING_TIER_LABEL: Record<CultureTierLabel, string> = {
  VERY_HIGH: "Championship-or-Bust",
  HIGH: "Contender Expected",
  MODERATE: "Competitive Expected",
  LOW: "Modest Expectations",
  VERY_LOW: "Low Expectations",
};

export const CEILING_TIER_DESCRIPTION: Record<CultureTierLabel, string> = {
  VERY_HIGH: "Nothing short of a championship reads as real success here.",
  HIGH: "This city expects genuine contention - a good-not-great season won't satisfy them.",
  MODERATE: "This city wants real competitiveness, not just effort.",
  LOW: "This city isn't demanding much right now - the bar is forgiving.",
  VERY_LOW: "This city has stopped expecting much - which is its own kind of problem.",
};

export const LOYALTY_TIER_LABEL: Record<CultureTierLabel, string> = {
  VERY_HIGH: "Fiercely Loyal",
  HIGH: "Loyal",
  MODERATE: "Reasonably Attached",
  LOW: "Fickle",
  VERY_LOW: "Ready to Walk Away",
};

export const LOYALTY_TIER_DESCRIPTION: Record<CultureTierLabel, string> = {
  VERY_HIGH: "This fanbase doesn't spike or crater - they're with you through almost anything.",
  HIGH: "This fanbase gives you real benefit of the doubt.",
  MODERATE: "This fanbase's mood swings roughly in proportion to what actually happens.",
  LOW: "This fanbase turns quickly - good news and bad news both hit harder than normal.",
  VERY_LOW: "This fanbase has one foot out the door - happiness swings hard in both directions.",
};

export function patienceTier(value: number): CultureTierLabel {
  return tierFor(value);
}
export function ceilingTier(value: number): CultureTierLabel {
  return tierFor(value);
}
export function loyaltyTier(value: number): CultureTierLabel {
  return tierFor(value);
}
