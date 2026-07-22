import { createSeededRandom } from "@/lib/contracts/seededRandom";

/**
 * Participants are chosen from real season 3PT volume and efficiency
 * blended together (not "highest overall rating") - a specialist who
 * shoots a lot and shoots well ranks above a low-volume high-rated star
 * who rarely takes threes, matching how real contest invites work.
 */
const MIN_3PA_FOR_ELIGIBILITY = 80;
const HIGH_VOLUME_3PA = 300; // normalizes the volume component; well above a typical season total
const PARTICIPANTS = 8;

const VOLUME_WEIGHT = 0.15;
const EFFICIENCY_WEIGHT = 0.75;
const REPUTATION_WEIGHT = 0.1;

export interface ThreePointCandidate {
  leaguePlayerId: string;
  fg3Made: number;
  fg3Attempted: number;
  overallRating: number;
}

export interface ThreePointParticipant {
  leaguePlayerId: string;
  fg3Pct: number;
}

function contestScore(p: ThreePointCandidate): number {
  const fg3Pct = p.fg3Made / p.fg3Attempted;
  const volume = Math.min(p.fg3Attempted / HIGH_VOLUME_3PA, 1);
  return (
    fg3Pct * EFFICIENCY_WEIGHT +
    volume * VOLUME_WEIGHT +
    (p.overallRating / 100) * REPUTATION_WEIGHT
  );
}

export function selectThreePointParticipants(
  candidates: ThreePointCandidate[],
): ThreePointParticipant[] {
  return candidates
    .filter((p) => p.fg3Attempted >= MIN_3PA_FOR_ELIGIBILITY)
    .sort((a, b) => contestScore(b) - contestScore(a))
    .slice(0, PARTICIPANTS)
    .map((p) => ({ leaguePlayerId: p.leaguePlayerId, fg3Pct: p.fg3Made / p.fg3Attempted }));
}

function triangular(rng: () => number, spread: number): number {
  return (rng() + rng() - 1) * spread;
}

const RACKS_PER_ROUND = 25;

export interface ThreePointRoundResult {
  round: number;
  scores: { leaguePlayerId: string; score: number }[];
  advanced: string[];
}

export interface ThreePointContestResult {
  rounds: ThreePointRoundResult[];
  championId: string | null;
}

/**
 * Round-by-round, not possession-by-possession: each rack score is the
 * player's real season 3P% applied to a fixed 25-ball rack plus bounded
 * variance (same triangular-variance convention boxScore.ts uses for
 * in-game shooting noise), not a simulated shot-by-shot sequence. Field
 * halves each round until a two-player final decides the champion.
 */
export function simulateThreePointContest(
  participants: ThreePointParticipant[],
  seed: string,
): ThreePointContestResult {
  if (participants.length === 0) return { rounds: [], championId: null };

  const rng = createSeededRandom(seed);
  const pctById = new Map(participants.map((p) => [p.leaguePlayerId, p.fg3Pct]));

  let field = [...participants];
  const rounds: ThreePointRoundResult[] = [];
  let roundNum = 1;

  while (field.length > 1) {
    const scores = field
      .map((p) => ({
        leaguePlayerId: p.leaguePlayerId,
        score: Math.round(
          Math.max(0, Math.min(1, p.fg3Pct + triangular(rng, 0.12))) * RACKS_PER_ROUND,
        ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (pctById.get(b.leaguePlayerId) ?? 0) - (pctById.get(a.leaguePlayerId) ?? 0) ||
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
