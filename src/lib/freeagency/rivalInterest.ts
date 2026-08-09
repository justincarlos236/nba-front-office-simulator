import { getPlayerValueTier } from "@/lib/valuation/playerValueTier";
import type { TeamNeed } from "@/lib/gm/teamNeeds";

/**
 * Which rival teams want a free agent, and how badly.
 *
 * The audit finding: "no competing offers; a free agent waits indefinitely,
 * draining urgency." That is exactly right, and it is the single biggest thing
 * missing from free agency - with nobody else bidding, there is never a reason
 * to decide anything today rather than next week, so the phase has no tension
 * and every signing is a formality.
 *
 * This module supplies the missing pressure as *information*: before you offer,
 * you can see who else is circling. A player three contenders want is a
 * different proposition from one nobody has called about, even at the same
 * price.
 *
 * DERIVED, NEVER STORED. Cap space, roster needs and player ratings all move on
 * their own schedules; persisting an interest level would let it drift out of
 * step with the facts it summarises. This is the same reasoning as
 * `expectationGap.ts`.
 *
 * DELIBERATELY NOT RANDOM. A rival's interest is a function of its cap space,
 * its roster holes and the player's quality - all things the user can inspect
 * and reason about. Rolling dice here would produce urgency the user cannot
 * plan against, which is pressure without strategy.
 */

export type InterestLevel = "none" | "mild" | "real" | "heavy";

export interface RivalTeam {
  leagueTeamId: string;
  /** Abbreviation, for naming the interested clubs on the board. */
  abbreviation: string;
  /** What this team can actually spend, in cents. */
  capSpaceCents: bigint;
  /** Computed by `computeTeamNeeds` against this team's own roster. */
  needs: TeamNeed[];
  /** Active players under contract; a full roster stops shopping. */
  rosterCount: number;
}

export interface InterestedRival {
  leagueTeamId: string;
  abbreviation: string;
  /** Why this team is interested, in the user's terms. */
  reason: "fills a need" | "has the room";
}

export interface RivalInterest {
  level: InterestLevel;
  rivals: InterestedRival[];
}

/**
 * A roster at or above this size is full enough that a team stops bidding on
 * ordinary free agents. Matches the 15-man regular-season limit.
 */
const ROSTER_LIMIT = 15;

/**
 * Which need a player at this position would answer. A player can only satisfy
 * one positional need, but a good enough player answers STAR_SCORER regardless
 * of where he plays.
 */
function needFilledByPosition(position: string): TeamNeed | null {
  switch (position.toUpperCase()) {
    case "PG":
      return "POINT_GUARD";
    case "C":
      return "RIM_PROTECTOR";
    case "SG":
    case "SF":
      return "WING_DEFENDER";
    default:
      return null;
  }
}

export interface FreeAgentForInterest {
  position: string;
  overallRating: number;
  /** What this player is expected to command, in cents. */
  estimatedValueCents: bigint;
}

/**
 * Rival interest in one free agent.
 *
 * A team is a plausible bidder when it can afford the player and has room on
 * the roster. It is a *motivated* bidder when the player also answers a hole it
 * actually has - which is what separates real competition from a team that
 * merely has money left over.
 */
export function computeRivalInterest(
  player: FreeAgentForInterest,
  rivals: RivalTeam[],
): RivalInterest {
  const tier = getPlayerValueTier(player.overallRating);
  const isStar = tier === "SUPERSTAR" || tier === "STAR";
  const positionalNeed = needFilledByPosition(player.position);

  const interested: InterestedRival[] = [];

  for (const rival of rivals) {
    if (rival.rosterCount >= ROSTER_LIMIT) continue;
    if (rival.capSpaceCents < player.estimatedValueCents) continue;

    // A star answers STAR_SCORER for any team lacking one, wherever he plays.
    const fillsStarNeed = isStar && rival.needs.includes("STAR_SCORER");
    const fillsPositionalNeed = positionalNeed !== null && rival.needs.includes(positionalNeed);

    if (fillsStarNeed || fillsPositionalNeed) {
      interested.push({
        leagueTeamId: rival.leagueTeamId,
        abbreviation: rival.abbreviation,
        reason: "fills a need",
      });
    } else {
      interested.push({
        leagueTeamId: rival.leagueTeamId,
        abbreviation: rival.abbreviation,
        reason: "has the room",
      });
    }
  }

  // Teams with a genuine hole to fill lead the list - they are the ones who
  // will actually outbid you, and naming them first is the useful ordering.
  interested.sort((a, b) => {
    if (a.reason === b.reason) return a.abbreviation.localeCompare(b.abbreviation);
    return a.reason === "fills a need" ? -1 : 1;
  });

  return { level: interestLevel(interested), rivals: interested };
}

/**
 * Thresholds are set on *motivated* bidders rather than on raw count, because
 * fifteen teams with spare cap room is not competition - one team that needs a
 * centre is. A single desperate suitor already means you cannot wait.
 */
function interestLevel(interested: InterestedRival[]): InterestLevel {
  if (interested.length === 0) return "none";
  const motivated = interested.filter((r) => r.reason === "fills a need").length;
  if (motivated >= 3) return "heavy";
  if (motivated >= 1) return "real";
  return "mild";
}

export const INTEREST_LABEL: Record<InterestLevel, string> = {
  none: "No reported interest",
  mild: "Some interest",
  real: "Real competition",
  heavy: "Heavy competition",
};

/** Only genuine competition earns visual weight; quiet is the default. */
export const INTEREST_TONE: Record<InterestLevel, "neutral" | "caution" | "negative"> = {
  none: "neutral",
  mild: "neutral",
  real: "caution",
  heavy: "negative",
};
