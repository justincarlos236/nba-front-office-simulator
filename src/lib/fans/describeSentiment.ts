/**
 * Fans Page Redesign (Phase 1) - human-readable descriptions for sentiment
 * ledger rows, written at the moment the event happens (same convention as
 * LeagueTransaction.description: a past event's wording is fixed when it
 * occurs and shouldn't change if the world moves on around it).
 *
 * The point of this module is the fix for the redesign's sharpest criticism
 * (docs/FANS_PAGE_REDESIGN.md Part 2.3): the old fanReactions.ts emitted
 * "Fans are buzzing" for *every* trade, whether you fleeced a rival or
 * gutted the roster - even though the delta that says which already existed.
 * Everything here reads the real delta and says what the fanbase actually
 * thinks. Pure string-building; no sentiment is computed or re-judged here.
 */

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export interface TradeSentimentDescriptionInput {
  delta: number;
  sentNames: string[];
  acquiredNames: string[];
}

// Thresholds for how strongly the fanbase read the deal, on
// computeTradeSentimentDelta's own -6..+6 scale (TRADE_SENTIMENT_CAP).
const TRADE_STRONG = 4;
const TRADE_MILD = 1;

export function describeTradeSentiment(input: TradeSentimentDescriptionInput): string {
  const got = input.acquiredNames.length > 0 ? joinNames(input.acquiredNames) : "draft capital";
  const gave = input.sentNames.length > 0 ? joinNames(input.sentNames) : "draft capital";
  const swap = `Traded ${gave} for ${got}`;

  if (input.delta >= TRADE_STRONG) return `${swap} - fans think you robbed them.`;
  if (input.delta >= TRADE_MILD) return `${swap} - fans liked the move.`;
  if (input.delta <= -TRADE_STRONG) return `${swap} - fans are furious about it.`;
  if (input.delta <= -TRADE_MILD) return `${swap} - fans aren't sold on it.`;
  return `${swap} - fans shrugged.`;
}

export interface SigningSentimentDescriptionInput {
  playerName: string;
  isReSigning: boolean;
  delta: number;
}

const SIGNING_BIG = 4;

export function describeSigningSentiment(input: SigningSentimentDescriptionInput): string {
  const verb = input.isReSigning ? "Re-signed" : "Signed";
  if (input.delta >= SIGNING_BIG) {
    return `${verb} ${input.playerName} - the city is genuinely thrilled.`;
  }
  if (input.isReSigning) return `${verb} ${input.playerName} - fans wanted him kept.`;
  return `${verb} ${input.playerName}.`;
}

export function describeStreakSentiment(length: number, isWinStreak: boolean): string {
  return isWinStreak
    ? `A ${length}-game winning streak has the building rocking.`
    : `A ${length}-game losing streak has fans losing patience.`;
}

export function describeInjurySentiment(playerName: string, isRecovery: boolean): string {
  return isRecovery
    ? `${playerName} is back from injury - a real lift.`
    : `${playerName} went down injured.`;
}

export function describeStaffSentiment(coachName: string, isHire: boolean, delta: number): string {
  if (isHire) {
    return delta >= 0
      ? `Hired ${coachName} as head coach - fans approve.`
      : `Hired ${coachName} as head coach - the fanbase is unconvinced.`;
  }
  return delta >= 0
    ? `Fired ${coachName} - fans had seen enough.`
    : `Fired ${coachName} - a popular coach, and fans noticed.`;
}

export function describeRotationSentiment(playerName: string, promoted: boolean): string {
  return promoted
    ? `${playerName} moved into the starting lineup - fans had been asking for it.`
    : `${playerName} lost his starting spot - not a popular call.`;
}

export function describeAwardSentiment(playerName: string, awardLabel: string): string {
  return `${playerName} won ${awardLabel} - the city is proud.`;
}

export function describeAllStarSelectionSentiment(playerName: string): string {
  return `${playerName} made the All-Star team.`;
}

export function describeAllStarSnubSentiment(playerName: string): string {
  return `${playerName} was snubbed from the All-Star team - fans are annoyed.`;
}

export function describeAllStarResultSentiment(playerName: string): string {
  return `${playerName} put on a show at All-Star Weekend.`;
}

export function describeLotterySentiment(movement: number, wonNumberOne: boolean): string {
  if (wonNumberOne) return `Won the draft lottery - the city is buzzing about the future.`;
  if (movement > 0) return `Jumped up ${movement} spots in the draft lottery.`;
  if (movement < 0) return `Fell ${Math.abs(movement)} spots in the draft lottery.`;
  return `The draft lottery landed exactly where the odds said it would.`;
}
