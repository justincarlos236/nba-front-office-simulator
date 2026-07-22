/**
 * Fan reactions are a consumer of the existing LeagueTransaction/news log,
 * not a second event-detection system - this reads the exact same rows
 * NewsFeed already surfaces, scoped to one team's season. A trade's actual
 * direction (good or bad for this team) isn't structured data on a
 * LeagueTransaction row, so TRADE registers as buzz/excitement rather than
 * approval/disapproval - a deliberate, honest simplification rather than
 * guessing at outcome quality from a free-text description. INJURY is a
 * narrow, deliberate exception: `src/lib/actions/leagueEvents.ts` always
 * generates the exact same fixed phrase for a recovery ("...has been
 * cleared to return from injury."), so recognizing that one known,
 * deterministic template isn't guessing - it's reading a fixed string,
 * the same category of thing as reading `type` itself.
 */
export interface SentimentTransaction {
  type: string; // LeagueTransaction.type
  importance: string; // NewsImportance
  description: string;
}

const INJURY_RECOVERY_PHRASE = "cleared to return from injury";

const BASE_SENTIMENT: Record<string, number> = {
  TRADE: 0.3,
  SIGNING: 0.6,
  RETIREMENT: -0.2,
  INJURY: -0.4,
  OWNERSHIP_MESSAGE: 0,
  GAME_MILESTONE: 0.5,
  WIN_STREAK: 0.7,
  GAME_RESULT: 0.3,
  AWARD: 0.8,
  STAFF_HIRE: 0.2,
  STAFF_FIRE: -0.3,
  // All-Star Weekend (fans are excited by their own team's selections and
  // strong showings, mildly deflated by a snub) - reads the exact same
  // LeagueTransaction rows generateAllStarWeekend/leagueEvents.ts already
  // write, not a separate reaction pipeline.
  ALL_STAR_SELECTION: 0.7,
  ALL_STAR_SNUB: -0.3,
  ALL_STAR_RESULT: 0.5,
};

const INJURY_RECOVERY_SENTIMENT = 0.4;

// Escalating, same intent as NewsFeed's BREAKING/MAJOR visual treatment -
// a bigger story moves the needle more than a routine one.
const IMPORTANCE_WEIGHT: Record<string, number> = {
  MINOR: 0.5,
  STANDARD: 1,
  MAJOR: 1.75,
  BREAKING: 2.5,
};

/** Raw, unclamped sum - the caller (computeFanHappinessDelta) decides how much weight this component gets in the overall score. */
export function computeTransactionSentiment(transactions: SentimentTransaction[]): number {
  let total = 0;
  for (const t of transactions) {
    const isInjuryRecovery = t.type === "INJURY" && t.description.includes(INJURY_RECOVERY_PHRASE);
    const base = isInjuryRecovery ? INJURY_RECOVERY_SENTIMENT : (BASE_SENTIMENT[t.type] ?? 0);
    const weight = IMPORTANCE_WEIGHT[t.importance] ?? 1;
    total += base * weight;
  }
  return total;
}
