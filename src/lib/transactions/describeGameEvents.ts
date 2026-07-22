import { isTripleDouble, scoringMilestone, type StatLine } from "@/lib/stats/milestones";
import type { NewsImportance } from "@/generated/prisma/client";

export interface DescribedEvent {
  description: string;
  importance: NewsImportance;
}

export interface MilestoneGameContext extends StatLine {
  playerName: string;
  teamLabel: string;
}

/** A real, box-score-backed scoring outburst and/or triple-double - null if this game earned neither. */
export function describeMilestoneGame(ctx: MilestoneGameContext): DescribedEvent | null {
  const milestone = scoringMilestone(ctx.points);
  const tripleDouble = isTripleDouble(ctx);

  if (milestone && tripleDouble) {
    return {
      description: `${ctx.playerName} exploded for ${ctx.points} points, ${ctx.rebounds} rebounds, and ${ctx.assists} assists in a stunning triple-double for the ${ctx.teamLabel}`,
      importance: milestone >= 50 ? "BREAKING" : "MAJOR",
    };
  }
  if (milestone) {
    return {
      description:
        milestone >= 50
          ? `${ctx.playerName} erupted for ${ctx.points} points for the ${ctx.teamLabel} in a historic scoring outburst`
          : `${ctx.playerName} poured in ${ctx.points} points for the ${ctx.teamLabel}`,
      importance: milestone >= 60 ? "BREAKING" : milestone >= 50 ? "MAJOR" : "STANDARD",
    };
  }
  if (tripleDouble) {
    return {
      description: `${ctx.playerName} recorded a triple-double (${ctx.points} pts, ${ctx.rebounds} reb, ${ctx.assists} ast) for the ${ctx.teamLabel}`,
      importance: "STANDARD",
    };
  }
  return null;
}

const STANDARD_WIN_STREAK = 5;
const MAJOR_WIN_STREAK = 10;
const BREAKING_WIN_STREAK_STEP = 5; // every 5 beyond MAJOR_WIN_STREAK (15, 20, 25...) is its own BREAKING story
const STANDARD_LOSS_STREAK = -5;
const MAJOR_LOSS_STREAK = -10;

/**
 * Fires only on the exact game a threshold is first crossed (the caller
 * passes each game's streak value one at a time within a batch, not just
 * the batch's final total), so a team doesn't get double-announced for
 * blowing past 10 straight to 12 without stopping.
 */
export function describeWinStreak(teamLabel: string, streak: number): DescribedEvent | null {
  if (streak === STANDARD_WIN_STREAK) {
    return {
      description: `The ${teamLabel} have won ${streak} straight games`,
      importance: "STANDARD",
    };
  }
  if (streak === MAJOR_WIN_STREAK) {
    return {
      description: `The ${teamLabel} have won ${streak} consecutive games - one of the league's hottest runs this season`,
      importance: "MAJOR",
    };
  }
  if (streak > MAJOR_WIN_STREAK && (streak - MAJOR_WIN_STREAK) % BREAKING_WIN_STREAK_STEP === 0) {
    return {
      description: `The ${teamLabel} have now won ${streak} straight games - a franchise-defining streak`,
      importance: "BREAKING",
    };
  }
  if (streak === STANDARD_LOSS_STREAK) {
    return {
      description: `The ${teamLabel} have dropped ${Math.abs(streak)} straight games`,
      importance: "STANDARD",
    };
  }
  if (streak === MAJOR_LOSS_STREAK) {
    return {
      description: `The ${teamLabel} have lost ${Math.abs(streak)} consecutive games, sinking further into a rough stretch`,
      importance: "MAJOR",
    };
  }
  return null;
}

// simulateGame.ts's own MAX_MARGIN is 22 - a fixed ceiling in this
// lightweight, non-possession-based engine - so "notable blowout" has to
// be calibrated against that real range, not an arbitrary NBA-scale margin.
const NOTABLE_BLOWOUT_MARGIN = 20;
const STANDARD_UPSET_PROBABILITY = 0.25;
const MAJOR_UPSET_PROBABILITY = 0.12;

/** A real upset (the winner was a real underdog) or a blowout (margin near this engine's realistic ceiling) - null if the game was unremarkable. */
export function describeGameResult(
  winnerLabel: string,
  loserLabel: string,
  winnerWinProbability: number,
  margin: number,
): DescribedEvent | null {
  if (winnerWinProbability < MAJOR_UPSET_PROBABILITY) {
    return {
      description: `${winnerLabel} pulled off a stunning upset over the ${loserLabel}, who were heavily favored`,
      importance: "MAJOR",
    };
  }
  if (winnerWinProbability < STANDARD_UPSET_PROBABILITY) {
    return {
      description: `${winnerLabel} upset the ${loserLabel} as clear underdogs`,
      importance: "STANDARD",
    };
  }
  if (margin >= NOTABLE_BLOWOUT_MARGIN) {
    return {
      description: `${winnerLabel} blew out the ${loserLabel} in a dominant, ${margin}-point statement win`,
      importance: "STANDARD",
    };
  }
  return null;
}
