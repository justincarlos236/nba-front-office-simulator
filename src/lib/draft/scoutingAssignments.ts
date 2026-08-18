import type { DepartmentLevel } from "@/generated/prisma/client";
import type { TeamNeed } from "@/lib/gm/teamNeeds";
import type { ProspectPathway } from "@/lib/draft/prospectBio";
import { createSeededRandom } from "@/lib/contracts/seededRandom";

/**
 * the core loop. The player has a
 * limited number of scouting assignments for the whole pre-draft window
 * (docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.2), determined by their Scouting
 * department level. Each Focused Look spends one assignment to raise one
 * prospect's Scouting Depth by 1, up to MAX_SCOUTING_DEPTH. No weekly
 * refill - see the design doc's Phase 2 refinement: one capacity pool for
 * the whole window, not a new offseason calendar/tick system.
 */

export const MAX_SCOUTING_DEPTH = 3;

export const SCOUTING_DEPTH_LABEL: Record<number, string> = {
  0: "Unknown",
  1: "Seen",
  2: "Studied",
  3: "Known",
};

// STANDARD sits at the department system's own default level (see
// departments.ts) - 12 assignments is enough to reach Known (3 Focused
// Looks) on 4 prospects, or a lighter spread across more, without ever
// covering the full 60-prospect class.
const ASSIGNMENT_CAPACITY_BY_LEVEL: Record<DepartmentLevel, number> = {
  MINIMAL: 4,
  LOW: 8,
  STANDARD: 12,
  HIGH: 16,
  MAXIMUM: 20,
};

export function scoutingAssignmentCapacity(scoutingLevel: DepartmentLevel): number {
  return ASSIGNMENT_CAPACITY_BY_LEVEL[scoutingLevel];
}

/**
 * Assignments already spent this window - the sum of every
 * ScoutingAssignmentSpend row's cost for this league+season+team (see
 * runFocusedLookAction/runSweepAction/runPrivateWorkoutAction, and
 * schema.prisma's comment on why this is a real ledger, not a mutable
 * counter or a derivation off Scouting Depth). Depth alone can't stand in
 * for spend: a Focused Look's cost happens to equal its depth increase,
 * but a Sweep spends 1 for up to SWEEP_TARGET_COUNT prospects' worth of
 * depth, and a Private Workout spends PRIVATE_WORKOUT_COST for zero depth
 * change at all.
 */
export function scoutingAssignmentsSpent(spendCosts: readonly number[]): number {
  return spendCosts.reduce((sum, cost) => sum + cost, 0);
}

export function scoutingAssignmentsRemaining(
  scoutingLevel: DepartmentLevel,
  spendCosts: readonly number[],
): number {
  return scoutingAssignmentCapacity(scoutingLevel) - scoutingAssignmentsSpent(spendCosts);
}

export interface FocusedLookCheck {
  allowed: boolean;
  reason: string | null;
}

/**
 * A Focused Look is only blocked by the two real constraints: no budget
 * left, or the prospect is already at max Depth. Never a UI-only
 * disallow - if this says `allowed`, the server action must succeed.
 */
export function checkFocusedLook(
  currentDepth: number,
  remainingAssignments: number,
): FocusedLookCheck {
  if (currentDepth >= MAX_SCOUTING_DEPTH) {
    return { allowed: false, reason: "Already fully scouted - nothing more to learn here." };
  }
  if (remainingAssignments <= 0) {
    return { allowed: false, reason: "No scouting assignments remaining this window." };
  }
  return { allowed: true, reason: null };
}

export const PRIVATE_WORKOUT_COST = 2;
// Confirmed 2026-08-06: "late window only" (Part 3.3) is defined as
// requiring real prior investment rather than a fake calendar tick - a
// workout is a follow-up on genuine interest, not a first move. This also
// gives the three assignment types a natural escalation: Sweep surfaces a
// name -> Focused Look studies him to here -> Workout de-risks him.
export const PRIVATE_WORKOUT_MIN_DEPTH = 2;

export interface PrivateWorkoutCheck {
  allowed: boolean;
  reason: string | null;
}

export function checkPrivateWorkout(
  currentDepth: number,
  alreadyResolvedAxisCount: number,
  remainingAssignments: number,
): PrivateWorkoutCheck {
  if (currentDepth < PRIVATE_WORKOUT_MIN_DEPTH) {
    return {
      allowed: false,
      reason: "Study this prospect further before requesting a private workout.",
    };
  }
  if (alreadyResolvedAxisCount >= 2) {
    return { allowed: false, reason: "Every hidden trait on this prospect is already resolved." };
  }
  if (remainingAssignments < PRIVATE_WORKOUT_COST) {
    return {
      allowed: false,
      reason: `A private workout costs ${PRIVATE_WORKOUT_COST} assignments - not enough remaining this window.`,
    };
  }
  return { allowed: true, reason: null };
}

// A Sweep "finds nobody deeply" (docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.3) -
// it only ever touches prospects still at Unknown, and only ever raises
// them to Seen. Confirming or deepening a name it surfaced is what
// Focused Look is for.
export const SWEEP_TARGET_COUNT = 5;

export interface SweepableProspect {
  prospectId: string;
  pathway: ProspectPathway;
  currentDepth: number;
}

