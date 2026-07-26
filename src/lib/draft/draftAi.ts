import {
  playerFillsNeed,
  NEED_FIT_BONUS_MULTIPLIER,
  type TradePlayerAsset,
} from "../trade/evaluateTradeOffer";
import type { TeamIdentity } from "../gm/teamIdentity";
import type { TeamNeed } from "../gm/teamNeeds";
import type { GmPersonality } from "../gm/gmPersonality";

/**
 * Draft Experience Redesign - CPU draft-pick selection, replacing the old
 * pure best-`overallRating`-available logic. Reuses the same team-
 * perspective primitives the trade AI already established
 * (`TeamIdentity`/`TeamNeed`/`GmPersonality`/`playerFillsNeed`) rather than
 * inventing a parallel evaluation system - a draft pick is just a one-
 * sided "would we want this asset" decision, the same shape
 * `reSigningDecision.ts` already adapted those primitives for.
 *
 * Selection is the strict argmax of `scoreProspectForTeam` - there is no
 * separate scripted "reach roll." Reaches, slides, and high-upside project
 * picks all emerge naturally from real per-team scoring differences (a
 * rebuilding team's formula genuinely values a raw, high-potential prospect
 * over a safer, lower-ceiling one; a team with a real positional need
 * genuinely values a need-filling prospect over a marginally-better-rated
 * one elsewhere). See `draftNightNarrative.ts` for how that emergent
 * outcome gets narrated into news, never scripted independently of it.
 *
 * Scouting Pillar Redesign (Phase 3, docs/SCOUTING_PILLAR_DESIGN.md Part
 * 3.1) mentions the Big Board could "give CPU teams something honest to
 * draft from" - deliberately not done here. CPU selection still scores off
 * true `overallRating`/`potentialRating`, unchanged. Rewiring an
 * established, carefully-tuned AI system (reach/slide/steal narrative
 * generation all depend on its current behavior) wasn't part of what Phase
 * 3 was scoped to build, and doing it well would be its own real design
 * pass, not a drive-by change alongside the Big Board's introduction.
 */

export interface DraftAiTeamContext {
  identity: TeamIdentity;
  needs: TeamNeed[];
  personality: GmPersonality;
}

export interface DraftAiProspect {
  id: string;
  position: "PG" | "SG" | "SF" | "PF" | "C";
  overallRating: number;
  potentialRating: number;
}

const WIN_NOW_WEIGHTS = { overall: 0.75, potential: 0.25 };
const REBUILDING_WEIGHTS = { overall: 0.4, potential: 0.6 };
const BASELINE_WEIGHTS = { overall: 0.6, potential: 0.4 };

// Only archetypes with a real draft-value analog get a further nudge on
// top of the identity-driven baseline - AGGRESSIVE/PICK_HOARDER/
// SALARY_CONSCIOUS/BALANCED fall back to that baseline unchanged. A
// documented, honest scope choice: those archetypes' defining trait
// (risk tolerance, reluctance to trade picks, cap sensitivity) has no
// natural analog in "which prospect do we pick," unlike PROSPECT_LOVER's
// upside preference or WIN_NOW/CONSERVATIVE's floor preference.
const PERSONALITY_POTENTIAL_MULTIPLIER: Partial<Record<GmPersonality, number>> = {
  PROSPECT_LOVER: 1.15,
};
const PERSONALITY_OVERALL_MULTIPLIER: Partial<Record<GmPersonality, number>> = {
  WIN_NOW: 1.1,
  CONSERVATIVE: 1.1,
};

// AGGRESSIVE teams get a wider noise band, giving that archetype a real,
// higher chance of a genuine reach - not a separate mechanic, just a
// wider spread on the same noise term everyone else gets.
const BASE_NOISE_MAGNITUDE = 0.06;
const AGGRESSIVE_NOISE_MAGNITUDE = 0.1;

function isWinNow(identity: TeamIdentity): boolean {
  return identity === "CONTENDER" || identity === "PLAYOFF_TEAM";
}
function isRebuilding(identity: TeamIdentity): boolean {
  return identity === "REBUILDING" || identity === "TANKING";
}

function asTradeAsset(prospect: DraftAiProspect): TradePlayerAsset {
  // playerFillsNeed only ever reads position + overallRating - the rest of
  // TradePlayerAsset is irrelevant here, so these are inert placeholders,
  // not meaningful values.
  return {
    type: "PLAYER",
    overallRating: prospect.overallRating,
    potentialRating: prospect.potentialRating,
    age: 20,
    position: prospect.position,
    currentSalaryCents: 0n,
    injuryStatus: "HEALTHY",
    careerGamesMissedToInjury: 0,
  };
}

/**
 * How much this team values one candidate prospect - higher is better.
 * Not a trade-value dollar figure (there's no second side to compare
 * against here), just a per-team relative ranking over the available
 * board.
 */
export function scoreProspectForTeam(
  prospect: DraftAiProspect,
  team: DraftAiTeamContext,
  rng: () => number,
): number {
  const weights = isWinNow(team.identity)
    ? { ...WIN_NOW_WEIGHTS }
    : isRebuilding(team.identity)
      ? { ...REBUILDING_WEIGHTS }
      : { ...BASELINE_WEIGHTS };

  const potentialMultiplier = PERSONALITY_POTENTIAL_MULTIPLIER[team.personality];
  if (potentialMultiplier) weights.potential *= potentialMultiplier;
  const overallMultiplier = PERSONALITY_OVERALL_MULTIPLIER[team.personality];
  if (overallMultiplier) weights.overall *= overallMultiplier;

  let score =
    prospect.overallRating * weights.overall + prospect.potentialRating * weights.potential;

  if (team.needs.some((need) => playerFillsNeed(asTradeAsset(prospect), need))) {
    score *= NEED_FIT_BONUS_MULTIPLIER;
  }

  const noiseMagnitude =
    team.personality === "AGGRESSIVE" ? AGGRESSIVE_NOISE_MAGNITUDE : BASE_NOISE_MAGNITUDE;
  score *= 1 + (rng() - 0.5) * noiseMagnitude;

  return score;
}

/** Strict argmax of `scoreProspectForTeam` over the available board. */
export function pickBestProspectForTeam<T extends DraftAiProspect>(
  available: T[],
  team: DraftAiTeamContext,
  rng: () => number,
): T {
  if (available.length === 0) {
    throw new Error("pickBestProspectForTeam called with an empty board");
  }
  let best = available[0];
  let bestScore = scoreProspectForTeam(best, team, rng);
  for (let i = 1; i < available.length; i++) {
    const candidate = available[i];
    const candidateScore = scoreProspectForTeam(candidate, team, rng);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }
  return best;
}
