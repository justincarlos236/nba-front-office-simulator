import { createSeededRandom, randomInRange } from "@/lib/contracts/seededRandom";

/**
 * A player's persistent behavioral traits (Player Morale & Personality
 * System) - generated once, when the LeaguePlayer row is created, and
 * never changed afterward. Four independent axes rather than a single
 * archetype (contrast GmPersonality) so two players can differ in degree,
 * not just category - composes cleanly into morale-delta math in
 * src/lib/morale/moraleEvents.ts.
 */
export interface PlayerPersonalityAxes {
  /** How much team success/direction fit weighs on this player's morale. */
  competitiveness: number;
  /** How much a role/minutes change weighs on this player's morale. */
  roleSensitivity: number;
  /** Higher = slower to escalate dissatisfaction, more forgiving of a rough patch. */
  loyalty: number;
  /** How much pay/contract situations weigh on this player's morale. */
  financialMotivation: number;
}

// Bounded away from the true 0/100 extremes (same instinct as staff
// quality's 60-99 range) so no axis ever reads as literally "doesn't
// matter at all" or "the only thing that matters."
const MIN_AXIS_VALUE = 10;
const MAX_AXIS_VALUE = 95;

/** Deterministic per-player generation, seeded off the LeaguePlayer id so re-reads never drift and re-simulating a league produces the same personalities. */
export function generatePersonalityProfile(leaguePlayerId: string): PlayerPersonalityAxes {
  const rng = createSeededRandom(`${leaguePlayerId}-personality`);
  return {
    competitiveness: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
    roleSensitivity: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
    loyalty: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
    financialMotivation: Math.round(randomInRange(rng, MIN_AXIS_VALUE, MAX_AXIS_VALUE)),
  };
}

export interface PersonalityLabel {
  label: string;
  description: string;
}

const HIGH_THRESHOLD = 65;
const LOW_THRESHOLD = 35;

/**
 * A purely cosmetic label derived from the underlying axes on read, never
 * stored - same "derive a label from real data" pattern as
 * getPlayerValueTier/getFranchisePopularityTier. Checked in order of how
 * distinctive the combination is; falls through to a neutral label when
 * nothing stands out.
 */
export function describePersonalityLabel(axes: PlayerPersonalityAxes): PersonalityLabel {
  const highCompetitive = axes.competitiveness >= HIGH_THRESHOLD;
  const lowCompetitive = axes.competitiveness <= LOW_THRESHOLD;
  const highRoleSensitive = axes.roleSensitivity >= HIGH_THRESHOLD;
  const lowRoleSensitive = axes.roleSensitivity <= LOW_THRESHOLD;
  const highLoyalty = axes.loyalty >= HIGH_THRESHOLD;
  const lowLoyalty = axes.loyalty <= LOW_THRESHOLD;
  const lowFinancial = axes.financialMotivation <= LOW_THRESHOLD;
  const highFinancial = axes.financialMotivation >= HIGH_THRESHOLD;

  if (highCompetitive && lowFinancial) {
    return { label: "Ring Chaser", description: "Winning matters more to him than the paycheck." };
  }
  if (highFinancial && lowLoyalty) {
    return {
      label: "Mercenary",
      description: "Follows the biggest contract with little attachment to any one team.",
    };
  }
  if (lowRoleSensitive && highLoyalty) {
    return {
      label: "Professional",
      description: "Accepts whatever role the team needs without complaint.",
    };
  }
  if (highRoleSensitive && highCompetitive) {
    return {
      label: "Alpha",
      description: "Expects to be a featured piece, especially on a team trying to win now.",
    };
  }
  if (highLoyalty && lowCompetitive) {
    return {
      label: "Company Man",
      description: "Values stability with one organization over the scoreboard.",
    };
  }
  if (highRoleSensitive && lowLoyalty) {
    return {
      label: "Diva",
      description: "Quick to sour if his role or minutes take a hit.",
    };
  }
  return {
    label: "Even-Keeled",
    description: "No single priority dominates how he sees his career.",
  };
}
