/**
 * What earns a place at the top of the wire.
 *
 * The news page used to be one chronological list where a franchise-altering
 * trade and a note that a bench player is mildly unhappy were siblings, one
 * pixel apart. Importance existed in the data and changed a row's typography,
 * but never its *placement* - so a MAJOR story eighty rows down was invisible,
 * and runs of morale notes could own the top of the screen purely by being
 * most recent.
 *
 * This module decides prominence from three things the engine already knows:
 * how big the story is, what kind of story it is, and how recently it filed.
 * Kept pure so the hierarchy is something we can assert on rather than
 * something that emerges from CSS.
 */

export interface RankableStory {
  id: string;
  type: string;
  description: string;
  importance: string;
  season: number;
  teamIds: string[];
  tradeId?: string | null;
  /** Day of the season, or null for anything with no game day. See newsDay.ts. */
  dayIndex?: number | null;
}

/**
 * Measured across a full save: BREAKING is ~0.2% of rows, MAJOR ~7%, and
 * MINOR/STANDARD the remaining ~90%. The gaps are wide on purpose - a single
 * BREAKING row should outrank any amount of routine traffic, and no quantity
 * of MINOR rows should ever add up to a lead story.
 */
const IMPORTANCE_WEIGHT: Record<string, number> = {
  BREAKING: 1000,
  MAJOR: 220,
  STANDARD: 60,
  MINOR: 8,
};

/**
 * Not every STANDARD row is equally newsworthy. A trade at STANDARD is still
 * a roster change a reader wants; a morale tick at STANDARD is ambient. This
 * multiplies the importance weight rather than replacing it, so the engine's
 * own judgement still dominates and this only breaks ties within a tier.
 */
const TYPE_WEIGHT: Record<string, number> = {
  // Genuine league news.
  TRADE: 1.6,
  RETIREMENT: 1.5,
  DRAFT_LOTTERY: 1.4,
  AWARD: 1.4,
  SIGNING: 1.3,
  DRAFT_SELECTION: 1.2,
  ALL_STAR_RESULT: 1.2,
  ALL_STAR_SELECTION: 1.0,
  OWNERSHIP_MESSAGE: 1.0,
  STAFF_FIRE: 1.0,
  STAFF_HIRE: 0.9,
  FRANCHISE_MILESTONE: 0.9,
  INJURY: 0.9,
  ALL_STAR_SNUB: 0.8,
  GAME_MILESTONE: 0.7,
  FINANCIAL_REPORT: 0.6,
  WIN_STREAK: 0.5,
  GAME_RESULT: 0.4,
  // Ambient. Real signal for the team involved, not front-page material.
  ROTATION_CHANGE: 0.25,
  PLAYER_MORALE: 0.15,
};

const DEFAULT_TYPE_WEIGHT = 0.8;

/**
 * Rows arrive newest-first and simulation writes hundreds of them inside the
 * same real-world second, so `createdAt` cannot order stories within a burst.
 * Position in the already-sorted list is the only honest recency signal we
 * have. Half-weight every 40 rows: recent enough to keep the page current,
 * shallow enough that a genuinely big story from earlier still beats fresh
 * noise.
 */
const RECENCY_HALF_LIFE_ROWS = 40;

function recencyFactor(index: number): number {
  return Math.pow(0.5, index / RECENCY_HALF_LIFE_ROWS);
}

/** Your own franchise's news matters more to you than the same story elsewhere. */
const OWN_TEAM_BONUS = 1.35;

export function scoreStory(story: RankableStory, index: number, userTeamId: string | null): number {
  const importance = IMPORTANCE_WEIGHT[story.importance] ?? IMPORTANCE_WEIGHT.STANDARD;
  const type = TYPE_WEIGHT[story.type] ?? DEFAULT_TYPE_WEIGHT;
  const mine = userTeamId && story.teamIds.includes(userTeamId) ? OWN_TEAM_BONUS : 1;
  return importance * type * recencyFactor(index) * mine;
}

/**
 * A story has to clear a real bar to be promoted out of the chronological
 * feed. Set just above a fresh STANDARD trade (60 x 1.6 = 96) so the top of
 * the page stays empty on a quiet week rather than promoting whatever
 * happened to be least boring. An empty lead is a truthful lead.
 */
const HEADLINE_THRESHOLD = 100;

export interface RankedNews {
  /** The single biggest story, or null when nothing has earned it. */
  lead: RankableStory | null;
  /** Runners-up worth surfacing above the feed. Never padded to fill space. */
  topStories: RankableStory[];
  /** The user's own franchise, newest first, excluding anything already promoted. */
  franchise: RankableStory[];
  /** Everything, in the order it filed. Promotion does not remove a row from the record. */
  wire: RankableStory[];
}

export function rankNews(
  stories: RankableStory[],
  options: { userTeamId: string | null; maxTopStories?: number; maxFranchise?: number },
): RankedNews {
  const { userTeamId, maxTopStories = 4, maxFranchise = 6 } = options;

  const scored = stories
    .map((story, index) => ({ story, score: scoreStory(story, index, userTeamId) }))
    .filter((s) => s.score >= HEADLINE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const lead = scored.length > 0 ? scored[0].story : null;
  const topStories = scored.slice(1, 1 + maxTopStories).map((s) => s.story);

  const promoted = new Set<string>([...(lead ? [lead.id] : []), ...topStories.map((s) => s.id)]);

  const franchise = userTeamId
    ? stories
        .filter((s) => s.teamIds.includes(userTeamId) && !promoted.has(s.id))
        .slice(0, maxFranchise)
    : [];

  // The wire keeps everything. Promotion is about where a reader's eye lands
  // first, not about hiding rows from the record.
  return { lead, topStories, franchise, wire: stories };
}