export interface SweepResult {
  allowed: boolean;
  reason: string | null;
  /** Which prospects would gain +1 Depth (capped at Seen) - empty if not allowed. */
  targetProspectIds: string[];
}

/**
 * A Regional Sweep (docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.3) - 1
 * assignment, shallow Depth on several prospects sharing a pathway. This
 * is where "hidden gem" becomes reachable: a Sweep on an under-scouted
 * pathway (International Professional, Development Pathway) surfaces
 * names a player wasn't already tracking, which Focused Look can then
 * confirm. Deterministic per league+season+pathway+spend-count, so the
 * same sweep never silently re-picks a different set of names if a UI
 * re-renders before the server call resolves.
 */
export function planSweep(
  leagueId: string,
  season: number,
  pathway: ProspectPathway,
  prospects: readonly SweepableProspect[],
  remainingAssignments: number,
  /** How many sweeps have already been run on this exact pathway this window - varies the seed so a second sweep doesn't just re-surface the same names. */
  priorSweepsOnPathway: number,
): SweepResult {
  if (remainingAssignments <= 0) {
    return {
      allowed: false,
      reason: "No scouting assignments remaining this window.",
      targetProspectIds: [],
    };
  }

  const candidates = prospects.filter((p) => p.pathway === pathway && p.currentDepth === 0);
  if (candidates.length === 0) {
    return {
      allowed: false,
      reason: "Every prospect on this pathway has already been scouted at least once.",
      targetProspectIds: [],
    };
  }

  const rng = createSeededRandom(`${leagueId}-${season}-sweep-${pathway}-${priorSweepsOnPathway}`);
  // Fisher-Yates, not `sort(() => rng() - 0.5)` - the sort-comparator trick
  // is a well-known biased shuffle (its distribution depends on the sort
  // algorithm's comparison pattern, not a uniform permutation).
  const shuffled = candidates.map((p) => p.prospectId);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const targetProspectIds = shuffled.slice(0, SWEEP_TARGET_COUNT);

  return { allowed: true, reason: null, targetProspectIds };
}

export interface ScoutableForRecommendation {
  prospectId: string;
  position: string;
  overallRating: number;
  currentDepth: number;
}

/**
 * Recommend mode (docs/design/SCOUTING_PILLAR_DESIGN.md Part 3.5b) - staff propose
 * where to spend the *entire remaining* budget in one pass, weighted toward
 * team needs and the best available talent, so a casual player gets a
 * genuinely useful board in one click rather than a random spread. Deferred
 * from this: any dependency on the Big Board - "Best Player
 * Available" delegation strategy is out of scope until then, so this only
 * ever reasons from `overallRating` (already visible to everyone) and
 * `teamNeeds`.
 *
 * Deterministic and pure: same inputs always produce the same recommended
 * spend, so "accept" and "preview" can never disagree.
 */
export function recommendScoutingAssignments(
  prospects: readonly ScoutableForRecommendation[],
  teamNeeds: readonly TeamNeed[],
  remainingAssignments: number,
): string[] {
  if (remainingAssignments <= 0) return [];

  const needPositions = new Set(teamNeeds.flatMap((need) => TEAM_NEED_POSITIONS[need] ?? []));

  const scored = prospects
    .filter((p) => p.currentDepth < MAX_SCOUTING_DEPTH)
    .map((p) => ({
      prospectId: p.prospectId,
      currentDepth: p.currentDepth,
      // A real need at this prospect's position outweighs a modest rating
      // edge - reflects "fill our needs" reasoning, not just "scout the
      // best players," so recommend mode isn't a silent Best-Player-
      // Available proxy before that mode formally exists.
      score: p.overallRating + (needPositions.has(p.position) ? 12 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.prospectId.localeCompare(b.prospectId));

  const assignments: string[] = [];
  let budget = remainingAssignments;
  // Round-robin one assignment at a time across the top candidates, rather
  // than maxing out the top prospect first - spreads depth so Recommend
  // mode produces a board with several Studied/Known prospects instead of
  // one Known prospect and nothing else, which reads as a more useful
  // "staff did real work" result.
  const pool = scored.slice(0, Math.max(4, Math.ceil(remainingAssignments / MAX_SCOUTING_DEPTH)));
  const remainingDepth = new Map(
    pool.map((p) => [p.prospectId, MAX_SCOUTING_DEPTH - p.currentDepth]),
  );

  while (budget > 0) {
    let assignedThisRound = false;
    for (const p of pool) {
      if (budget <= 0) break;
      const left = remainingDepth.get(p.prospectId) ?? 0;
      if (left <= 0) continue;
      assignments.push(p.prospectId);
      remainingDepth.set(p.prospectId, left - 1);
      budget -= 1;
      assignedThisRound = true;
    }
    if (!assignedThisRound) break;
  }

  return assignments;
}

const TEAM_NEED_POSITIONS: Record<TeamNeed, string[]> = {
  STAR_SCORER: ["SG", "SF"],
  POINT_GUARD: ["PG"],
  RIM_PROTECTOR: ["C"],
  WING_DEFENDER: ["SF", "SG"],
  BENCH_DEPTH: ["PG", "SG", "SF", "PF", "C"],
};
