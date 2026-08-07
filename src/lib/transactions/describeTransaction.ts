import { formatCentsCompact } from "@/lib/money";

/** A single side's identity for a trade headline: a team label and the players/picks it sent away. */
export interface TradeSide {
  teamLabel: string;
  sentAssetNames: string[];
}

/**
 * "Bulls traded X and Y to the Lakers for Z" - straight cash/no-return trades
 * ("Bulls traded X to the Lakers") are phrased without "for" since there's
 * nothing to name on the other side.
 */
export function describeTrade(a: TradeSide, b: TradeSide): string {
  const aSent = joinNames(a.sentAssetNames);
  const bSent = joinNames(b.sentAssetNames);

  if (a.sentAssetNames.length > 0 && b.sentAssetNames.length > 0) {
    return `${a.teamLabel} traded ${aSent} to the ${b.teamLabel} for ${bSent}`;
  }
  if (a.sentAssetNames.length > 0) {
    return `${a.teamLabel} traded ${aSent} to the ${b.teamLabel}`;
  }
  return `${b.teamLabel} traded ${bSent} to the ${a.teamLabel}`;
}

/** "Bulls signed X to a 3-year, $48.7M deal" (or "a 1-year deal" for single-season, salary omitted only if zero). */
export function describeSigning(
  teamLabel: string,
  playerName: string,
  years: number,
  totalSalaryCents: bigint | number,
): string {
  const yearLabel = years === 1 ? "1-year" : `${years}-year`;
  return `${teamLabel} signed ${playerName} to a ${yearLabel}, ${formatCentsCompact(totalSalaryCents)} deal`;
}

/** "X has retired after N seasons with the Bulls" / "X has retired as a free agent" if unrostered. */
export function describeRetirement(playerName: string, teamLabel: string | null): string {
  return teamLabel
    ? `${playerName} has announced their retirement from the ${teamLabel}`
    : `${playerName} has announced their retirement`;
}

/** "Bulls hired X as their new Head Coach" */
export function describeStaffHire(teamLabel: string, staffName: string, roleLabel: string): string {
  return `${teamLabel} hired ${staffName} as their new ${roleLabel}`;
}

/** "Bulls fired X as Head Coach" */
export function describeStaffFire(teamLabel: string, staffName: string, roleLabel: string): string {
  return `${teamLabel} fired ${staffName} as ${roleLabel}`;
}

/** Only fired for a genuine starter/bench boundary crossing - see src/lib/actions/rotation.ts. */
export function describeRotationChange(
  teamLabel: string,
  playerName: string,
  movedToStarting: boolean,
): string {
  return movedToStarting
    ? `${playerName} earns a spot in the ${teamLabel} starting lineup`
    : `${playerName} moves to the bench for the ${teamLabel}`;
}

/** Only fired for a genuine, threshold-clearing reach - see src/lib/draft/draftNightNarrative.ts. */
export function describeDraftReach(
  teamLabel: string,
  playerName: string,
  pickNumber: number,
  expectedRank: number,
): string {
  return `${teamLabel} reach for ${playerName} at pick ${pickNumber} - most boards had him closer to No. ${expectedRank}`;
}

// Steals get a pathway clause for the three lower-visibility origins only -
// a Power Conference prospect sliding is just as real a story, but doesn't
// need an explanatory "out of the X ranks" clause the way an under-scouted
// pathway does.
const STEAL_PATHWAY_CLAUSE_LABEL: Partial<Record<string, string>> = {
  MID_MAJOR: "Mid-Major",
  INTERNATIONAL_PROFESSIONAL: "international",
  DEVELOPMENT_PATHWAY: "Development Pathway",
};

/**
 * Only fired for a genuine, threshold-clearing slide - see
 * src/lib/draft/draftNightNarrative.ts. `pathway`, if given (Scouting
 * Pillar Redesign, Phase 4), adds a one-clause reason a low-visibility
 * pathway can plausibly explain a real slide.
 */
export function describeDraftSteal(
  teamLabel: string,
  playerName: string,
  pickNumber: number,
  expectedRank: number,
  pathway?: string | null,
): string {
  const clauseLabel = pathway ? STEAL_PATHWAY_CLAUSE_LABEL[pathway] : undefined;
  const pathwayClause = clauseLabel ? ` out of the ${clauseLabel} ranks` : "";
  return `${playerName}${pathwayClause}, projected around No. ${expectedRank}, falls all the way to pick ${pickNumber} - a real steal for ${teamLabel}`;
}

/** The category of event behind a PLAYER_MORALE story - only fired for a meaningfully-sized delta, see MORALE_NEWS_THRESHOLD in src/lib/morale/moraleEvents.ts. */
export type MoraleEventReason =
  | "ROLE_INCREASE"
  | "ROLE_DECREASE"
  | "MINUTES_SHORTFALL"
  | "TEAM_PERFORMANCE_UP"
  | "TEAM_PERFORMANCE_DOWN"
  | "CONTRACT_UNDERPAID"
  | "COACH_QUALITY";

const MORALE_EVENT_REASON_PHRASE: Record<MoraleEventReason, string> = {
  ROLE_INCREASE: "an expanded role",
  ROLE_DECREASE: "a reduced role",
  MINUTES_SHORTFALL: "not getting the minutes he was promised",
  TEAM_PERFORMANCE_UP: "the team's strong recent play",
  TEAM_PERFORMANCE_DOWN: "the team's recent struggles",
  CONTRACT_UNDERPAID: "feeling underpaid relative to his market value",
  COACH_QUALITY: "the quality of his coaching staff",
};

/** "X is pleased with an expanded role in Boston" / "X is growing frustrated with a reduced role in Boston." */
export function describePlayerMoraleEvent(
  playerName: string,
  teamLabel: string,
  reason: MoraleEventReason,
  direction: "up" | "down",
): string {
  const phrase = MORALE_EVENT_REASON_PHRASE[reason];
  return direction === "up"
    ? `${playerName} is pleased with ${phrase} on the ${teamLabel}`
    : `${playerName} is growing frustrated with ${phrase} on the ${teamLabel}`;
}

/** Fired once, when sustained dissatisfaction actually escalates - see shouldActivateTradeRequest. */
export function describeTradeRequest(playerName: string, teamLabel: string): string {
  return `${playerName} has requested a trade away from ${teamLabel}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
