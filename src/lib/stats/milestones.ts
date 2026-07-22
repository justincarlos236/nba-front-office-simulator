/**
 * Pure milestone/record detection over box-score lines (see
 * src/lib/simulation/boxScore.ts for how these are generated). Decoupled
 * from Prisma's `PlayerGameStat` shape so these stay trivially unit
 * testable - callers pass whichever subset of fields they have.
 */

export interface StatLine {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
}

const DOUBLE_DIGIT_THRESHOLD = 10;
export const SCORING_MILESTONES = [40, 50, 60] as const;

function doubleDigitCategoryCount(line: StatLine): number {
  const categories = [line.points, line.rebounds, line.assists, line.steals, line.blocks];
  return categories.filter((v) => v >= DOUBLE_DIGIT_THRESHOLD).length;
}

export function isDoubleDouble(line: StatLine): boolean {
  return doubleDigitCategoryCount(line) >= 2;
}

export function isTripleDouble(line: StatLine): boolean {
  return doubleDigitCategoryCount(line) >= 3;
}

/** The highest scoring milestone this game reached (40/50/60+), or null if none. */
export function scoringMilestone(points: number): (typeof SCORING_MILESTONES)[number] | null {
  let reached: (typeof SCORING_MILESTONES)[number] | null = null;
  for (const threshold of SCORING_MILESTONES) {
    if (points >= threshold) reached = threshold;
  }
  return reached;
}

export interface CareerHighs {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
}

/** The best single-game value in each category across a player's known game log so far. */
export function computeCareerHighs(games: StatLine[]): CareerHighs | null {
  if (games.length === 0) return null;
  return games.reduce<CareerHighs>(
    (highs, g) => ({
      points: Math.max(highs.points, g.points),
      rebounds: Math.max(highs.rebounds, g.rebounds),
      assists: Math.max(highs.assists, g.assists),
      steals: Math.max(highs.steals, g.steals),
      blocks: Math.max(highs.blocks, g.blocks),
    }),
    { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0 },
  );
}
