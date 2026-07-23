/**
 * The fan "reaction feed" is a rendering layer over the existing
 * LeagueTransaction log, not a second event-generation system - every
 * story here already exists as real news (src/components/news/NewsFeed.tsx
 * surfaces the same rows). This deliberately starts conservative: a fixed
 * tone-based phrase per transaction type, not persistent individual fan
 * personas - see docs/ARCHITECTURE.md's Fan engagement section.
 */
export type ReactionTone = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

export interface ReactionTransaction {
  type: string; // LeagueTransaction.type
  description: string;
}

// OWNERSHIP_MESSAGE has no entry - it's not a fan-facing story (ownership
// talks to the GM, not the fanbase), so the lookup below returns
// undefined for it and describeFanReaction correctly yields null.
const REACTION_PHRASE: Record<string, { tone: ReactionTone; phrase: string } | undefined> = {
  TRADE: { tone: "NEUTRAL", phrase: "Fans are buzzing" },
  SIGNING: { tone: "POSITIVE", phrase: "Fans are excited" },
  RETIREMENT: { tone: "NEGATIVE", phrase: "Fans are reflecting on a bittersweet goodbye" },
  INJURY: { tone: "NEGATIVE", phrase: "Fans are anxious" },
  GAME_MILESTONE: { tone: "POSITIVE", phrase: "Fans are celebrating" },
  WIN_STREAK: { tone: "POSITIVE", phrase: "Fans are electric" },
  GAME_RESULT: { tone: "NEUTRAL", phrase: "Fans are talking about it" },
  AWARD: { tone: "POSITIVE", phrase: "Fans are proud" },
  STAFF_HIRE: { tone: "POSITIVE", phrase: "Fans are optimistic" },
  STAFF_FIRE: { tone: "NEGATIVE", phrase: "Fans are uneasy" },
  ALL_STAR_SELECTION: { tone: "POSITIVE", phrase: "Fans are thrilled" },
  ALL_STAR_SNUB: { tone: "NEGATIVE", phrase: "Fans are frustrated" },
  ALL_STAR_RESULT: { tone: "POSITIVE", phrase: "Fans are celebrating" },
  // No entry needed for ROTATION_CHANGE itself - direction (promotion vs.
  // demotion) is read from the fixed phrase below, same exception as
  // injury recovery.
};

// A narrow, deliberate exception to "don't parse free text" - the injury
// system (src/lib/actions/leagueEvents.ts) always generates this exact
// fixed phrase for a recovery, so recognizing it isn't guessing, it's
// reading a known deterministic template. Without this, a "cleared to
// return" story would wrongly read as bad news via the generic INJURY
// entry above.
const INJURY_RECOVERY_PHRASE = "cleared to return from injury";
const INJURY_RECOVERY_REACTION = { tone: "POSITIVE" as const, phrase: "Fans are relieved" };

// describeRotationChange (src/lib/transactions/describeTransaction.ts)
// always generates one of exactly two fixed phrases - same deterministic-
// template exception as injury recovery, not guessing at outcome quality.
const ROTATION_PROMOTION_PHRASE = "earns a spot in the";
const ROTATION_PROMOTION_REACTION = { tone: "POSITIVE" as const, phrase: "Fans are excited" };
const ROTATION_DEMOTION_REACTION = {
  tone: "NEGATIVE" as const,
  phrase: "Fans are second-guessing the move",
};

export function describeFanReaction(
  transaction: ReactionTransaction,
): { tone: ReactionTone; text: string } | null {
  let entry: { tone: ReactionTone; phrase: string } | undefined;
  if (transaction.type === "INJURY" && transaction.description.includes(INJURY_RECOVERY_PHRASE)) {
    entry = INJURY_RECOVERY_REACTION;
  } else if (transaction.type === "ROTATION_CHANGE") {
    entry = transaction.description.includes(ROTATION_PROMOTION_PHRASE)
      ? ROTATION_PROMOTION_REACTION
      : ROTATION_DEMOTION_REACTION;
  } else {
    entry = REACTION_PHRASE[transaction.type];
  }
  if (!entry) return null;
  return { tone: entry.tone, text: `${entry.phrase}: ${transaction.description}` };
}
