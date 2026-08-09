import { createSeededRandom } from "@/lib/contracts/seededRandom";
import { resolvePlayerAge } from "@/lib/players/age";
import type { Position } from "@/generated/prisma/client";

/**
 * No real "dunking ability" attribute exists anywhere in this codebase
 * (confirmed during the All-Star Weekend overlap review) and none is
 * invented here. Participant selection instead uses a clearly synthetic,
 * **non-persisted** "dunk appeal" composite computed fresh each time this
 * runs, from data that's honestly available (age, position, reputation)
 * plus a seeded per-player flair roll - flavor, not a tracked skill. It
 * never touches the database and has no bearing on any other system.
 */
const GUARD_WING_POSITIONS = new Set<Position>(["PG", "SG", "SF"]);
const YOUNGEST_RELEVANT_AGE = 20;
const OLDEST_RELEVANT_AGE = 32;

const AGE_WEIGHT = 0.35;
const POSITION_WEIGHT = 0.2;
const REPUTATION_WEIGHT = 0.25;
const FLAIR_WEIGHT = 0.2;

const PARTICIPANTS = 4;

export interface DunkContestCandidate {
  leaguePlayerId: string;
  position: Position;
  /** Both age sources - see `resolvePlayerAge`; birthDate is exact where present. */
  draftYear: number | null;
  birthDate: Date | null;
  overallRating: number;
}

export interface DunkContestParticipant {
  leaguePlayerId: string;
  dunkAppeal: number;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function dunkAppealOf(p: DunkContestCandidate, season: number, seed: string): number {
  const age = resolvePlayerAge(p, season);
  const ageComponent = clamp01(
    (OLDEST_RELEVANT_AGE - age) / (OLDEST_RELEVANT_AGE - YOUNGEST_RELEVANT_AGE),
  );
  const positionComponent = GUARD_WING_POSITIONS.has(p.position) ? 1 : 0.4;
  const reputationComponent = p.overallRating / 100;
  const flair = createSeededRandom(`${seed}-flair-${p.leaguePlayerId}`)();

  return (
    ageComponent * AGE_WEIGHT +
    positionComponent * POSITION_WEIGHT +
    reputationComponent * REPUTATION_WEIGHT +
    flair * FLAIR_WEIGHT
  );
}

export function selectDunkContestParticipants(
  candidates: DunkContestCandidate[],
  season: number,
  seed: string,
): DunkContestParticipant[] {
  return candidates
    .map((p) => ({ leaguePlayerId: p.leaguePlayerId, dunkAppeal: dunkAppealOf(p, season, seed) }))
    .sort((a, b) => b.dunkAppeal - a.dunkAppeal)
    .slice(0, PARTICIPANTS);
}

function triangular(rng: () => number, spread: number): number {
  return (rng() + rng() - 1) * spread;
}

const MAX_DUNK_SCORE = 50;
const BASE_DUNK_SCORE = 30;

export interface DunkRoundResult {
  round: number;
  scores: { leaguePlayerId: string; score: number }[];
  advanced: string[];
}

export interface DunkContestResult {
  rounds: DunkRoundResult[];
  championId: string | null;
}

/**
 * Simple scored rounds (0-50 judged score per player, not a play-by-play
 * of individual dunks): field of 4 halves to a 2-player final, highest
 * score each round advances. Same triangular-variance convention used
 * elsewhere in this codebase for judged/random outcomes.
 */
export function simulateDunkContest(
  participants: DunkContestParticipant[],
  seed: string,
): DunkContestResult {
  if (participants.length === 0) return { rounds: [], championId: null };

  const rng = createSeededRandom(seed);
  const appealById = new Map(participants.map((p) => [p.leaguePlayerId, p.dunkAppeal]));

  let field = [...participants];
  const rounds: DunkRoundResult[] = [];
  let roundNum = 1;

  while (field.length > 1) {
    const scores = field
      .map((p) => ({
        leaguePlayerId: p.leaguePlayerId,
        score: Math.round(
          Math.max(
            0,
            Math.min(MAX_DUNK_SCORE, BASE_DUNK_SCORE + p.dunkAppeal * 20 + triangular(rng, 6)),
          ),
        ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (appealById.get(b.leaguePlayerId) ?? 0) - (appealById.get(a.leaguePlayerId) ?? 0) ||
          a.leaguePlayerId.localeCompare(b.leaguePlayerId),
      );

    const advanceCount = Math.max(1, Math.ceil(field.length / 2));
    const advanced = scores.slice(0, advanceCount).map((s) => s.leaguePlayerId);
    rounds.push({ round: roundNum, scores, advanced });

    field = field.filter((p) => advanced.includes(p.leaguePlayerId));
    roundNum++;
  }

  return { rounds, championId: field[0].leaguePlayerId };
}
