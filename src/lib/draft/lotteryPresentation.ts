import { LOTTERY_ODDS, type LotteryTeam } from "./draftLottery";

/**
 * Pure presentation helpers for the Draft Lottery Experience - none of
 * this touches the actual lottery math (`runLottery`/`computeDraftOrder`
 * are untouched); this only decides how to honestly frame stakes and
 * movement around a result that's already been decided.
 */

export interface LotteryOverviewEntry extends LotteryTeam {
  oddsForNumberOnePickPct: number;
}

/** Zips each seeded lottery team with its real, published odds of landing pick 1 - the pre-reveal overview's data. */
export function getLotteryOverview(seededTeams: LotteryTeam[]): LotteryOverviewEntry[] {
  return seededTeams.map((t) => ({ ...t, oddsForNumberOnePickPct: LOTTERY_ODDS[t.seed] ?? 0 }));
}

// Pick 1's baseline potential is 97 (see generateDraftClass.ts) with +/-6
// variance - 95 sits at the real top of what an ordinary class can
// produce, so only a class that's genuinely a cut above gets called
// "generational," never a manufactured storyline.
const HEADLINE_PROSPECT_POTENTIAL_THRESHOLD = 95;

export interface HeadlineProspectInput {
  fullName: string;
  position: string;
  potentialRating: number;
}

/** The single highest-potential prospect in the class, only surfaced as a real storyline above a genuine threshold - never manufactured for a class that doesn't support it. */
export function detectHeadlineProspect<T extends HeadlineProspectInput>(
  prospects: readonly T[],
): T | null {
  if (prospects.length === 0) return null;
  const best = prospects.reduce((a, b) => (b.potentialRating > a.potentialRating ? b : a));
  return best.potentialRating >= HEADLINE_PROSPECT_POTENTIAL_THRESHOLD ? best : null;
}

// A team has to move at least this many spots (in either direction) for
// it to be a real story, not just the ordinary lottery shuffle.
const NOTABLE_MOVEMENT_THRESHOLD = 4;

export interface LotteryMovementInput {
  projectedSeed: number;
  resultPickNumber: number;
}

/** Positive = jumped up (a better/lower pick number than the team's seed implied); negative = fell. */
export function computeMovement(input: LotteryMovementInput): number {
  return input.projectedSeed - input.resultPickNumber;
}

export interface NotableMovement<T> {
  team: T;
  movement: number;
}

/** The biggest real jump and the biggest real fall in a lottery result, each only reported if it actually clears the threshold - most lotteries will have one, the other, both, or neither. */
export function detectNotableMovement<T extends LotteryMovementInput>(
  results: readonly T[],
): { biggestJump: NotableMovement<T> | null; biggestFall: NotableMovement<T> | null } {
  let biggestJump: NotableMovement<T> | null = null;
  let biggestFall: NotableMovement<T> | null = null;

  for (const team of results) {
    const movement = computeMovement(team);
    if (
      movement >= NOTABLE_MOVEMENT_THRESHOLD &&
      (!biggestJump || movement > biggestJump.movement)
    ) {
      biggestJump = { team, movement };
    }
    if (
      -movement >= NOTABLE_MOVEMENT_THRESHOLD &&
      (!biggestFall || movement < biggestFall.movement)
    ) {
      biggestFall = { team, movement };
    }
  }

  return { biggestJump, biggestFall };
}
